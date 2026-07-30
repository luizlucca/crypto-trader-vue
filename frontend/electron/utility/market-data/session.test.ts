import { Subject } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import type { MarketDataEvent } from '../../../src/contracts/desktop'
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
import { MarketSession } from './session'

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
    onState({ state: 'connected' })
    return this.candles
  }

  streamOrderBook(
    _selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Subject<OrderBookSnapshot> {
    onState({ state: 'connected' })
    return this.books
  }
}

describe('MarketSession', () => {
  it('keeps candles immediate and coalesces order-book bursts per frame', () => {
    vi.useFakeTimers()
    const provider = new FakeProvider()
    const events: MarketDataEvent[] = []
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
})
