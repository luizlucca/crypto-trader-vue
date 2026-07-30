import { map, type Observable } from 'rxjs'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
} from '../../../../../src/types/market'
import type {
  CandleHistoryOptions,
  CatalogOptions,
  ConnectionStateHandler,
  MarketDataProvider,
} from '../../provider'
import { endpointsFor } from './endpoints'
import {
  mergeCatalog,
  normalizeCandleRow,
  normalizeDepthEvent,
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

  streamOrderBook(
    selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Observable<OrderBookSnapshot> {
    const symbol = normalizeSymbol(selection.symbol)
    const endpoint = endpointsFor(selection.market)
    const streamURL = `${endpoint.publicWebSocket}/${
      symbol.toLowerCase()
    }@depth20@100ms`
    return websocketJSON$<unknown>(streamURL, onState).pipe(
      map((event) => normalizeDepthEvent(event, selection.market, symbol)),
    )
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
