import { filter, map, Observable } from 'rxjs'
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
  ConnectionState,
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
  describeStreamFrame,
  isKlineEvent,
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
const snapshotRetryBaseMs = 1_000
const snapshotRetryMaximumMs = 15_000

interface CatalogCacheEntry {
  loadedAt: number
  expiresAt: number
  items: MarketPair[]
}

interface ExchangeInfoPayload {
  symbols?: BinanceExchangeSymbol[]
}

function snapshotRetryDelay(attempt: number): number {
  const exponent = Math.min(Math.max(attempt - 1, 0), 4)
  return Math.min(
    snapshotRetryBaseMs * (2 ** exponent),
    snapshotRetryMaximumMs,
  )
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
  // Under load and behind rate limiting the edge answers 200 with an HTML
  // page. Naming the endpoint turns an opaque parser message into something
  // that says which request failed.
  return await response.json().catch(() => {
    throw new Error(`Resposta da Binance não é JSON: ${url}`)
  }) as T
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
    /*
     * A frame that is not a kline is skipped, never thrown. Throwing errors
     * the observable, which tears the socket down and reconnects with backoff
     * — and the next connection receives the same frame, so the chart stops
     * updating for good over one unexpected message.
     */
    return websocketJSON$<unknown>(streamURL, onState).pipe(
      filter((event) => {
        if (isKlineEvent(event)) {
          return true
        }
        onState({ state: 'connected', message: describeStreamFrame(event) })
        return false
      }),
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
      let snapshotInFlight = false
      let disposed = false
      let socketConnected = false
      let socketGeneration = 0
      let snapshotRetryAttempt = 0
      let snapshotRetryTimer: ReturnType<typeof setTimeout> | undefined
      let bookReady = false

      function clearSnapshotRetry(): void {
        if (snapshotRetryTimer !== undefined) {
          clearTimeout(snapshotRetryTimer)
          snapshotRetryTimer = undefined
        }
      }

      function reportResynchronising(message: string): void {
        onState({ state: 'reconnecting', message })
      }

      function resetLocalBook(): void {
        bookReady = false
        book.reset()
      }

      function isCurrentSocketGeneration(generation: number): boolean {
        return !disposed
          && socketConnected
          && generation === socketGeneration
      }

      function scheduleSnapshot(delayMs: number): void {
        if (
          disposed
          || !socketConnected
          || snapshotInFlight
          || snapshotRetryTimer !== undefined
        ) {
          return
        }
        if (delayMs <= 0) {
          void resynchronise()
          return
        }
        snapshotRetryTimer = setTimeout(() => {
          snapshotRetryTimer = undefined
          void resynchronise()
        }, delayMs)
      }

      function scheduleSnapshotRetry(message: string): void {
        if (disposed || !socketConnected) {
          return
        }
        resetLocalBook()
        snapshotRetryAttempt += 1
        reportResynchronising(message)
        scheduleSnapshot(snapshotRetryDelay(snapshotRetryAttempt))
      }

      async function resynchronise(): Promise<void> {
        if (snapshotInFlight || disposed) {
          return
        }
        const generation = socketGeneration
        snapshotInFlight = true
        // Events collected during a previous retry delay cannot bridge the
        // snapshot fetched now. Retain only those arriving while this request
        // is in flight, as prescribed by Binance's synchronization sequence.
        resetLocalBook()
        let failureMessage: string | undefined
        try {
          const snapshot = normalizeDepthSnapshot(await fetchJSON<unknown>(
            `${endpoint.rest}/depth?symbol=${symbol}`
            + `&limit=${SNAPSHOT_LIMIT[market]}`,
          ))
          const currentSocket = isCurrentSocketGeneration(generation)
          if (currentSocket && !book.applySnapshot(snapshot)) {
            failureMessage = 'Snapshot não alcançou a sequência atual do livro'
          } else if (currentSocket) {
            snapshotRetryAttempt = 0
          }
        } catch (error) {
          failureMessage = error instanceof Error
            ? error.message
            : String(error)
        } finally {
          snapshotInFlight = false
        }
        if (disposed || !socketConnected) {
          return
        }
        if (!isCurrentSocketGeneration(generation)) {
          // A new socket opened while this request was in flight. Its open
          // callback could not start another request while a snapshot was in
          // flight, so hand ownership to that generation now.
          scheduleSnapshot(0)
        } else if (failureMessage) {
          scheduleSnapshotRetry(failureMessage)
        }
      }

      function emitSnapshot(eventTime: number): void {
        const rows = options.rowsPerSide()
        const step = options.aggregationStep()
        // Pull more raw levels than rows: aggregation merges many into one.
        const depth = Math.max(rows, Math.min(rows * 200, 4_000))
        const best = book.best(depth)
        const snapshot = buildOrderBookSnapshot(
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
        )
        if (!bookReady) {
          bookReady = true
          onState({ state: 'connected' })
        }
        subscriber.next(snapshot)
      }

      function handleSocketState(state: ConnectionState): void {
        if (state.state === 'connected') {
          socketConnected = true
          socketGeneration += 1
          snapshotRetryAttempt = 0
          clearSnapshotRetry()
          resetLocalBook()
          scheduleSnapshot(0)
          return
        }

        socketConnected = false
        socketGeneration += 1
        clearSnapshotRetry()
        resetLocalBook()
        onState(state)
      }

      function handleDepthEvent(event: unknown): void {
        if (!socketConnected) {
          return
        }
        // During backoff there is deliberately no buffer. Only events
        // received while the REST snapshot is in flight are relevant.
        if (!snapshotInFlight && !book.isSynchronised) {
          return
        }
        const update = normalizeDepthUpdate(event)
        const outcome = book.apply(update)
        if (outcome.status === 'desynchronised') {
          resetLocalBook()
          snapshotRetryAttempt = 0
          reportResynchronising(outcome.reason)
          scheduleSnapshot(0)
          return
        }
        if (outcome.status === 'applied') {
          emitSnapshot(update.eventTime)
        }
      }

      function handleStreamError(error: unknown): void {
        subscriber.error(error)
      }

      const subscription = websocketJSON$<unknown>(
        streamURL,
        handleSocketState,
      )
        .subscribe({
          next: handleDepthEvent,
          error: handleStreamError,
        })

      return () => {
        disposed = true
        clearSnapshotRetry()
        subscription.unsubscribe()
        resetLocalBook()
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
