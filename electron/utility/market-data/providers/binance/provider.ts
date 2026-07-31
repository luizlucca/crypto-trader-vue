import { map, Observable } from 'rxjs'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookLevel,
  OrderBookSnapshot,
} from '@shared/types/market'
import type {
  CandleHistoryOptions,
  CatalogOptions,
  ConnectionStateHandler,
  MarketDataProvider,
  OrderBookStreamOptions,
} from '../../provider'
import { aggregateOrderBookLevels } from '@shared/domain/orderBook'
import { BinanceOrderBook, SNAPSHOT_LIMIT } from './orderBookSync'
import { endpointsFor } from './endpoints'
import {
  buildOrderBookSnapshot,
  mergeCatalog,
  normalizeCandleRow,
  normalizeDepthSnapshot,
  normalizeDepthUpdate,
  normalizeExchangeSymbols,
  normalizeKlineEvent,
  type BinanceExchangeSymbol,
  type BinanceTicker24h,
} from './normalizers'
import {
  normalizeSymbol,
  validateCandleLimit,
  validateInterval,
} from './validation'
import { websocketJSON$ } from './websocket'

const catalogTTL = 60 * 60 * 1_000
const requestTimeout = 12_000

interface CatalogCacheEntry {
  loadedAt: number
  expiresAt: number
  items: MarketPair[]
}

interface ExchangeInfoPayload {
  symbols?: BinanceExchangeSymbol[]
}

/** The local book stores `[price, quantity]`; aggregation wants levels. */
function toLevels(entries: [number, number][]): OrderBookLevel[] {
  return entries.map(([price, quantity]) => ({ price, quantity, total: 0 }))
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(requestTimeout),
  })
  if (!response.ok) {
    throw new Error(`Binance retornou HTTP ${response.status} para ${url}`)
  }
  return response.json() as Promise<T>
}

export class BinanceProvider implements MarketDataProvider {
  readonly name = 'binance'
  private readonly catalogs = new Map<Market, CatalogCacheEntry>()
  private readonly catalogFlights = new Map<Market, Promise<CatalogCacheEntry>>()

  async getCatalog(options: CatalogOptions): Promise<MarketCatalog> {
    const quoteAsset = options.quoteAsset.trim().toUpperCase()
    const now = Date.now()
    const cachedEntry = this.catalogs.get(options.market)
    if (
      !options.forceRefresh
      && cachedEntry
      && cachedEntry.expiresAt > now
    ) {
      return this.catalogResult(
        options.market,
        quoteAsset,
        cachedEntry,
        true,
        false,
      )
    }

    try {
      const entry = await this.refreshCatalog(options.market)
      return this.catalogResult(
        options.market,
        quoteAsset,
        entry,
        false,
        false,
      )
    } catch (error) {
      if (!cachedEntry) {
        throw error
      }
      return this.catalogResult(
        options.market,
        quoteAsset,
        cachedEntry,
        true,
        true,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  async getSymbols(
    market: Market,
    quoteAsset: string,
  ): Promise<MarketSymbol[]> {
    const catalog = await this.getCatalog({
      market,
      quoteAsset: quoteAsset || 'USDT',
      forceRefresh: false,
    })
    return catalog.items.map((item) => ({
      provider: item.provider,
      market: item.market,
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      status: item.status,
      priceTickSize: item.priceTickSize,
      pricePrecision: item.pricePrecision,
      quantityPrecision: item.quantityPrecision,
    }))
  }

  async getCandles(
    selection: MarketSelection,
    options: CandleHistoryOptions,
  ): Promise<Candle[]> {
    const symbol = normalizeSymbol(selection.symbol)
    validateInterval(selection.interval)
    const normalizedLimit = validateCandleLimit(options.limit)
    const endpoint = endpointsFor(selection.market)
    const query = new URLSearchParams({
      symbol,
      interval: selection.interval,
      limit: String(normalizedLimit),
    })
    if (options.before !== undefined) {
      query.set(
        'endTime',
        String(Math.max(0, Math.trunc(options.before * 1_000) - 1)),
      )
    }
    const rows = await fetchJSON<unknown[][]>(
      `${endpoint.rest}/klines?${query.toString()}`,
    )
    if (!Array.isArray(rows)) {
      throw new Error('Resposta de candles da Binance não é uma lista')
    }
    const now = Date.now()
    return rows.map((row) => normalizeCandleRow(
      row,
      selection.market,
      symbol,
      selection.interval,
      now,
    ))
  }

  streamCandles(
    selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Observable<Candle> {
    const symbol = normalizeSymbol(selection.symbol)
    validateInterval(selection.interval)
    const endpoint = endpointsFor(selection.market)
    const streamURL = `${endpoint.marketWebSocket}/${
      symbol.toLowerCase()
    }@kline_${selection.interval}`
    return websocketJSON$<unknown>(streamURL, onState).pipe(
      map((event) => normalizeKlineEvent(event, selection.market)),
    )
  }

  /**
   * Keeps a full local book from a REST snapshot plus the diff stream, and
   * emits only the aggregated rows the interface shows.
   *
   * The previous implementation used `@depth20`, whose twenty levels collapse
   * into a handful of rows once prices are grouped into wider buckets. The
   * partial stream cannot go deeper than twenty, so the local book is the only
   * way to keep every row filled at any aggregation (F-013).
   */
  streamOrderBook(
    selection: MarketSelection,
    onState: ConnectionStateHandler,
    options: OrderBookStreamOptions,
  ): Observable<OrderBookSnapshot> {
    const symbol = normalizeSymbol(selection.symbol)
    const market = selection.market
    const endpoint = endpointsFor(market)
    const streamURL = `${endpoint.publicWebSocket}/${
      symbol.toLowerCase()
    }@depth@100ms`

    return new Observable<OrderBookSnapshot>((subscriber) => {
      const book = new BinanceOrderBook(market)
      let resyncing = false
      let disposed = false

      const resynchronise = async (): Promise<void> => {
        if (resyncing || disposed) {
          return
        }
        resyncing = true
        try {
          // Retried by the caller's reconnect policy if it throws.
          const snapshot = normalizeDepthSnapshot(await fetchJSON<unknown>(
            `${endpoint.rest}/depth?symbol=${symbol}`
            + `&limit=${SNAPSHOT_LIMIT[market]}`,
          ))
          if (disposed) {
            return
          }
          if (!book.applySnapshot(snapshot)) {
            // The buffered events could not bridge the gap; try a newer one.
            resyncing = false
            void resynchronise()
            return
          }
        } catch (error) {
          if (!disposed) {
            onState({
              state: 'reconnecting',
              message: error instanceof Error ? error.message : String(error),
            })
          }
        } finally {
          resyncing = false
        }
      }

      const emit = (eventTime: number): void => {
        const rows = options.rowsPerSide()
        const step = options.aggregationStep()
        // Pull more raw levels than rows: aggregation merges many into one.
        const depth = Math.max(rows, Math.min(rows * 200, 4_000))
        const best = book.best(depth)
        subscriber.next(buildOrderBookSnapshot(
          market,
          symbol,
          eventTime,
          book.lastAppliedUpdateId,
          aggregateOrderBookLevels(
            toLevels(best.bids), 'bid', step, selection.pricePrecision,
          ).slice(0, rows),
          aggregateOrderBookLevels(
            toLevels(best.asks), 'ask', step, selection.pricePrecision,
          ).slice(0, rows),
        ))
      }

      const subscription = websocketJSON$<unknown>(streamURL, onState)
        .subscribe({
          next: (event) => {
            const update = normalizeDepthUpdate(event)
            const outcome = book.apply(update)
            if (outcome.status === 'desynchronised') {
              onState({ state: 'reconnecting', message: outcome.reason })
              book.reset()
              void resynchronise()
              return
            }
            if (outcome.status === 'applied') {
              emit(update.eventTime)
            }
          },
          error: (error) => subscriber.error(error),
        })

      void resynchronise()

      return () => {
        disposed = true
        subscription.unsubscribe()
        book.reset()
      }
    })
  }

  private async refreshCatalog(market: Market): Promise<CatalogCacheEntry> {
    const activeFlight = this.catalogFlights.get(market)
    if (activeFlight) {
      return activeFlight
    }

    const flight = this.fetchCatalog(market)
      .then((items) => {
        const loadedAt = Date.now()
        const entry = {
          loadedAt,
          expiresAt: loadedAt + catalogTTL,
          items,
        }
        this.catalogs.set(market, entry)
        return entry
      })
      .finally(() => {
        this.catalogFlights.delete(market)
      })
    this.catalogFlights.set(market, flight)
    return flight
  }

  private async fetchCatalog(market: Market): Promise<MarketPair[]> {
    const endpoint = endpointsFor(market)
    const [exchangeInfo, tickers] = await Promise.all([
      fetchJSON<ExchangeInfoPayload>(`${endpoint.rest}/exchangeInfo`),
      fetchJSON<BinanceTicker24h[]>(`${endpoint.rest}/ticker/24hr`),
    ])
    if (!Array.isArray(exchangeInfo.symbols) || !Array.isArray(tickers)) {
      throw new Error('Catálogo Binance retornou um formato inválido')
    }
    return mergeCatalog(
      normalizeExchangeSymbols(market, exchangeInfo.symbols),
      tickers,
    )
  }

  private catalogResult(
    market: Market,
    quoteAsset: string,
    entry: CatalogCacheEntry,
    cached: boolean,
    stale: boolean,
    warning?: string,
  ): MarketCatalog {
    return {
      provider: this.name,
      market,
      quoteAsset,
      items: quoteAsset
        ? entry.items.filter((item) => item.quoteAsset === quoteAsset)
        : [...entry.items],
      loadedAt: entry.loadedAt,
      expiresAt: entry.expiresAt,
      cached,
      stale,
      warning,
    }
  }
}
