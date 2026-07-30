import { describe, expect, it } from 'vitest'
import type { MarketSelection } from './market'
import {
  createWorkspaceTab,
  marketSelectionFingerprint,
  selectionForNewTab,
  workspaceTabLabel,
} from './workspace'

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

describe('workspace tabs', () => {
  it('creates an independent copy of the market selection', () => {
    const tab = createWorkspaceTab(selection, 'tab-one')
    tab.selection.interval = '5m'

    expect(selection.interval).toBe('1h')
    expect(tab.id).toBe('tab-one')
    expect(workspaceTabLabel(tab)).toBe('BTC/USDT')
    expect(marketSelectionFingerprint(tab.selection)).toBe(
      'binance:futures:BTCUSDT:5m',
    )
  })

  it('opens another symbol without changing the source tab period', () => {
    const nextSelection = selectionForNewTab(selection, {
      provider: 'binance',
      market: 'futures',
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
      quoteAsset: 'USDT',
      status: 'TRADING',
      pricePrecision: 2,
      quantityPrecision: 3,
    })

    expect(nextSelection).toEqual({
      ...selection,
      symbol: 'ETHUSDT',
      baseAsset: 'ETH',
    })
    expect(nextSelection.interval).toBe('1h')
    expect(selection.symbol).toBe('BTCUSDT')
  })
})
