import type {
  MarketSelection,
  StreamState,
  StreamStatus,
} from '@shared/types/market'

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

/**
 * What the status bar says about a session.
 *
 * Deliberately names the two streams apart. The aggregate alone was
 * pessimistic — the order book failing its REST snapshot reported the whole
 * session as reconnecting while candles kept arriving, so the operator saw a
 * warning that the data was stale when the chart was current. On a trading
 * screen that reads as "do not trust this price", which is the opposite of
 * what was true.
 */
export function sessionStatusLabel(tab: {
  candleState: StreamState
  orderBookState: StreamState
}): string {
  const { candleState, orderBookState } = tab
  if (candleState === orderBookState) {
    return BOTH_STREAMS[candleState]
  }
  return `Candles ${CANDLE_WORDS[candleState]}`
    + ` · livro ${BOOK_WORDS[orderBookState]}`
}

const BOTH_STREAMS: Record<StreamState, string> = {
  connecting: 'Conectando aos streams',
  connected: 'Candles e livro conectados',
  reconnecting: 'Reconectando aos streams',
  error: 'Falha na sessão de mercado',
}

// Two tables because only the agreement differs: "candles conectados" but
// "livro conectado".
const CANDLE_WORDS: Record<StreamState, string> = {
  connecting: 'conectando',
  connected: 'conectados',
  reconnecting: 'reconectando',
  error: 'com falha',
}

const BOOK_WORDS: Record<StreamState, string> = {
  connecting: 'conectando',
  connected: 'conectado',
  reconnecting: 'reconectando',
  error: 'com falha',
}
