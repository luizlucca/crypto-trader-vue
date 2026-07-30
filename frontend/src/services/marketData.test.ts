import { isProxy, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarketSelection } from '../types/market'
import { loadCandles, onCandle } from './marketData'

const selection: MarketSelection = {
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  pricePrecision: 2,
  quantityPrecision: 3,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('marketData transport', () => {
  it('turns a Vue Proxy into a structured-clone-safe Electron payload', async () => {
    const getCandles = vi.fn().mockResolvedValue([])
    vi.stubGlobal('window', {
      cryptoPro: {
        marketData: { getCandles },
      },
    })

    const reactiveSelection = reactive({ ...selection })
    expect(isProxy(reactiveSelection)).toBe(true)
    await loadCandles(reactiveSelection)

    const payload = getCandles.mock.calls[0][0]
    expect(isProxy(payload)).toBe(false)
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual(selection)
  })

  it('fails clearly without Electron and keeps mounted subscriptions safe', async () => {
    vi.stubGlobal('window', {})

    expect(onCandle(() => {})).toEqual(expect.any(Function))
    await expect(loadCandles(selection)).rejects.toThrow(
      'API Electron indisponível',
    )
  })
})
