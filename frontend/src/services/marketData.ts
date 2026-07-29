import {
  GetCandles,
  GetSymbols,
  StartMarketStream,
  StopMarketStream,
} from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import type {
  Candle,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '../types/market'

export const MARKET_EVENTS = {
  candle: 'market:candle',
  orderBook: 'market:orderbook',
  status: 'market:status',
} as const

export async function loadSymbols(
  provider: string,
  market: MarketSelection['market'],
  quoteAsset = 'USDT',
): Promise<MarketSymbol[]> {
  return GetSymbols(provider, market, quoteAsset) as Promise<MarketSymbol[]>
}

export async function loadCandles(
  selection: MarketSelection,
  limit = 500,
): Promise<Candle[]> {
  return GetCandles(
    selection.provider,
    selection.market,
    selection.symbol,
    selection.interval,
    limit,
  ) as Promise<Candle[]>
}

export function startMarketStream(selection: MarketSelection): Promise<void> {
  return StartMarketStream(
    selection.provider,
    selection.market,
    selection.symbol,
    selection.interval,
  )
}

export function stopMarketStream(): Promise<void> {
  return StopMarketStream()
}

export function onCandle(callback: (candle: Candle) => void): () => void {
  return EventsOn(MARKET_EVENTS.candle, callback)
}

export function onOrderBook(
  callback: (snapshot: OrderBookSnapshot) => void,
): () => void {
  return EventsOn(MARKET_EVENTS.orderBook, callback)
}

export function onStreamStatus(
  callback: (status: StreamStatus) => void,
): () => void {
  return EventsOn(MARKET_EVENTS.status, callback)
}
