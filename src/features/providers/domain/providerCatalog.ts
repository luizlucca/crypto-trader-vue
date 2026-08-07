export interface ProviderDefinition {
  id: 'binance'
  name: string
  description: string
  available: boolean
}

export const providerCatalog: readonly ProviderDefinition[] = [
  {
    id: 'binance',
    name: 'Binance',
    description: 'Spot e Futuros com API key e secret.',
    available: true,
  },
]

export function getProviderDefinition(
  id: ProviderDefinition['id'],
): ProviderDefinition | undefined {
  return providerCatalog.find((provider) => provider.id === id)
}
