// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { MarketSelection } from '@shared/types/market'
import {
  drawingKey,
  migrateDrawingKey,
  readDrawings,
  writeDrawings,
} from './drawingStore'
import type { ChartDrawing } from '@drawings/domain/chartDrawings'

const STORAGE_KEY = 'cryptopro.chart-drawings.v1'

function selection(
  environment: MarketSelection['environment'],
): MarketSelection {
  return {
    provider: 'binance',
    environment,
    market: 'futures',
    symbol: 'BTCUSDT',
    interval: '1h',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    priceTickSize: 0.01,
    pricePrecision: 2,
    quantityPrecision: 3,
  }
}

const trendLine: ChartDrawing = {
  id: 'drawing-one',
  tool: 'trend-line',
  anchors: [
    { time: 1, price: 100 },
    { time: 2, price: 200 },
  ],
  color: '#2962ff',
  lineWidth: 2,
}

beforeEach(() => {
  window.localStorage.clear()
})

describe('drawing key scoping', () => {
  it('separates the same pair across environments', () => {
    expect(drawingKey(selection('live')))
      .not.toBe(drawingKey(selection('test')))
  })

  /*
   * Drawings are the one thing that survives an environment switch — they
   * live on disk and outlast the tab. That is exactly why the key has to
   * carry the environment: testnet BTCUSDT trades at its own prices, so a
   * production trend line would land nowhere near those candles.
   */
  it('does not show a production drawing on the test chart', () => {
    writeDrawings(selection('live'), [trendLine])

    expect(readDrawings(selection('test'))).toEqual([])
    expect(readDrawings(selection('live'))).toHaveLength(1)
  })

  it('keeps each environment’s drawings across a round trip', () => {
    writeDrawings(selection('live'), [trendLine])
    writeDrawings(selection('test'), [{ ...trendLine, id: 'drawing-two' }])

    expect(readDrawings(selection('live'))[0]?.id).toBe('drawing-one')
    expect(readDrawings(selection('test'))[0]?.id).toBe('drawing-two')
  })
})

describe('migration of keys written before environments existed', () => {
  it('reads a three-segment key as production', () => {
    expect(migrateDrawingKey('binance:futures:BTCUSDT'))
      .toBe('binance:live:futures:BTCUSDT')
  })

  it('leaves an already migrated key untouched', () => {
    const current = drawingKey(selection('test'))
    expect(migrateDrawingKey(current)).toBe(current)
  })

  /*
   * The acceptance criterion that matters most here: an operator upgrading
   * must not lose work. A trend line took a decision and two clicks.
   */
  it('does not lose a drawing stored under the old key', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      'binance:futures:BTCUSDT': [trendLine],
    }))

    expect(readDrawings(selection('live'))).toHaveLength(1)
    expect(readDrawings(selection('test'))).toEqual([])
  })

  it('never lets a legacy key overwrite one already in the new shape', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      'binance:live:futures:BTCUSDT': [{ ...trendLine, id: 'novo' }],
      'binance:futures:BTCUSDT': [{ ...trendLine, id: 'antigo' }],
    }))

    expect(readDrawings(selection('live'))[0]?.id).toBe('novo')
  })
})
