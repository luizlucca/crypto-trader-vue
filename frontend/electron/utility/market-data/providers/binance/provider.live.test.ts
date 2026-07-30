import { firstValueFrom, timeout } from 'rxjs'
import { describe, expect, it } from 'vitest'
import type { Market, MarketSelection } from '../../../../../src/types/market'
import { BinanceProvider } from './provider'

const live = process.env.BINANCE_LIVE_TEST === '1'

function selection(market: Market): MarketSelection {
  return {
    provider: 'binance',
    market,
    symbol: 'BTCUSDT',
    interval: '1m',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    pricePrecision: 2,
    quantityPrecision: 3,
  }
}

describe.runIf(live)('BinanceProvider live', () => {
  for (const market of ['spot', 'futures'] as const) {
    it(`loads REST and receives both ${market} streams`, async () => {
      const provider = new BinanceProvider()
      const selected = selection(market)
      const [catalog, candles] = await Promise.all([
        provider.getCatalog({
          market,
          quoteAsset: 'USDT',
          forceRefresh: true,
        }),
        provider.getCandles(selected, 5),
      ])

      expect(catalog.items.some((item) => item.symbol === 'BTCUSDT')).toBe(true)
      expect(candles).toHaveLength(5)

      const [nextCandle, nextBook] = await Promise.all([
        firstValueFrom(
          provider.streamCandles(selected, () => {}).pipe(timeout(15_000)),
        ),
        firstValueFrom(
          provider.streamOrderBook(selected, () => {}).pipe(timeout(15_000)),
        ),
      ])

      expect(nextCandle.symbol).toBe('BTCUSDT')
      expect(nextBook.symbol).toBe('BTCUSDT')
      expect(nextBook.bids.length).toBeGreaterThan(0)
      expect(nextBook.asks.length).toBeGreaterThan(0)
    }, 30_000)
  }
})
