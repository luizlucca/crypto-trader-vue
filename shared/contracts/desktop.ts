import type {
  Candle,
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '@shared/types/market'
import type { DesktopSecurityAPI } from '@shared/contracts/security'

export const DESKTOP_CHANNELS = {
  marketRequest: 'cryptopro:market:request',
  marketEvent: 'cryptopro:market:event',
  openSymbolSearch: 'cryptopro:window:open-symbol-search',
  closeSymbolSearch: 'cryptopro:window:close-symbol-search',
  getSearchContext: 'cryptopro:window:get-search-context',
  searchContext: 'cryptopro:window:search-context',
  symbolSelected: 'cryptopro:window:symbol-selected',
  favoritesChanged: 'cryptopro:window:favorites-changed',
  securityRequest: 'cryptopro:security:request',
  securityEvent: 'cryptopro:security:event',
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
  before?: number
}

export interface StartStreamRequest {
  kind: 'start-stream'
  sessionId: string
  selection: MarketSelection
  visible: boolean
  /** Initial price grouping; defaults to the symbol tick size when absent. */
  aggregationStep?: number
}

export interface StopStreamRequest {
  kind: 'stop-stream'
  sessionId: string
}

export interface UpdateCandleStreamRequest {
  kind: 'update-candle-stream'
  sessionId: string
  selection: MarketSelection
  visible: boolean
}

export interface SetStreamVisibilityRequest {
  kind: 'set-stream-visibility'
  sessionId: string
  visible: boolean
}

/**
 * Changes the order-book price grouping. The utility process owns the full
 * local book, so this only re-aggregates: no socket or snapshot is redone.
 */
export interface SetOrderBookAggregationRequest {
  kind: 'set-order-book-aggregation'
  sessionId: string
  step: number
}

export type MarketDataRequest
  = | CatalogRequest
    | SymbolsRequest
    | CandlesRequest
    | StartStreamRequest
    | UpdateCandleStreamRequest
    | StopStreamRequest
    | SetStreamVisibilityRequest
    | SetOrderBookAggregationRequest

export interface UtilityRequest {
  type: 'request'
  requestId: string
  request: MarketDataRequest
}

export type MarketDataEvent
  = | { sessionId: string, kind: 'candle', payload: Candle }
    | { sessionId: string, kind: 'orderbook', payload: OrderBookSnapshot }
    | { sessionId: string, kind: 'status', payload: StreamStatus }

export type MarketSessionEvent
  = | { kind: 'candle', payload: Candle }
    | { kind: 'orderbook', payload: OrderBookSnapshot }
    | { kind: 'status', payload: StreamStatus }

export type UtilityMessage
  = | { type: 'ready' }
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
  tabId: string
  intent: 'replace-tab' | 'new-tab'
  selection: MarketSelection
  initialQuery: string
}

export interface SymbolSelectionResult {
  tabId: string
  intent: SymbolSearchContext['intent']
  item: MarketPair
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
  getCandles(
    selection: MarketSelection,
    limit?: number,
    before?: number,
  ): Promise<Candle[]>
  startStream(
    sessionId: string,
    selection: MarketSelection,
    visible?: boolean,
    aggregationStep?: number,
  ): Promise<void>
  updateCandleStream(
    sessionId: string,
    selection: MarketSelection,
    visible?: boolean,
  ): Promise<void>
  stopStream(sessionId: string): Promise<void>
  setStreamVisibility(sessionId: string, visible: boolean): Promise<void>
  setOrderBookAggregation(sessionId: string, step: number): Promise<void>
  onCandle(
    callback: (sessionId: string, candle: Candle) => void,
  ): () => void
  onOrderBook(
    callback: (sessionId: string, snapshot: OrderBookSnapshot) => void,
  ): () => void
  onStatus(
    callback: (sessionId: string, status: StreamStatus) => void,
  ): () => void
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
  onSymbolSelected(
    callback: (result: SymbolSelectionResult) => void,
  ): () => void
  onFavoritesChanged(callback: (keys: string[]) => void): () => void
}

export interface CryptoProDesktopAPI {
  platform: string
  marketData: DesktopMarketDataAPI
  security?: DesktopSecurityAPI
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
    priceTickSize: selection.priceTickSize,
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
    priceTickSize: item.priceTickSize,
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
    && typeof selection.priceTickSize === 'number'
    && Number.isFinite(selection.priceTickSize)
    && selection.priceTickSize > 0
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
    && typeof symbol.priceTickSize === 'number'
    && Number.isFinite(symbol.priceTickSize)
    && symbol.priceTickSize > 0
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
  return isSessionId(context.tabId)
    && (context.intent === 'replace-tab' || context.intent === 'new-tab')
    && isMarketSelection(context.selection)
    && typeof context.initialQuery === 'string'
}

function isAggregationStep(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
    && value <= 1_000_000
}

function isCandleLimit(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isInteger(value)
    && value >= 1
    && value <= 1_000
}

/** Exclusive `openTime` cursor, in seconds, of the oldest candle shown. */
function isHistoryCursor(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0
}

function isSessionId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= 1
    && value.length <= 128
    && /^[a-zA-Z0-9_-]+$/.test(value)
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
        && isCandleLimit(request.limit)
        && (
          request.before === undefined
          || isHistoryCursor(request.before)
        )
    case 'start-stream':
      return isSessionId(request.sessionId)
        && isMarketSelection(request.selection)
        && typeof request.visible === 'boolean'
        && (
          request.aggregationStep === undefined
          || isAggregationStep(request.aggregationStep)
        )
    case 'update-candle-stream':
      return isSessionId(request.sessionId)
        && isMarketSelection(request.selection)
        && typeof request.visible === 'boolean'
    case 'stop-stream':
      return isSessionId(request.sessionId)
    case 'set-stream-visibility':
      return isSessionId(request.sessionId)
        && typeof request.visible === 'boolean'
    case 'set-order-book-aggregation':
      return isSessionId(request.sessionId)
        && isAggregationStep(request.step)
    default:
      return false
  }
}
