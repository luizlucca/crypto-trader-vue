import { describe, expect, it } from 'vitest'
import { AccountProviderRegistry } from './accountProvider'

describe('AccountProviderRegistry', () => {
  it('returns the registered provider by its stable id', () => {
    const provider = {
      id: 'binance' as const,
      validateConnection: async () => [],
    }
    const registry = new AccountProviderRegistry([provider])

    expect(registry.get('binance')).toBe(provider)
  })

  it('fails explicitly for an unregistered provider', () => {
    const registry = new AccountProviderRegistry([])

    expect(() => registry.get('binance'))
      .toThrow('Provider de conta indisponível')
  })
})
