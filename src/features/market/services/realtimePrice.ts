import type { Market } from '@shared/types/market'
import {
  createImperativeChannel,
} from '@renderer-shared/services/imperativeChannel'

export interface RealtimePrice {
  provider: string
  market: Market
  symbol: string
  value: number
}

/**
 * Keyed by instrument rather than by session: the chart and the order book of
 * a tab observe the same pair, and two tabs on the same pair share subscribers.
 *
 * Previously this was a flat Set scanned on every publication, comparing three
 * strings per subscriber at roughly 60 publications per second. Indexing by key
 * makes a publication cost only the listeners actually watching that pair.
 */
const channel = createImperativeChannel<number>()

function priceKey(provider: string, market: Market, symbol: string): string {
  return `${provider}:${market}:${symbol}`.toLowerCase()
}

export function publishRealtimePrice(price: RealtimePrice): void {
  if (!Number.isFinite(price.value) || price.value <= 0) {
    return
  }
  channel.publish(
    priceKey(price.provider, price.market, price.symbol),
    price.value,
  )
}

export function subscribeRealtimePrice(
  provider: string,
  market: Market,
  symbol: string,
  callback: (value: number) => void,
): () => void {
  return channel.subscribe(priceKey(provider, market, symbol), callback)
}
