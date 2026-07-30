import type {
  Candle,
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '../types/market'

export const DESKTOP_CHANNELS = {
  marketRequest: 'cryptopro:market:request',
  marketEvent: 'cryptopro:market:event',
  openSymbolSearch: 'cryptopro:window:open-symbol-search',
  closeSymbolSearch: 'cryptopro:window:close-symbol-search',
  getSearchContext: 'cryptopro:window:get-search-context',
  searchContext: 'cryptopro:window:search-context',
  symbolSelected: 'cryptopro:window:symbol-selected',
  favoritesChanged: 'cryptopro:window:favorites-changed',
} as const

export interface CatalogRequest {
  kind: 'catalog'
  provider: string
  market: Market
  quoteAsset: string
  forceRefresh: boolean
}

export interface SymbolsRequest {
  kind: 'symbols'
  provider: string
  market: Market
  quoteAsset: string
}

export interface CandlesRequest {
  kind: 'candles'
  selection: MarketSelection
  limit: number
}

export interface StartStreamRequest {
  kind: 'start-stream'
  selection: MarketSelection
}

export interface StopStreamRequest {
  kind: 'stop-stream'
}

export type MarketDataRequest =
  | CatalogRequest
  | SymbolsRequest
  | CandlesRequest
  | StartStreamRequest
  | StopStreamRequest

export interface UtilityRequest {
  type: 'request'
  requestId: string
  request: MarketDataRequest
}

export type MarketDataEvent =
  | { kind: 'candle'; payload: Candle }
  | { kind: 'orderbook'; payload: OrderBookSnapshot }
  | { kind: 'status'; payload: StreamStatus }

export type UtilityMessage =
  | { type: 'ready' }
  | {
      type: 'response'
      requestId: string
      ok: true
      result: unknown
    }
  | {
      type: 'response'
      requestId: string
      ok: false
      error: string
    }
  | {
      type: 'event'
      event: MarketDataEvent
    }

export interface SymbolSearchContext {
  selection: MarketSelection
  initialQuery: string
}

export interface DesktopMarketDataAPI {
  getCatalog(
    provider: string,
    market: Market,
    quoteAsset?: string,
    forceRefresh?: boolean,
  ): Promise<MarketCatalog>
  getSymbols(
    provider: string,
    market: Market,
    quoteAsset?: string,
  ): Promise<MarketSymbol[]>
  getCandles(selection: MarketSelection, limit?: number): Promise<Candle[]>
  startStream(selection: MarketSelection): Promise<void>
  stopStream(): Promise<void>
  onCandle(callback: (candle: Candle) => void): () => void
  onOrderBook(
    callback: (snapshot: OrderBookSnapshot) => void,
  ): () => void
  onStatus(callback: (status: StreamStatus) => void): () => void
}

export interface DesktopWindowsAPI {
  openSymbolSearch(context: SymbolSearchContext): Promise<void>
  closeSymbolSearch(): Promise<void>
  getSearchContext(): Promise<SymbolSearchContext | null>
  selectSymbol(item: MarketPair): Promise<void>
  syncFavorites(keys: string[]): void
  onSearchContext(
    callback: (context: SymbolSearchContext) => void,
  ): () => void
  onSymbolSelected(callback: (item: MarketPair) => void): () => void
  onFavoritesChanged(callback: (keys: string[]) => void): () => void
}

export interface CryptoProDesktopAPI {
  platform: string
  marketData: DesktopMarketDataAPI
  windows: DesktopWindowsAPI
}

export function copyMarketSelection(
  selection: MarketSelection,
): MarketSelection {
  return {
    provider: selection.provider,
    market: selection.market,
    symbol: selection.symbol,
    interval: selection.interval,
    baseAsset: selection.baseAsset,
    quoteAsset: selection.quoteAsset,
    pricePrecision: selection.pricePrecision,
    quantityPrecision: selection.quantityPrecision,
  }
}

export function copyMarketPair(item: MarketPair): MarketPair {
  return {
    provider: item.provider,
    market: item.market,
    symbol: item.symbol,
    baseAsset: item.baseAsset,
    quoteAsset: item.quoteAsset,
    status: item.status,
    pricePrecision: item.pricePrecision,
    quantityPrecision: item.quantityPrecision,
    lastPrice: item.lastPrice,
    priceChange: item.priceChange,
    priceChangePercent: item.priceChangePercent,
    weightedAveragePrice: item.weightedAveragePrice,
    openPrice: item.openPrice,
    highPrice: item.highPrice,
    lowPrice: item.lowPrice,
    volume: item.volume,
    quoteVolume: item.quoteVolume,
    tradeCount: item.tradeCount,
  }
}

export function isMarket(value: unknown): value is Market {
  return value === 'spot' || value === 'futures'
}

export function isMarketSelection(
  value: unknown,
): value is MarketSelection {
  if (!value || typeof value !== 'object') {
    return false
  }
  const selection = value as Partial<MarketSelection>
  return typeof selection.provider === 'string'
    && isMarket(selection.market)
    && typeof selection.symbol === 'string'
    && typeof selection.interval === 'string'
    && typeof selection.baseAsset === 'string'
    && typeof selection.quoteAsset === 'string'
    && Number.isFinite(selection.pricePrecision)
    && Number.isFinite(selection.quantityPrecision)
}

function isMarketSymbol(value: unknown): value is MarketSymbol {
  if (!value || typeof value !== 'object') {
    return false
  }
  const symbol = value as Partial<MarketSymbol>
  return typeof symbol.provider === 'string'
    && isMarket(symbol.market)
    && typeof symbol.symbol === 'string'
    && typeof symbol.baseAsset === 'string'
    && typeof symbol.quoteAsset === 'string'
    && typeof symbol.status === 'string'
    && Number.isFinite(symbol.pricePrecision)
    && Number.isFinite(symbol.quantityPrecision)
}

export function isMarketPair(value: unknown): value is MarketPair {
  if (!isMarketSymbol(value)) {
    return false
  }
  const pair = value as Partial<MarketPair>
  return typeof pair.status === 'string'
    && Number.isFinite(pair.lastPrice)
    && Number.isFinite(pair.priceChange)
    && Number.isFinite(pair.priceChangePercent)
    && Number.isFinite(pair.weightedAveragePrice)
    && Number.isFinite(pair.openPrice)
    && Number.isFinite(pair.highPrice)
    && Number.isFinite(pair.lowPrice)
    && Number.isFinite(pair.volume)
    && Number.isFinite(pair.quoteVolume)
    && Number.isFinite(pair.tradeCount)
}

export function isSymbolSearchContext(
  value: unknown,
): value is SymbolSearchContext {
  if (!value || typeof value !== 'object') {
    return false
  }
  const context = value as Partial<SymbolSearchContext>
  return isMarketSelection(context.selection)
    && typeof context.initialQuery === 'string'
}

export function isMarketDataRequest(value: unknown): value is MarketDataRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const request = value as Partial<MarketDataRequest>
  switch (request.kind) {
    case 'catalog':
      return typeof request.provider === 'string'
        && isMarket(request.market)
        && typeof request.quoteAsset === 'string'
        && typeof request.forceRefresh === 'boolean'
    case 'symbols':
      return typeof request.provider === 'string'
        && isMarket(request.market)
        && typeof request.quoteAsset === 'string'
    case 'candles':
      return isMarketSelection(request.selection)
        && Number.isInteger(request.limit)
        && (request.limit ?? 0) >= 1
        && (request.limit ?? 0) <= 1_000
    case 'start-stream':
      return isMarketSelection(request.selection)
    case 'stop-stream':
      return true
    default:
      return false
  }
}
