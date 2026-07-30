import type {
  MarketSelection,
  MarketSymbol,
  StreamStatus,
} from './market'

export const MAX_WORKSPACE_TABS = 8

export interface WorkspaceTab {
  id: string
  selection: MarketSelection
  status: StreamStatus['state']
  candleState: StreamStatus['candleState']
  orderBookState: StreamStatus['orderBookState']
  statusMessage: string
  latency: number | null
  orderBookAggregation: number
  generation: number
  renderRevision: number
}

function createTabId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createWorkspaceTab(
  selection: MarketSelection,
  id = createTabId(),
): WorkspaceTab {
  return {
    id,
    selection: { ...selection },
    status: 'connecting',
    candleState: 'connecting',
    orderBookState: 'connecting',
    statusMessage: '',
    latency: null,
    orderBookAggregation: selection.priceTickSize,
    generation: 0,
    renderRevision: 0,
  }
}

export function workspaceTabLabel(tab: WorkspaceTab): string {
  return `${tab.selection.baseAsset}/${tab.selection.quoteAsset}`
}

export function applyWorkspaceStreamStatus(
  tab: WorkspaceTab,
  status: StreamStatus,
): void {
  tab.status = status.state
  tab.candleState = status.candleState
  tab.orderBookState = status.orderBookState
  tab.statusMessage = status.message ?? ''
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
