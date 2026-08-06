import type { MarketPair } from '@shared/types/market'

export type CatalogSortKey
  = | 'symbol'
    | 'lastPrice'
    | 'priceChangePercent'
    | 'quoteVolume'
export type CatalogSortDirection = 'asc' | 'desc'

export interface CatalogSearchCriteria {
  query: string
  quoteAsset: string
  favoritesOnly: boolean
  favoriteKeys: string[]
  sortKey: CatalogSortKey
  sortDirection: CatalogSortDirection
}

export interface SearchableMarketPair {
  sourceIndex: number
  favoriteKey: string
  symbol: string
  quoteAsset: string
  searchKey: string
  lastPrice: number
  priceChangePercent: number
  quoteVolume: number
}

export interface CatalogWorkerInitRequest {
  type: 'init'
  generation: number
  items: MarketPair[]
}

export interface CatalogWorkerSearchRequest {
  type: 'search'
  generation: number
  requestId: number
  criteria: CatalogSearchCriteria
}

export type CatalogWorkerRequest
  = | CatalogWorkerInitRequest
    | CatalogWorkerSearchRequest

export interface CatalogWorkerReadyResponse {
  type: 'ready'
  generation: number
  quoteAssets: string[]
}

export interface CatalogWorkerResultResponse {
  type: 'result'
  generation: number
  requestId: number
  indexes: Uint32Array
}

export interface CatalogWorkerErrorResponse {
  type: 'error'
  generation: number
  requestId?: number
  message: string
}

export type CatalogWorkerResponse
  = | CatalogWorkerReadyResponse
    | CatalogWorkerResultResponse
    | CatalogWorkerErrorResponse

function normalizedFavoriteKey(item: MarketPair): string {
  return `${item.provider}:${item.market}:${item.symbol}`.toLowerCase()
}

export function createSearchIndex(
  items: MarketPair[],
): SearchableMarketPair[] {
  return items.map((item, sourceIndex) => ({
    sourceIndex,
    favoriteKey: normalizedFavoriteKey(item),
    symbol: item.symbol,
    quoteAsset: item.quoteAsset,
    searchKey: `${item.symbol}${item.baseAsset}${item.quoteAsset}`.toUpperCase(),
    lastPrice: item.lastPrice,
    priceChangePercent: item.priceChangePercent,
    quoteVolume: item.quoteVolume,
  }))
}

export function collectQuoteAssets(
  items: SearchableMarketPair[],
): string[] {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    counts.set(item.quoteAsset, (counts.get(item.quoteAsset) ?? 0) + 1)
  })
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([asset]) => asset)
}

export function searchCatalog(
  items: SearchableMarketPair[],
  criteria: CatalogSearchCriteria,
): Uint32Array {
  const normalizedQuery = criteria.query
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  const favorites = criteria.favoritesOnly
    ? new Set(criteria.favoriteKeys)
    : undefined
  const matches: SearchableMarketPair[] = []

  items.forEach((item) => {
    if (criteria.quoteAsset && item.quoteAsset !== criteria.quoteAsset) {
      return
    }
    if (favorites && !favorites.has(item.favoriteKey)) {
      return
    }
    if (normalizedQuery && !item.searchKey.includes(normalizedQuery)) {
      return
    }
    matches.push(item)
  })

  const direction = criteria.sortDirection === 'asc' ? 1 : -1
  const sortKey = criteria.sortKey
  matches.sort((left, right) => {
    let result: number
    if (sortKey === 'symbol') {
      result = left.symbol < right.symbol
        ? -1
        : left.symbol > right.symbol
          ? 1
          : 0
    } else {
      result = left[sortKey] - right[sortKey]
    }
    if (result === 0) {
      return left.symbol < right.symbol
        ? -1
        : left.symbol > right.symbol
          ? 1
          : 0
    }
    return result * direction
  })

  return Uint32Array.from(matches, (item) => item.sourceIndex)
}
