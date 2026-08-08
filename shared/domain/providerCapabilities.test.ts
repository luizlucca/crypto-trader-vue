import { describe, expect, it } from 'vitest'
import {
  isProviderId,
  providerCapabilities,
} from './providerCapabilities'

describe('provider id', () => {
  it('accepts the providers this build knows', () => {
    expect(isProviderId('binance')).toBe(true)
  })

  it('rejects anything else, so a stored vault cannot smuggle one in', () => {
    for (const value of ['kraken', 'Binance', '', null, undefined, 1, {}]) {
      expect(isProviderId(value)).toBe(false)
    }
  })
})

describe('binance market coverage', () => {
  const binance = providerCapabilities('binance')

  it('lets one production key reach both markets', () => {
    expect(binance.coversBothMarkets('live')).toBe(true)
  })

  /*
   * Binance runs two independent testnets with separate sign-ups, so a test
   * credential reaches exactly one market. This is a fact about Binance and
   * lives here rather than in the contract, where it read as a law of test
   * environments and would refuse a valid credential from the next exchange.
   */
  it('holds a test key to one market', () => {
    expect(binance.coversBothMarkets('test')).toBe(false)
  })
})
