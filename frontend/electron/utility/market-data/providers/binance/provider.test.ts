import { afterEach, describe, expect, it, vi } from 'vitest'
import { BinanceProvider } from './provider'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('BinanceProvider catalog cache', () => {
  it('shares concurrent refreshes, honors TTL and supports forced refresh', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const payload = url.includes('/exchangeInfo')
        ? {
            symbols: [{
              symbol: 'BTCUSDT',
              status: 'TRADING',
              contractType: 'PERPETUAL',
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              filters: [],
            }],
          }
        : [{
            symbol: 'BTCUSDT',
            lastPrice: '64000',
            quoteVolume: '1000000',
          }]
      return new Response(JSON.stringify(payload), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new BinanceProvider()
    const request = {
      market: 'futures' as const,
      quoteAsset: '',
      forceRefresh: false,
    }
    const [first, concurrent] = await Promise.all([
      provider.getCatalog(request),
      provider.getCatalog(request),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.items).toHaveLength(1)
    expect(concurrent.items[0].lastPrice).toBe(64000)

    const cached = await provider.getCatalog(request)
    expect(cached.cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const refreshed = await provider.getCatalog({
      ...request,
      forceRefresh: true,
    })
    expect(refreshed.cached).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
