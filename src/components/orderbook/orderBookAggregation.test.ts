import { describe, expect, it } from 'vitest'
import {
  aggregateOrderBookLevels,
  createAggregationOptions,
  formatAggregationStep,
} from './orderBookAggregation'

describe('order book aggregation', () => {
  it('creates Binance-style steps from the native tick size', () => {
    expect(createAggregationOptions(0.1)).toEqual([0.1, 1, 10, 100])
    expect(createAggregationOptions(0.00001)).toEqual([
      0.00001,
      0.0001,
      0.001,
      0.01,
    ])
    expect(formatAggregationStep(0.0001)).toBe('0.0001')
    expect(formatAggregationStep(10)).toBe('10')
  })

  it('rounds bids down, asks up and recomputes cumulative totals', () => {
    const bids = aggregateOrderBookLevels([
      { price: 100.9, quantity: 1, total: 1 },
      { price: 100.2, quantity: 2, total: 3 },
      { price: 99.8, quantity: 4, total: 7 },
    ], 'bid', 1)
    const asks = aggregateOrderBookLevels([
      { price: 100.1, quantity: 2, total: 2 },
      { price: 100.8, quantity: 3, total: 5 },
      { price: 101.2, quantity: 1, total: 6 },
    ], 'ask', 1)

    expect(bids).toEqual([
      { price: 100, quantity: 3, total: 3 },
      { price: 99, quantity: 4, total: 7 },
    ])
    expect(asks).toEqual([
      { price: 101, quantity: 5, total: 5 },
      { price: 102, quantity: 1, total: 6 },
    ])
  })

  it('does not lose decimal buckets through floating-point drift', () => {
    const bids = aggregateOrderBookLevels([
      { price: 64213.3, quantity: 0.5, total: 0.5 },
      { price: 64213.2, quantity: 0.25, total: 0.75 },
    ], 'bid', 0.1)

    expect(bids.map((level) => level.price)).toEqual([64213.3, 64213.2])
  })
})
