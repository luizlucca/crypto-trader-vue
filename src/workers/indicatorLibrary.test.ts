import { describe, expect, it } from 'vitest'
import {
  calculateMFIRSIBollingerBands,
  calculateSMA,
} from 'lightweight-charts-indicators'

const bars = Array.from({ length: 500 }, (_, index) => {
  const close = 60_000 + Math.sin(index / 8) * 500 + index
  return {
    time: 1_700_000_000 + index * 3_600,
    open: close - 10,
    high: close + 50,
    low: close - 50,
    close,
    volume: 100 + index,
  }
})

describe('MFI/RSI Bollinger Bands integration', () => {
  it('stays deterministic through repeated calculate/remove/add cycles', () => {
    let reference: number[] | undefined
    for (let cycle = 0; cycle < 250; cycle += 1) {
      calculateSMA(bars)
      const result = calculateMFIRSIBollingerBands(bars)
      const counts = Object.values(result.plots).map(
        (points) => points.filter((point) => Number.isFinite(point.value)).length,
      )
      reference ??= counts
      expect(counts).toEqual(reference)
      expect(counts.every((count) => count > 400)).toBe(true)
    }
  })
})
