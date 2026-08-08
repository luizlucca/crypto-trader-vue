import { describe, expect, it, vi } from 'vitest'
import type { MarketEnvironment } from '@shared/types/market'
import { BinanceAccountProvider } from './binanceAccountProvider'

function providerWithSpy(environment: MarketEnvironment) {
  const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => ({}),
  }))
  const provider = new BinanceAccountProvider({ fetch, now: () => 1_000 })
  return {
    fetch,
    validate: (markets: ('spot' | 'futures')[]) => provider.validateConnection(
      { apiKey: 'key', apiSecret: 'secret' },
      markets,
      { signal: new AbortController().signal, environment },
    ),
  }
}

function hosts(fetch: ReturnType<typeof vi.fn>): string[] {
  return fetch.mock.calls.map(([url]) => new URL(String(url)).origin)
}

describe('account validation targets the venue that issued the key', () => {
  it('checks production credentials against production hosts', async () => {
    const { fetch, validate } = providerWithSpy('live')

    await validate(['spot', 'futures'])

    expect(hosts(fetch).sort()).toEqual([
      'https://api.binance.com',
      'https://fapi.binance.com',
    ])
  })

  it('checks test credentials against the testnet hosts', async () => {
    const { fetch, validate } = providerWithSpy('test')

    await validate(['spot', 'futures'])

    expect(hosts(fetch).sort()).toEqual([
      'https://demo-fapi.binance.com',
      'https://testnet.binance.vision',
    ])
  })

  /*
   * The failure this prevents is the expensive one: a testnet key checked
   * against production comes back "credencial inválida", and the operator
   * spends the afternoon regenerating a key that was fine all along.
   */
  it('never reaches a production host while validating a test account',
    async () => {
      const { fetch, validate } = providerWithSpy('test')

      await validate(['spot', 'futures'])

      for (const host of hosts(fetch)) {
        expect(host).not.toBe('https://api.binance.com')
        expect(host).not.toBe('https://fapi.binance.com')
      }
    })

  it('still signs the request the same way in either environment',
    async () => {
      const live = providerWithSpy('live')
      const test = providerWithSpy('test')

      await live.validate(['spot'])
      await test.validate(['spot'])

      const liveURL = new URL(String(live.fetch.mock.calls[0][0]))
      const testURL = new URL(String(test.fetch.mock.calls[0][0]))
      expect(liveURL.searchParams.get('signature'))
        .toBe(testURL.searchParams.get('signature'))
      expect(testURL.searchParams.get('symbol')).toBe('BTCUSDT')
    })
})
