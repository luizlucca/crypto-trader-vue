import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { BinanceAccountProvider } from './binanceAccountProvider'

const credentials = {
  apiKey: 'binance-api-key',
  apiSecret: 'binance-api-secret',
}
const timestamp = 1_723_984_000_000

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('BinanceAccountProvider', () => {
  it(
    'signs the private Spot validation request without leaking the secret',
    async () => {
      const fetch = vi.fn().mockResolvedValue(response(200))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      await expect(provider.validateConnection(credentials, ['spot']))
        .resolves.toEqual([{ market: 'spot', state: 'connected' }])

      const [url, options] = fetch.mock.calls[0] as [string, RequestInit]
      const request = new URL(url)
      const payload = `timestamp=${timestamp}&recvWindow=5000`
      const signature = createHmac('sha256', credentials.apiSecret)
        .update(payload)
        .digest('hex')
      expect(request.origin + request.pathname)
        .toBe('https://api.binance.com/api/v3/account')
      expect(request.searchParams.get('signature')).toBe(signature)
      expect(options.headers).toEqual({ 'X-MBX-APIKEY': credentials.apiKey })
      expect(url).not.toContain(credentials.apiSecret)
    },
  )

  it('validates selected Spot and Futures endpoints independently',
    async () => {
      const fetch = vi.fn().mockResolvedValue(response(200))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      const result = await provider.validateConnection(
        credentials,
        ['spot', 'futures'],
      )

      expect(result).toEqual([
        { market: 'spot', state: 'connected' },
        { market: 'futures', state: 'connected' },
      ])
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        '/api/v3/account',
        '/fapi/v2/account',
      ])
    },
  )

  it.each([
    [401, {}, 'credentials'],
    [403, {}, 'permission'],
    [400, { code: -1021 }, 'clock'],
    [400, { code: -2015 }, 'credentials'],
  ] as const)(
    'maps Binance failure %s to %s',
    async (status, body, failureCode) => {
      const fetch = vi.fn().mockResolvedValue(response(status, body))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      await expect(provider.validateConnection(credentials, ['futures']))
        .resolves.toEqual([
          { market: 'futures', state: 'failed', failureCode },
        ])
    },
  )

  it('maps a transport rejection without exposing the provider error',
    async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('socket unavailable'))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      await expect(provider.validateConnection(credentials, ['spot']))
        .resolves.toEqual([
          { market: 'spot', state: 'failed', failureCode: 'network' },
        ])
    },
  )
})
