import { describe, expect, it } from 'vitest'
import type { Market, MarketEnvironment } from '@shared/types/market'
import { endpointsFor } from './endpoints'

const markets: Market[] = ['spot', 'futures']
const environments: MarketEnvironment[] = ['live', 'test']

describe('Binance endpoints', () => {
  it('keeps Spot and Futures transports explicitly separated', () => {
    const spot = endpointsFor('spot', 'live')
    const futures = endpointsFor('futures', 'live')

    expect(spot.rest).toContain('/api/v3')
    expect(spot.publicWebSocket).toContain('stream.binance.com')
    expect(futures.rest).toContain('/fapi/v1')
    expect(futures.publicWebSocket).toContain('/public/ws')
    expect(futures.marketWebSocket).toContain('/market/ws')
    expect(futures).not.toEqual(spot)
  })

  /*
   * The production entries are asserted literally rather than by pattern. This
   * table is the one place where a typo sends live orders somewhere else, and
   * a loose assertion would let a rename through.
   */
  it('leaves production addresses exactly as they were', () => {
    expect(endpointsFor('spot', 'live')).toEqual({
      rest: 'https://api.binance.com/api/v3',
      publicWebSocket: 'wss://stream.binance.com:9443/ws',
      marketWebSocket: 'wss://stream.binance.com:9443/ws',
    })
    expect(endpointsFor('futures', 'live')).toEqual({
      rest: 'https://fapi.binance.com/fapi/v1',
      publicWebSocket: 'wss://fstream.binance.com/public/ws',
      marketWebSocket: 'wss://fstream.binance.com/market/ws',
    })
  })

  it('resolves the testnet hosts for both markets', () => {
    expect(endpointsFor('spot', 'test').rest)
      .toBe('https://testnet.binance.vision/api/v3')
    expect(endpointsFor('spot', 'test').publicWebSocket)
      .toBe('wss://stream.testnet.binance.vision/ws')
    expect(endpointsFor('futures', 'test').rest)
      .toBe('https://demo-fapi.binance.com/fapi/v1')
    expect(endpointsFor('futures', 'test').publicWebSocket)
      .toBe('wss://demo-fstream.binance.com/ws')
  })

  /*
   * The property that actually protects the operator: no address may be shared
   * between the two environments. A test order must be unable to reach a
   * production host by any route — REST or socket — however the table is
   * later edited.
   */
  it('never lets a test address coincide with a production one', () => {
    const production = new Set(
      markets.flatMap((market) => Object.values(endpointsFor(market, 'live'))),
    )
    for (const market of markets) {
      for (const url of Object.values(endpointsFor(market, 'test'))) {
        expect(production.has(url)).toBe(false)
      }
    }
  })

  it('answers with a complete, absolute endpoint set for every combination',
    () => {
      for (const environment of environments) {
        for (const market of markets) {
          const endpoint = endpointsFor(market, environment)
          expect(Object.keys(endpoint).sort())
            .toEqual(['marketWebSocket', 'publicWebSocket', 'rest'])
          expect(endpoint.rest.startsWith('https://')).toBe(true)
          expect(endpoint.publicWebSocket.startsWith('wss://')).toBe(true)
          expect(endpoint.marketWebSocket.startsWith('wss://')).toBe(true)
        }
      }
    })
})
