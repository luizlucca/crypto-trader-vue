import { describe, expect, it } from 'vitest'
import {
  describeStreamFrame,
  isKlineEvent,
  mergeCatalog,
  normalizeCandleRow,
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
      priceTickSize: 0.1,
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
})

describe('quadros que não são candles', () => {
  const kline = {
    s: 'BTCUSDT',
    k: {
      i: '1h', t: 1_700_000_000_000, T: 1_700_003_599_999,
      o: '1', h: '2', l: '0.5', c: '1.5', v: '10', q: '15', x: true,
    },
  }

  it('reconhece um kline de verdade', () => {
    expect(isKlineEvent(kline)).toBe(true)
  })

  it('recusa o que o mesmo socket também entrega', () => {
    // O socket carrega resposta de assinatura e erro da corretora. Tratar
    // isso como candle malformado errava o observable e derrubava o stream
    // para sempre, porque a reconexão recebia o mesmo quadro.
    expect(isKlineEvent({ result: null, id: 1 })).toBe(false)
    expect(isKlineEvent({ error: { code: -1121, msg: 'Invalid symbol' } }))
      .toBe(false)
    expect(isKlineEvent(null)).toBe(false)
    expect(isKlineEvent({ s: 'BTCUSDT' })).toBe(false)
  })

  it('descreve o motivo para a linha de status', () => {
    expect(describeStreamFrame({ error: { code: -1121, msg: 'Invalid symbol' } }))
      .toBe('A Binance recusou a assinatura (-1121): Invalid symbol')
    expect(describeStreamFrame({ result: null }))
      .toBe('Quadro ignorado no stream de candles: não é um kline')
  })
})
