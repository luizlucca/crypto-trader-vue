import type { MarketSelection, MarketSymbol } from '@shared/types/market'

/**
 * Selection every window falls back to before the catalog resolves. Both the
 * workspace and the symbol search window boot from this single definition so
 * they can never drift apart.
 */
export const DEFAULT_MARKET_SELECTION: MarketSelection = {
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

export function createDefaultMarketSelection(): MarketSelection {
  return { ...DEFAULT_MARKET_SELECTION }
}

/**
 * Identifies the data stream a selection subscribes to. Presentation-only
 * fields such as precision are excluded: changing them must not invalidate a
 * loaded candle history.
 */
export function marketSelectionFingerprint(
  selection: MarketSelection,
): string {
  return [
    selection.provider,
    selection.market,
    selection.symbol,
    selection.interval,
  ].join(':')
}

export function selectionForNewTab(
  source: MarketSelection,
  symbol: MarketSymbol,
): MarketSelection {
  return {
    ...source,
    provider: symbol.provider,
    market: symbol.market,
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    priceTickSize: symbol.priceTickSize,
    pricePrecision: symbol.pricePrecision,
    quantityPrecision: symbol.quantityPrecision,
  }
}
