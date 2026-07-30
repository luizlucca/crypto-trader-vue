import { describe, expect, it } from 'vitest'
import type { OrderBookLevel } from '../../types/market'
import { calculateOrderBookRatio } from './orderBookRatio'

function level(quantity: number): OrderBookLevel {
  return {
    price: 100,
    quantity,
    total: quantity,
  }
}

describe('order-book buy/sell ratio', () => {
  it('calculates the visible liquidity of both sides', () => {
    expect(calculateOrderBookRatio(
      [level(3), level(1)],
      [level(2), level(2)],
      10,
    )).toEqual({
      buyPercent: 50,
      sellPercent: 50,
    })
  })

  it('ignores levels outside the visible depth', () => {
    const ratio = calculateOrderBookRatio(
      [level(3), level(1_000)],
      [level(1)],
      1,
    )
    expect(ratio?.buyPercent).toBe(75)
    expect(ratio?.sellPercent).toBe(25)
  })

  it('returns no ratio for an empty book', () => {
    expect(calculateOrderBookRatio([], [], 10)).toBeNull()
  })
})
