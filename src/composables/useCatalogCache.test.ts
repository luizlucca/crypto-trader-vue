import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketCatalog, MarketSelection } from '@shared/types/market'
import { catalogKey, useCatalogCache } from './useCatalogCache'

const futures = { provider: 'binance', market: 'futures' } as MarketSelection
const spot = { provider: 'binance', market: 'spot' } as MarketSelection

function catalog(label: string): MarketCatalog {
  return {
    provider: 'binance',
    market: 'futures',
    quoteAsset: '',
    items: [],
    loadedAt: 0,
    expiresAt: 0,
    cached: false,
    stale: false,
    warning: label,
  }
}

/** Replaces the Electron bridge that `services/marketData` talks to. */
function stubCatalogTransport(): ReturnType<typeof vi.fn> {
  const getCatalog = vi.fn()
  vi.stubGlobal('window', { cryptoPro: { marketData: { getCatalog } } })
  return getCatalog
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('catalog cache', () => {
  it('separates entries by provider and market', () => {
    expect(catalogKey(futures)).not.toBe(catalogKey(spot))
  })

  it('serves a loaded catalog without hitting the provider again', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockResolvedValue(catalog('primeira'))
    const cache = useCatalogCache()

    await cache.ensure(futures)
    await cache.ensure(futures)

    expect(getCatalog).toHaveBeenCalledTimes(1)
    expect(cache.get(futures)?.warning).toBe('primeira')
  })

  it('joins concurrent requests for the same market into one', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockResolvedValue(catalog('unica'))
    const cache = useCatalogCache()

    const [first, second] = await Promise.all([
      cache.ensure(futures),
      cache.ensure(futures),
    ])

    expect(getCatalog).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
  })

  it('lets a forced refresh bypass cache and pending request', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockResolvedValue(catalog('atualizada'))
    const cache = useCatalogCache()

    await cache.ensure(futures)
    await cache.ensure(futures, true)

    expect(getCatalog).toHaveBeenCalledTimes(2)
    expect(getCatalog).toHaveBeenLastCalledWith('binance', 'futures', '', true)
  })

  it('reports loading until the first catalog resolves', async () => {
    const getCatalog = stubCatalogTransport()
    let release: (value: MarketCatalog) => void = () => {}
    getCatalog.mockReturnValue(new Promise((resolve) => {
      release = resolve
    }))
    const cache = useCatalogCache()

    expect(cache.isLoading(futures)).toBe(true)
    const pending = cache.ensure(futures)
    expect(cache.isLoading(futures)).toBe(true)

    release(catalog('pronta'))
    await pending

    expect(cache.isLoading(futures)).toBe(false)
  })

  it('clears the loading flag when the provider fails', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockRejectedValue(new Error('Binance indisponível'))
    const cache = useCatalogCache()

    await expect(cache.ensure(futures)).rejects.toThrow('Binance indisponível')

    // A failure is a resting state, not a load still under way: the list has
    // to stop spinning on a request that will never arrive.
    expect(cache.isLoading(futures)).toBe(false)
    expect(cache.hasFailed(futures)).toBe(true)

    // The in-flight slot must be free so the next attempt reaches the provider.
    await expect(cache.ensure(futures)).rejects.toThrow()
    expect(getCatalog).toHaveBeenCalledTimes(2)
  })

  it('retires the failure once a retry succeeds', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockRejectedValueOnce(new Error('Binance indisponível'))
    getCatalog.mockResolvedValue(catalog('recuperada'))
    const cache = useCatalogCache()

    await expect(cache.ensure(futures)).rejects.toThrow()
    await cache.ensure(futures)

    expect(cache.hasFailed(futures)).toBe(false)
    expect(cache.isLoading(futures)).toBe(false)
    expect(cache.get(futures)?.warning).toBe('recuperada')
  })

  it('keeps a usable list when only the refresh fails', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockResolvedValueOnce(catalog('primeira'))
    getCatalog.mockRejectedValue(new Error('Binance indisponível'))
    const cache = useCatalogCache()

    await cache.ensure(futures)
    await expect(cache.ensure(futures, true)).rejects.toThrow()

    // The cached catalog still answers, so the sidebar has something to show.
    expect(cache.hasFailed(futures)).toBe(false)
    expect(cache.get(futures)?.warning).toBe('primeira')
  })

  it('does not let one market fill another market entry', async () => {
    const getCatalog = stubCatalogTransport()
    getCatalog.mockResolvedValue(catalog('futuros'))
    const cache = useCatalogCache()

    await cache.ensure(futures)

    expect(cache.get(spot)).toBeNull()
    expect(cache.isLoading(spot)).toBe(true)
  })
})
