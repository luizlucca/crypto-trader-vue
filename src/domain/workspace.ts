import type { MarketSelection, StreamStatus } from '@shared/types/market'

export const MAX_WORKSPACE_TABS = 8

export interface WorkspaceTab {
  id: string
  selection: MarketSelection
  status: StreamStatus['state']
  candleState: StreamStatus['candleState']
  orderBookState: StreamStatus['orderBookState']
  statusMessage: string
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
