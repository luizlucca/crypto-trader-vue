import type { Market, MarketSymbol } from '@shared/types/market'

const storageKey = 'cryptopro.market-favorites.v1'

const initialFavorites = [
  'binance:spot:BTCUSDT',
  'binance:spot:ETHUSDT',
  'binance:spot:SOLUSDT',
  'binance:futures:BTCUSDT',
  'binance:futures:ETHUSDT',
  'binance:futures:SOLUSDT',
]

export function favoriteKey(
  item: Pick<MarketSymbol, 'provider' | 'market' | 'symbol'>,
): string {
  return `${item.provider}:${item.market}:${item.symbol}`.toLowerCase()
}

export function loadFavoriteKeys(): Set<string> {
  try {
    const encoded = window.localStorage.getItem(storageKey)
    if (!encoded) {
      const defaults = new Set(initialFavorites)
      saveFavoriteKeys(defaults)
      return defaults
    }

    const values: unknown = JSON.parse(encoded)
    if (!Array.isArray(values)) {
      return new Set()
    }
    return new Set(
      values.filter((value): value is string => typeof value === 'string'),
    )
  } catch {
    return new Set(initialFavorites)
  }
}

export function saveFavoriteKeys(keys: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify([...keys].sort()))
  } catch {
    // Favorites remain available for the current session when storage is denied.
  }
}

export function belongsToMarket(
  key: string,
  provider: string,
  market: Market,
): boolean {
  return key.startsWith(`${provider}:${market}:`.toLowerCase())
}
