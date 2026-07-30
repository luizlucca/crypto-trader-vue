import { describe, expect, it } from 'vitest'
import type { UTCTimestamp, WhitespaceData } from 'lightweight-charts'
import { RoundedCandleSeries } from './RoundedCandleSeries'
import type { RoundedCandleData } from './data'
import {
  candlestickWidth,
  positionsBox,
  positionsLine,
} from './dimensions'

const candle: RoundedCandleData<UTCTimestamp> = {
  time: 1 as UTCTimestamp,
  open: 100,
  high: 106,
  low: 98,
  close: 104,
}

describe('RoundedCandleSeries', () => {
  it('exposes OHLC bounds to autoscale and detects whitespace', () => {
    const series = new RoundedCandleSeries()

    expect(series.priceValueBuilder(candle)).toEqual([106, 98, 104])
    expect(series.isWhitespace(candle)).toBe(false)
    expect(series.isWhitespace({
      time: 2 as UTCTimestamp,
    } satisfies WhitespaceData<UTCTimestamp>)).toBe(true)
  })

  it('uses square bodies while compressed and bounded rounding when zoomed', () => {
    const radius = new RoundedCandleSeries().defaultOptions().radius

    expect(radius(3)).toBe(0)
    expect(radius(9)).toBe(3)
    expect(radius(30)).toBe(4)
  })

  it('keeps body and wick geometry aligned to bitmap pixels', () => {
    expect(candlestickWidth(8, 2)).toBeGreaterThanOrEqual(2)
    expect(positionsLine(10, 2, 3)).toEqual({
      position: 17,
      length: 6,
    })
    expect(positionsBox(4.25, 8.75, 2)).toEqual({
      position: 9,
      length: 10,
    })
  })
})
