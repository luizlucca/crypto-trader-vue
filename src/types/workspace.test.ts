import { describe, expect, it } from 'vitest'
import type { MarketSelection } from './market'
import {
  applyWorkspaceStreamStatus,
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
    expect(tab.candleState).toBe('connecting')
    expect(tab.orderBookState).toBe('connecting')
    expect(workspaceTabLabel(tab)).toBe('BTC/USDT')
    expect(marketSelectionFingerprint(tab.selection)).toBe(
      'binance:futures:BTCUSDT:5m',
    )
  })

  it('keeps the order-book state independent from an aggregate stream error', () => {
    const tab = createWorkspaceTab(selection, 'tab-one')

    applyWorkspaceStreamStatus(tab, {
      provider: 'binance',
      market: 'futures',
      symbol: 'BTCUSDT',
      state: 'error',
      candleState: 'error',
      orderBookState: 'connected',
      message: 'Falha temporária nos candles',
    })

    expect(tab.status).toBe('error')
    expect(tab.candleState).toBe('error')
    expect(tab.orderBookState).toBe('connected')
    expect(tab.statusMessage).toBe('Falha temporária nos candles')
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
