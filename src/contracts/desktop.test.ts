import { describe, expect, it } from 'vitest'
import { isMarketDataRequest, isSymbolSearchContext } from './desktop'
import type { MarketSelection } from '../types/market'

const selection: MarketSelection = {
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.01,
  pricePrecision: 2,
  quantityPrecision: 3,
}

describe('desktop market-data contract', () => {
  it('requires a valid session id for stream lifecycle commands', () => {
    expect(isMarketDataRequest({
      kind: 'start-stream',
      sessionId: 'tab-one',
      selection,
      visible: true,
    })).toBe(true)
    expect(isMarketDataRequest({
      kind: 'start-stream',
      selection,
      visible: true,
    })).toBe(false)
    expect(isMarketDataRequest({
      kind: 'stop-stream',
      sessionId: 'contains spaces',
    })).toBe(false)
    expect(isMarketDataRequest({
      kind: 'set-stream-visibility',
      sessionId: 'tab-two',
      visible: false,
    })).toBe(true)
    expect(isMarketDataRequest({
      kind: 'update-candle-stream',
      sessionId: 'tab-two',
      selection: { ...selection, interval: '5m' },
      visible: true,
    })).toBe(true)
    expect(isMarketDataRequest({
      kind: 'update-candle-stream',
      sessionId: 'contains spaces',
      selection,
      visible: true,
    })).toBe(false)
  })

  it('validates whether symbol search replaces or creates a tab', () => {
    expect(isSymbolSearchContext({
      tabId: 'tab-one',
      intent: 'new-tab',
      selection,
      initialQuery: '',
    })).toBe(true)
    expect(isSymbolSearchContext({
      tabId: 'tab-one',
      intent: 'unknown',
      selection,
      initialQuery: '',
    })).toBe(false)
  })

  it('accepts only safe historical candle cursors', () => {
    expect(isMarketDataRequest({
      kind: 'candles',
      selection,
      limit: 400,
      before: 1_722_398_400,
    })).toBe(true)
    expect(isMarketDataRequest({
      kind: 'candles',
      selection,
      limit: 400,
      before: -1,
    })).toBe(false)
    expect(isMarketDataRequest({
      kind: 'candles',
      selection,
      limit: 400,
      before: 1.5,
    })).toBe(false)
  })
})
