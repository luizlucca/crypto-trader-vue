import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { BinanceAccountProvider } from './binanceAccountProvider'

const credentials = {
  apiKey: 'binance-api-key',
  apiSecret: 'binance-api-secret',
}
const timestamp = 1_723_984_000_000

function validationContext(): { signal: AbortSignal } {
  return { signal: new AbortController().signal }
}

function response(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('BinanceAccountProvider', () => {
  it(
    'signs the private Spot commission validation request without leaking the secret',
    async () => {
      const fetch = vi.fn().mockResolvedValue(response(200))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      await expect(provider.validateConnection(
        credentials,
        ['spot'],
        validationContext(),
      ))
        .resolves.toEqual([{ market: 'spot', state: 'connected' }])

      const [url, options] = fetch.mock.calls[0] as [string, RequestInit]
      const request = new URL(url)
      const payload = `symbol=BTCUSDT&timestamp=${timestamp}&recvWindow=5000`
      const signature = createHmac('sha256', credentials.apiSecret)
        .update(payload)
        .digest('hex')
      expect(request.origin + request.pathname)
        .toBe('https://api.binance.com/api/v3/account/commission')
      expect(request.searchParams.get('symbol')).toBe('BTCUSDT')
      expect(request.searchParams.get('signature')).toBe(signature)
      expect(options.headers).toEqual({ 'X-MBX-APIKEY': credentials.apiKey })
      expect(url).not.toContain(credentials.apiSecret)
    },
  )

  it('uses signed commission endpoints without requesting balances or positions',
    async () => {
      const fetch = vi.fn().mockResolvedValue(response(200))
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      const result = await provider.validateConnection(
        credentials,
        ['spot', 'futures'],
        validationContext(),
      )

      expect(result).toEqual([
        { market: 'spot', state: 'connected' },
        { market: 'futures', state: 'connected' },
      ])
      expect(fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        '/api/v3/account/commission',
        '/fapi/v1/commissionRate',
      ])
      for (const [url] of fetch.mock.calls as [string][]) {
        const request = new URL(url)
        expect(request.searchParams.get('symbol')).toBe('BTCUSDT')
        expect(request.pathname).not.toBe('/api/v3/account')
        expect(request.pathname).not.toBe('/fapi/v2/account')
      }
    },
  )

  it('constrains both market validation requests to their original origins',
    async () => {
      const fetch = vi.fn().mockResolvedValue(response(200))
      const controller = new AbortController()
      const provider = new BinanceAccountProvider({
        fetch,
        now: () => timestamp,
      })

      await provider.validateConnection(
        credentials,
        ['spot', 'futures'],
        { signal: controller.signal },
      )

      expect(fetch.mock.calls).toHaveLength(2)
      for (const [, options] of fetch.mock.calls as [string, RequestInit][]) {
        expect(options).toMatchObject({
          method: 'GET',
          redirect: 'error',
          signal: controller.signal,
        })
      }
      expect((fetch.mock.calls[0]?.[1] as RequestInit).signal)
        .toBe((fetch.mock.calls[1]?.[1] as RequestInit).signal)
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

      await expect(provider.validateConnection(
        credentials,
        ['futures'],
        validationContext(),
      ))
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

      await expect(provider.validateConnection(
        credentials,
        ['spot'],
        validationContext(),
      ))
        .resolves.toEqual([
          { market: 'spot', state: 'failed', failureCode: 'network' },
        ])
    },
  )
})
