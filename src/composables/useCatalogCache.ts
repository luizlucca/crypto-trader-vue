import { shallowRef } from 'vue'
import type { MarketCatalog, MarketSelection } from '@shared/types/market'
import { loadMarketCatalog } from '@/services/marketData'

type CatalogScope = Pick<MarketSelection, 'provider' | 'market'>

export function catalogKey(scope: CatalogScope): string {
  return `${scope.provider}:${scope.market}`
}

/**
 * Per-provider/market catalog cache with single-flight.
 *
 * Both maps are `shallowRef` holding immutable snapshots rather than `reactive`
 * containers: a catalog carries thousands of pairs, and deep reactivity would
 * make Vue walk every one of them to install proxies. Replacing the whole map
 * is one dependency notification; the pair objects themselves are never
 * observed.
 */
export function useCatalogCache() {
  const catalogs = shallowRef(new Map<string, MarketCatalog>())
  const loadingKeys = shallowRef(new Set<string>())
  const inFlight = new Map<string, Promise<MarketCatalog>>()

  function setLoading(key: string, loading: boolean): void {
    const next = new Set(loadingKeys.value)
    if (loading) {
      next.add(key)
    } else {
      next.delete(key)
    }
    loadingKeys.value = next
  }

  function get(scope: CatalogScope): MarketCatalog | null {
    return catalogs.value.get(catalogKey(scope)) ?? null
  }

  function isLoading(scope: CatalogScope): boolean {
    const key = catalogKey(scope)
    return loadingKeys.value.has(key) || !catalogs.value.has(key)
  }

  async function ensure(
    scope: CatalogScope,
    forceRefresh = false,
  ): Promise<MarketCatalog> {
    const key = catalogKey(scope)
    const cached = catalogs.value.get(key)
    if (cached && !forceRefresh) {
      return cached
    }
    // A forced refresh must reach the provider even if a normal load is
    // already running, so it does not join the in-flight request.
    const pending = inFlight.get(key)
    if (pending && !forceRefresh) {
      return pending
    }

    setLoading(key, true)
    const request = loadMarketCatalog(
      scope.provider,
      scope.market,
      '',
      forceRefresh,
    )
    inFlight.set(key, request)
    try {
      const catalog = await request
      const next = new Map(catalogs.value)
      next.set(key, catalog)
      catalogs.value = next
      return catalog
    } finally {
      // Only the request that still owns the slot may clear it: a forced
      // refresh may have replaced this one in the meantime.
      if (inFlight.get(key) === request) {
        inFlight.delete(key)
        setLoading(key, false)
      }
    }
  }

  return { get, isLoading, ensure }
}
