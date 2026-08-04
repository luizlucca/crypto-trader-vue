import { describe, expect, it } from 'vitest'
import type { Candle } from '@shared/types/market'
import { uniqueSortedCandles } from './candles'

function candle(time: number, close = 100): Candle {
  return {
    provider: 'binance',
    market: 'futures',
    symbol: 'BTCUSDT',
    interval: '1h',
    time,
    closeTime: time + 3599,
    open: 100,
    high: 101,
    low: 99,
    close,
    volume: 1,
    quoteVolume: 100,
    closed: true,
  }
}

function times(candles: readonly Candle[]): number[] {
  return candles.map((item) => item.time)
}

describe('uniqueSortedCandles', () => {
  it('accepts an empty page', () => {
    expect(uniqueSortedCandles([])).toEqual([])
  })

  it('accepts a single candle', () => {
    expect(times(uniqueSortedCandles([candle(100)]))).toEqual([100])
  })

  it('sorts a page the provider returned out of order', () => {
    const page = [candle(300), candle(100), candle(200)]

    expect(times(uniqueSortedCandles(page))).toEqual([100, 200, 300])
  })

  it('keeps the later occurrence of a repeated instant', () => {
    const page = [candle(100, 1), candle(200, 2), candle(100, 9)]

    const result = uniqueSortedCandles(page)

    expect(times(result)).toEqual([100, 200])
    expect(result[0].close).toBe(9)
  })

  it('preserves a gap instead of filling it', () => {
    const page = [candle(100), candle(400)]

    expect(times(uniqueSortedCandles(page))).toEqual([100, 400])
  })

  it('drops candles at or after the exclusive bound', () => {
    const page = [candle(100), candle(200), candle(300)]

    expect(times(uniqueSortedCandles(page, 200))).toEqual([100])
  })

  it('returns nothing when every candle is at or after the bound', () => {
    expect(uniqueSortedCandles([candle(200), candle(300)], 200)).toEqual([])
  })
})
