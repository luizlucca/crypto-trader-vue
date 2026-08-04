import { describe, expect, it } from 'vitest'
import type { MarketSelection, StreamState } from '@shared/types/market'
import {
  marketSelectionFingerprint,
  selectionForNewTab,
} from './marketSelection'
import {
  applyWorkspaceStreamStatus,
  sessionStatusLabel,
  createWorkspaceTab,
  workspaceTabLabel,
} from './workspace'

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

describe('workspace tabs', () => {
  it('creates an independent copy of the market selection', () => {
    const tab = createWorkspaceTab(selection, 'tab-one')
    tab.selection.interval = '5m'

    expect(selection.interval).toBe('1h')
    expect(tab.id).toBe('tab-one')
    expect(tab.candleState).toBe('connecting')
    expect(tab.orderBookState).toBe('connecting')
    expect(tab.orderBookAggregation).toBe(0.01)
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
      priceTickSize: 0.01,
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

describe('o que a barra de status diz da sessão', () => {
  const tab = (candleState: StreamState, orderBookState: StreamState) => ({
    candleState,
    orderBookState,
  })

  it('fala de um estado só quando os dois streams concordam', () => {
    expect(sessionStatusLabel(tab('connected', 'connected')))
      .toBe('Candles e livro conectados')
    expect(sessionStatusLabel(tab('connecting', 'connecting')))
      .toBe('Conectando aos streams')
    expect(sessionStatusLabel(tab('error', 'error')))
      .toBe('Falha na sessão de mercado')
  })

  it('nomeia os dois quando discordam — o caso que enganava', () => {
    // O livro perde o snapshot REST e tenta de novo; os candles seguem
    // chegando. Dizer "Reconectando aos streams" aqui faz o operador
    // desconfiar de um preço que está correto.
    expect(sessionStatusLabel(tab('connected', 'reconnecting')))
      .toBe('Candles conectados · livro reconectando')
    expect(sessionStatusLabel(tab('reconnecting', 'connected')))
      .toBe('Candles reconectando · livro conectado')
    expect(sessionStatusLabel(tab('connected', 'error')))
      .toBe('Candles conectados · livro com falha')
  })
})
