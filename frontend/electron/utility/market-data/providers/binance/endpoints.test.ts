import { describe, expect, it } from 'vitest'
import { endpointsFor } from './endpoints'

describe('Binance endpoints', () => {
  it('keeps Spot and Futures transports explicitly separated', () => {
    const spot = endpointsFor('spot')
    const futures = endpointsFor('futures')

    expect(spot.rest).toContain('/api/v3')
    expect(spot.publicWebSocket).toContain('stream.binance.com')
    expect(futures.rest).toContain('/fapi/v1')
    expect(futures.publicWebSocket).toContain('/public/ws')
    expect(futures.marketWebSocket).toContain('/market/ws')
    expect(futures).not.toEqual(spot)
  })
})
