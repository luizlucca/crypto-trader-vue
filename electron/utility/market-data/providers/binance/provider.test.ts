import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketSelection } from '../../../../../src/types/market'
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

describe('BinanceProvider candle history', () => {
  it('uses an exclusive endTime cursor on the market-specific endpoint', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify([
      [
        1_722_394_800_000,
        '64000',
        '64100',
        '63900',
        '64050',
        '10',
        1_722_398_399_999,
        '640500',
      ],
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new BinanceProvider()
    const baseSelection: Omit<MarketSelection, 'market'> = {
      provider: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      priceTickSize: 0.01,
      pricePrecision: 2,
      quantityPrecision: 3,
    }

    await provider.getCandles(
      { ...baseSelection, market: 'futures' },
      { limit: 400, before: 1_722_398_400 },
    )
    await provider.getCandles(
      { ...baseSelection, market: 'spot' },
      { limit: 400, before: 1_722_398_400 },
    )

    const futuresURL = new URL(String(fetchMock.mock.calls[0][0]))
    const spotURL = new URL(String(fetchMock.mock.calls[1][0]))
    expect(`${futuresURL.origin}${futuresURL.pathname}`).toBe(
      'https://fapi.binance.com/fapi/v1/klines',
    )
    expect(`${spotURL.origin}${spotURL.pathname}`).toBe(
      'https://api.binance.com/api/v3/klines',
    )
    expect(futuresURL.searchParams.get('limit')).toBe('400')
    expect(futuresURL.searchParams.get('endTime')).toBe('1722398399999')
    expect(spotURL.searchParams.get('endTime')).toBe('1722398399999')
  })
})
