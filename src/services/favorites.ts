import type { MarketSymbol } from '@shared/types/market'

const storageKey = 'cryptopro.market-favorites.v1'

// Every comparison against a stored key goes through `favoriteKey`, which
// lower-cases. Seeds and stored values are normalized the same way so a key
// written by an older build still matches the pair it names.
const initialFavorites = [
  'binance:spot:btcusdt',
  'binance:spot:ethusdt',
  'binance:spot:solusdt',
  'binance:futures:btcusdt',
  'binance:futures:ethusdt',
  'binance:futures:solusdt',
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
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.toLowerCase()),
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
