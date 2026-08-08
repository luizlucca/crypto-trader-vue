import { describe, expect, it } from 'vitest'
import { getProviderDefinition, providerCatalog } from './providerCatalog'

describe('catálogo de provedores', () => {
  it('expõe a Binance como o provedor disponível para novas contas', () => {
    expect(providerCatalog).toEqual([
      {
        id: 'binance',
        name: 'Binance',
        description: 'Spot e Futuros com API key e secret.',
        available: true,
      },
    ])
    expect(getProviderDefinition('binance')?.available).toBe(true)
  })
})
