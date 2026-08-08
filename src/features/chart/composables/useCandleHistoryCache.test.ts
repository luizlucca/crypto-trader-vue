import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candle, MarketSelection } from '@shared/types/market'
import {
  useCandleHistoryCache,
  type CandleHistoryCache,
} from './useCandleHistoryCache'

const selection: MarketSelection = {
  provider: 'binance',
  environment: 'live',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.01,
  pricePrecision: 2,
  quantityPrecision: 3,
}

function candle(time: number, close = 100): Candle {
  return {
    provider: 'binance',
    market: 'futures',
    symbol: 'BTCUSDT',
    interval: '1h',
    time,
    closeTime: time + 59,
    open: 100,
    high: 101,
    low: 99,
    close,
    volume: 1,
    quoteVolume: 100,
    closed: false,
  }
}

let emit: (candle: Candle) => void
let caches: CandleHistoryCache[]

// The event router in services/marketData.ts keeps its transport subscription
// at module scope, so a cache left attached would keep the previous test's
// stub alive and swallow the next one's events.
beforeEach(() => {
  caches = []
  emit = () => {}
  vi.stubGlobal('window', {
    cryptoPro: {
      marketData: {
        onCandle: (callback: (sessionId: string, value: Candle) => void) => {
          emit = (value) => callback('tab-1', value)
          return () => {}
        },
      },
    },
  })
})

afterEach(() => {
  caches.forEach((cache) => cache.detachAll())
  vi.unstubAllGlobals()
})

function createCache(maxCachedCandles = 500): CandleHistoryCache {
  const cache = useCandleHistoryCache(maxCachedCandles)
  caches.push(cache)
  return cache
}

describe('candle history cache', () => {
  it('hides history until the REST page arrives', () => {
    const cache = createCache()
    cache.attach('tab-1', () => selection)

    emit(candle(100))

    // A lone realtime tick is not a usable history: the chart must still load.
    expect(cache.read('tab-1', selection)).toBeUndefined()
  })

  it('keeps a tick that arrived while the REST page was in flight', () => {
    const cache = createCache()
    cache.attach('tab-1', () => selection)

    emit(candle(300, 999))
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [
      candle(100),
      candle(200),
    ])

    expect(cache.read('tab-1', selection)?.map((item) => item.time))
      .toEqual([100, 200, 300])
  })

  it('lets a pending tick replace the last candle of the same period', () => {
    const cache = createCache()
    cache.attach('tab-1', () => selection)

    emit(candle(200, 999))
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [
      candle(100),
      candle(200, 111),
    ])

    const cached = cache.read('tab-1', selection)
    expect(cached).toHaveLength(2)
    expect(cached?.at(-1)?.close).toBe(999)
  })

  it('does not return history from a different selection', () => {
    const cache = createCache()
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [candle(100)])

    expect(
      cache.read('tab-1', { ...selection, interval: '5m' }),
    ).toBeUndefined()
  })

  it('bounds the window and drops the oldest candles', () => {
    const cache = createCache(3)
    cache.attach('tab-1', () => selection)
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [
      candle(100),
      candle(200),
      candle(300),
    ])

    emit(candle(400))

    expect(cache.read('tab-1', selection)?.map((item) => item.time))
      .toEqual([200, 300, 400])
  })

  it('ignores a candle that does not belong to the session selection', () => {
    const cache = createCache()
    cache.attach('tab-1', () => selection)
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [candle(100)])

    emit({ ...candle(200), symbol: 'ETHUSDT' })

    expect(cache.read('tab-1', selection)?.map((item) => item.time))
      .toEqual([100])
  })

  it('forgets a session when it is detached', () => {
    const cache = createCache()
    cache.store('tab-1', 'binance:live:futures:BTCUSDT:1h', [candle(100)])

    cache.detach('tab-1')

    expect(cache.read('tab-1', selection)).toBeUndefined()
  })
})
