import type { Market } from '../types/market'

export interface RealtimePrice {
  provider: string
  market: Market
  symbol: string
  value: number
}

interface PriceSubscriber {
  provider: string
  market: Market
  symbol: string
  callback: (value: number) => void
}

const subscribers = new Set<PriceSubscriber>()
const latestPrices = new Map<string, number>()

function priceKey(provider: string, market: Market, symbol: string): string {
  return `${provider}:${market}:${symbol}`.toLowerCase()
}

export function publishRealtimePrice(price: RealtimePrice): void {
  if (!Number.isFinite(price.value) || price.value <= 0) {
    return
  }

  const provider = price.provider.toLowerCase()
  const symbol = price.symbol.toUpperCase()
  latestPrices.set(
    priceKey(provider, price.market, symbol),
    price.value,
  )

  subscribers.forEach((subscriber) => {
    if (
      subscriber.provider === provider
      && subscriber.market === price.market
      && subscriber.symbol === symbol
    ) {
      subscriber.callback(price.value)
    }
  })
}

export function subscribeRealtimePrice(
  provider: string,
  market: Market,
  symbol: string,
  callback: (value: number) => void,
): () => void {
  const subscriber: PriceSubscriber = {
    provider: provider.toLowerCase(),
    market,
    symbol: symbol.toUpperCase(),
    callback,
  }
  subscribers.add(subscriber)

  const latest = latestPrices.get(priceKey(provider, market, symbol))
  if (latest !== undefined) {
    callback(latest)
  }

  return () => {
    subscribers.delete(subscriber)
  }
}
