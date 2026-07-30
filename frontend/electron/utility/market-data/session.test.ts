import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import type { MarketSessionEvent } from '../../../src/contracts/desktop'
import type {
  Candle,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
} from '../../../src/types/market'
import type {
  CatalogOptions,
  ConnectionStateHandler,
  MarketDataProvider,
} from './provider'
import { MarketSession, MarketSessionPool } from './session'

const selection: MarketSelection = {
  provider: 'test',
  market: 'spot',
  symbol: 'BTCUSDT',
  interval: '1m',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  pricePrecision: 2,
  quantityPrecision: 3,
}

function candle(close: number): Candle {
  return {
    provider: 'test',
    market: 'spot',
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1,
    closeTime: 2,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    quoteVolume: close,
    closed: false,
  }
}

function orderBook(lastUpdateId: number): OrderBookSnapshot {
  return {
    provider: 'test',
    market: 'spot',
    symbol: 'BTCUSDT',
    eventTime: lastUpdateId,
    lastUpdateId,
    bids: [],
    asks: [],
    midPrice: 100,
    spread: 1,
  }
}

class FakeProvider implements MarketDataProvider {
  readonly name = 'test'
  readonly candles = new Subject<Candle>()
  readonly books = new Subject<OrderBookSnapshot>()
  candleStreamCalls = 0
  orderBookStreamCalls = 0

  async getCatalog(_options: CatalogOptions): Promise<MarketCatalog> {
    throw new Error('not used')
  }

  async getSymbols(): Promise<MarketSymbol[]> {
    throw new Error('not used')
  }

  async getCandles(): Promise<Candle[]> {
    throw new Error('not used')
  }

  streamCandles(
    _selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Subject<Candle> {
    this.candleStreamCalls += 1
    onState({ state: 'connected' })
    return this.candles
  }

  streamOrderBook(
    _selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Subject<OrderBookSnapshot> {
    this.orderBookStreamCalls += 1
    onState({ state: 'connected' })
    return this.books
  }
}

describe('MarketSession', () => {
  it('keeps candles immediate and coalesces order-book bursts per frame', () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const events: MarketSessionEvent[] = []
    const session = new MarketSession((event) => events.push(event))
    session.start(provider, selection)
    events.length = 0

    provider.candles.next(candle(101))
    provider.books.next(orderBook(1))
    provider.books.next(orderBook(2))
    provider.books.next(orderBook(3))

    expect(events).toEqual([
      expect.objectContaining({
        kind: 'candle',
        payload: expect.objectContaining({ close: 101 }),
      }),
    ])

    vi.advanceTimersByTime(16)
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual(expect.objectContaining({
      kind: 'orderbook',
      payload: expect.objectContaining({ lastUpdateId: 3 }),
    }))

    session.stop()
    vi.useRealTimers()
  })

  it('keeps sessions and order-book visibility independent', () => {
    vi.useFakeTimers()
    const firstProvider = new FakeProvider()
    const secondProvider = new FakeProvider()
    const events: Array<{
      sessionId: string
      event: MarketSessionEvent
    }> = []
    const pool = new MarketSessionPool((sessionId, event) => {
      events.push({ sessionId, event })
    })

    pool.start('tab-one', firstProvider, selection, true)
    pool.start('tab-two', secondProvider, {
      ...selection,
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
    }, false)
    events.length = 0

    firstProvider.books.next(orderBook(1))
    secondProvider.books.next({
      ...orderBook(2),
      symbol: 'ETHUSDT',
    })
    vi.advanceTimersByTime(16)

    expect(events).toEqual([
      expect.objectContaining({
        sessionId: 'tab-one',
        event: expect.objectContaining({ kind: 'orderbook' }),
      }),
    ])

    pool.setVisible('tab-one', false)
    pool.setVisible('tab-two', true)
    expect(events.at(-1)).toEqual(expect.objectContaining({
      sessionId: 'tab-two',
      event: expect.objectContaining({
        kind: 'orderbook',
        payload: expect.objectContaining({ symbol: 'ETHUSDT' }),
      }),
    }))

    pool.stop('tab-one')
    expect(pool.size).toBe(1)
    pool.stopAll()
    expect(pool.size).toBe(0)
    vi.useRealTimers()
  })

  it('changes the candle interval without reconnecting the order book', () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const events: MarketSessionEvent[] = []
    const session = new MarketSession((event) => events.push(event))

    session.start(provider, selection)
    expect(provider.candleStreamCalls).toBe(1)
    expect(provider.orderBookStreamCalls).toBe(1)
    events.length = 0

    session.updateCandles(provider, {
      ...selection,
      interval: '5m',
    })

    expect(provider.candleStreamCalls).toBe(2)
    expect(provider.orderBookStreamCalls).toBe(1)

    provider.books.next(orderBook(42))
    vi.advanceTimersByTime(16)
    expect(events).toContainEqual(expect.objectContaining({
      kind: 'orderbook',
      payload: expect.objectContaining({ lastUpdateId: 42 }),
    }))

    session.stop()
    vi.useRealTimers()
  })
})
