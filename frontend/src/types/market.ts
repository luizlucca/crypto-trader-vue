export type Market = 'spot' | 'futures'

export interface MarketSelection {
  provider: string
  market: Market
  symbol: string
  interval: string
  baseAsset: string
  quoteAsset: string
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

export interface StreamStatus {
  provider: string
  market: Market
  symbol: string
  state: 'connecting' | 'connected' | 'reconnecting' | 'error'
  candleState: string
  orderBookState: string
  message?: string
}
