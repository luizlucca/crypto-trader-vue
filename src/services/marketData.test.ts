import { isProxy, reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candle, MarketSelection } from '@shared/types/market'
import {
  loadCandles,
  onCandle,
  startMarketStream,
  updateMarketCandleStream,
} from './marketData'

const selection: MarketSelection = {
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.01,
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

  it('forwards an immutable historical cursor to Electron', async () => {
    const getCandles = vi.fn().mockResolvedValue([])
    vi.stubGlobal('window', {
      cryptoPro: {
        marketData: { getCandles },
      },
    })

    await loadCandles(selection, 400, 1_722_398_400)

    expect(getCandles).toHaveBeenCalledWith(
      selection,
      400,
      1_722_398_400,
    )
  })

  it('sends an explicit session id and a plain selection for each tab', async () => {
    const startStream = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      cryptoPro: {
        marketData: { startStream },
      },
    })

    const reactiveSelection = reactive({ ...selection, interval: '5m' })
    await startMarketStream('tab-two', reactiveSelection, false)

    expect(startStream).toHaveBeenCalledWith(
      'tab-two',
      { ...selection, interval: '5m' },
      false,
    )
    expect(isProxy(startStream.mock.calls[0][1])).toBe(false)
  })

  it('updates only the candle stream with a clone-safe selection', async () => {
    const updateCandleStream = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      cryptoPro: {
        marketData: { updateCandleStream },
      },
    })

    const reactiveSelection = reactive({ ...selection, interval: '15m' })
    await updateMarketCandleStream('tab-two', reactiveSelection)

    expect(updateCandleStream).toHaveBeenCalledWith(
      'tab-two',
      { ...selection, interval: '15m' },
      true,
    )
    expect(isProxy(updateCandleStream.mock.calls[0][1])).toBe(false)
  })

  it('uses one transport listener and routes candles by session id', () => {
    const callbacks: Array<(sessionId: string, candle: Candle) => void> = []
    const removeTransport = vi.fn()
    const subscribeTransport = vi.fn((callback) => {
      callbacks.push(callback)
      return removeTransport
    })
    vi.stubGlobal('window', {
      cryptoPro: {
        marketData: { onCandle: subscribeTransport },
      },
    })
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = onCandle('tab-one', first)
    const unsubscribeSecond = onCandle('tab-two', second)
    const payload: Candle = {
      provider: 'binance',
      market: 'futures',
      symbol: 'BTCUSDT',
      interval: '1h',
      time: 1,
      closeTime: 2,
      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1,
      quoteVolume: 100,
      closed: false,
    }

    callbacks[0]('tab-two', payload)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(payload)
    expect(subscribeTransport).toHaveBeenCalledOnce()

    unsubscribeFirst()
    expect(removeTransport).not.toHaveBeenCalled()
    unsubscribeSecond()
    expect(removeTransport).toHaveBeenCalledOnce()
  })

  it('fails clearly without Electron and keeps mounted subscriptions safe', async () => {
    vi.stubGlobal('window', {})

    const unsubscribe = onCandle('tab-one', () => {})
    expect(unsubscribe).toEqual(expect.any(Function))
    unsubscribe()
    await expect(loadCandles(selection)).rejects.toThrow(
      'API Electron indisponível',
    )
  })
})
