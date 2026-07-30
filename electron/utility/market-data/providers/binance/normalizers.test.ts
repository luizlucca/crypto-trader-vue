import { describe, expect, it } from 'vitest'
import {
  mergeCatalog,
  normalizeCandleRow,
  normalizeDepthEvent,
  normalizeExchangeSymbols,
  precisionFromIncrement,
} from './normalizers'

describe('Binance normalizers', () => {
  it('derives decimal precision from exchange increments', () => {
    expect(precisionFromIncrement('0.01000000')).toBe(2)
    expect(precisionFromIncrement('1.00000000')).toBe(0)
    expect(precisionFromIncrement(undefined)).toBe(-1)
  })

  it('keeps only trading perpetual contracts in futures', () => {
    const symbols = normalizeExchangeSymbols('futures', [
      {
        symbol: 'BTCUSDT',
        status: 'TRADING',
        contractType: 'PERPETUAL',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        pricePrecision: 8,
        quantityPrecision: 8,
        filters: [
          { filterType: 'PRICE_FILTER', tickSize: '0.10' },
          { filterType: 'LOT_SIZE', stepSize: '0.001' },
        ],
      },
      {
        symbol: 'BTCUSDT_260925',
        status: 'TRADING',
        contractType: 'CURRENT_QUARTER',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
      },
      {
        symbol: 'OLDUSDT',
        status: 'BREAK',
        contractType: 'PERPETUAL',
        baseAsset: 'OLD',
        quoteAsset: 'USDT',
      },
    ])

    expect(symbols).toHaveLength(1)
    expect(symbols[0]).toMatchObject({
      symbol: 'BTCUSDT',
      pricePrecision: 1,
      quantityPrecision: 3,
    })
  })

  it('merges 24h ticker fields without losing symbol metadata', () => {
    const [symbol] = normalizeExchangeSymbols('spot', [{
      symbol: 'ETHUSDT',
      status: 'TRADING',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
    }])
    const [pair] = mergeCatalog([symbol], [{
      symbol: 'ETHUSDT',
      lastPrice: '3500.25',
      priceChangePercent: '2.15',
      quoteVolume: '1234567.89',
      count: 42,
    }])

    expect(pair).toMatchObject({
      provider: 'binance',
      market: 'spot',
      symbol: 'ETHUSDT',
      lastPrice: 3500.25,
      priceChangePercent: 2.15,
      quoteVolume: 1234567.89,
      tradeCount: 42,
    })
  })

  it('converts Binance millisecond timestamps to chart seconds', () => {
    const candle = normalizeCandleRow(
      [
        1_700_000_000_000,
        '100',
        '110',
        '90',
        '105',
        '12.5',
        1_700_000_059_999,
        '1280',
      ],
      'spot',
      'BTCUSDT',
      '1m',
      1_700_000_060_000,
    )

    expect(candle.time).toBe(1_700_000_000)
    expect(candle.closeTime).toBe(1_700_000_059)
    expect(candle.closed).toBe(true)
  })

  it('computes cumulative depth, mid price and spread', () => {
    const snapshot = normalizeDepthEvent({
      E: 123,
      s: 'BTCUSDT',
      u: 456,
      b: [['100', '2'], ['99', '3']],
      a: [['101', '1'], ['102', '4']],
    }, 'futures', 'FALLBACK')

    expect(snapshot.bids.map((level) => level.total)).toEqual([2, 5])
    expect(snapshot.asks.map((level) => level.total)).toEqual([1, 5])
    expect(snapshot.midPrice).toBe(100.5)
    expect(snapshot.spread).toBe(1)
  })
})
