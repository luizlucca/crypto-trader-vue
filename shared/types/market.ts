export type Market = 'spot' | 'futures'

/**
 * Which venue serves the data. A testnet is not production under another
 * address: it is a separate exchange, with its own book, its own prices and
 * its own credentials.
 *
 * It therefore belongs to the *address* of a stream, alongside provider and
 * market — not beside it as session context. Keeping it here is what makes
 * `marketSelectionFingerprint` and `drawingKey` tell the two environments
 * apart without either of them knowing this feature exists.
 */
export type MarketEnvironment = 'live' | 'test'

export interface MarketSelection {
  provider: string
  environment: MarketEnvironment
  market: Market
  symbol: string
  interval: string
  baseAsset: string
  quoteAsset: string
  priceTickSize: number
  pricePrecision: number
  quantityPrecision: number
}

export interface MarketSymbol {
  provider: string
  market: Market
  symbol: string
  baseAsset: string
  quoteAsset: string
  status: string
  priceTickSize: number
  pricePrecision: number
  quantityPrecision: number
}

export interface MarketPair extends MarketSymbol {
  lastPrice: number
  priceChange: number
  priceChangePercent: number
  weightedAveragePrice: number
  openPrice: number
  highPrice: number
  lowPrice: number
  volume: number
  quoteVolume: number
  tradeCount: number
}

export interface MarketCatalog {
  provider: string
  /** Stamped so a catalog that outlived an environment switch is detectable. */
  environment: MarketEnvironment
  market: Market
  quoteAsset: string
  items: MarketPair[]
  loadedAt: number
  expiresAt: number
  cached: boolean
  stale: boolean
  warning?: string
}

export interface Candle {
  provider: string
  market: Market
  symbol: string
  interval: string
  time: number
  closeTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  quoteVolume: number
  closed: boolean
}

export interface OrderBookLevel {
  price: number
  quantity: number
  total: number
}

export interface OrderBookSnapshot {
  provider: string
  market: Market
  symbol: string
  eventTime: number
  lastUpdateId: number
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  midPrice: number
  spread: number
}

export type StreamState = 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface StreamStatus {
  provider: string
  market: Market
  symbol: string
  state: StreamState
  candleState: StreamState
  orderBookState: StreamState
  message?: string
}
