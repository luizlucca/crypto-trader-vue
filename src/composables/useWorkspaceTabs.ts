import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
} from '@shared/types/market'
import {
  createDefaultMarketSelection,
  marketSelectionFingerprint,
  selectionForNewTab,
} from '@/domain/marketSelection'
import {
  applyWorkspaceStreamStatus,
  createWorkspaceTab,
  MAX_WORKSPACE_TABS,
  type WorkspaceTab,
} from '@/domain/workspace'
import {
  onStreamStatus,
  setMarketStreamVisibility,
  startMarketStream,
  stopMarketStream,
  updateMarketCandleStream,
} from '@/services/marketData'
import { resetStreamLatency } from '@/services/streamLatency'
import {
  useCandleHistoryCache,
  type CandleHistoryCache,
} from './useCandleHistoryCache'

/**
 * Which streams a change disturbs. Switching only the period keeps the order
 * book connected, so its state and latency must survive the transition.
 */
export type StreamScope = 'session' | 'candles'

export interface WorkspaceTabsOptions {
  ensureCatalog: (scope: MarketSelection) => Promise<MarketCatalog>
  /** How many candles a background tab keeps so returning to it is instant. */
  maxCachedCandles?: number
  /** Injection point for tests; the default cache is created internally. */
  history?: CandleHistoryCache
}

export interface WorkspaceTabsController {
  tabs: WorkspaceTab[]
  activeTabId: Ref<string>
  activeTab: ComputedRef<WorkspaceTab>
  selection: ComputedRef<MarketSelection>
  chartRenderKey: ComputedRef<string>
  find: (tabId: string) => WorkspaceTab | undefined
  hasCapacity: () => boolean
  reportError: (tab: WorkspaceTab, error: unknown, scope?: StreamScope) => void
  activate: (tabId: string) => void
  close: (tabId: string) => void
  openInNewTab: (symbol: MarketSymbol, sourceTab?: WorkspaceTab) => void
  changeMarket: (market: Market) => Promise<void>
  changeSymbol: (symbol: MarketSymbol, tab?: WorkspaceTab) => Promise<void>
  changeInterval: (interval: string) => Promise<void>
  initialHistory: (tab: WorkspaceTab) => Candle[] | undefined
  storeHistory: (
    sessionId: string,
    fingerprint: string,
    candles: Candle[],
  ) => void
}

function preferredSymbol(
  items: MarketSymbol[],
  wanted?: string,
): MarketSymbol | undefined {
  return (wanted ? items.find((item) => item.symbol === wanted) : undefined)
    ?? items.find((item) => item.symbol === 'BTCUSDT')
    ?? items[0]
}

/**
 * Owns the tab list and the lifecycle of each tab's market session.
 *
 * Every tab carries a `generation` counter. Switching pair, market or period
 * is asynchronous, so a second switch can start before the first one finishes;
 * the counter lets a late continuation notice that it no longer owns the tab
 * and abort instead of overwriting newer state. That check used to be written
 * out by hand in five places — here it exists once, in `beginTransition` and
 * `stillOwns`.
 *
 * Only low-frequency state lives here: tab identity, connection status and
 * selection. Candles and order-book snapshots never reach this module.
 */
export function useWorkspaceTabs(
  options: WorkspaceTabsOptions,
): WorkspaceTabsController {
  const { ensureCatalog } = options
  const history = options.history
    ?? useCandleHistoryCache(options.maxCachedCandles ?? 500)

  const initialTab = createWorkspaceTab(createDefaultMarketSelection())
  const tabs = reactive<WorkspaceTab[]>([initialTab])
  const activeTabId = ref(initialTab.id)
  let unsubscribeStatus: (() => void) | undefined
  let disposed = false

  const activeTab = computed(
    () => tabs.find((tab) => tab.id === activeTabId.value) ?? tabs[0],
  )
  const selection = computed(() => activeTab.value.selection)
  const chartRenderKey = computed(
    () => `${activeTab.value.id}:${activeTab.value.renderRevision}`,
  )

  function find(tabId: string): WorkspaceTab | undefined {
    return tabs.find((tab) => tab.id === tabId)
  }

  /** True while `generation` is still the newest change asked of this tab. */
  function stillOwns(tab: WorkspaceTab, generation: number): boolean {
    return !disposed && find(tab.id) === tab && tab.generation === generation
  }

  function beginTransition(tab: WorkspaceTab, scope: StreamScope): number {
    tab.status = 'connecting'
    tab.candleState = 'connecting'
    tab.statusMessage = ''
    if (scope === 'session') {
      tab.orderBookState = 'connecting'
      resetStreamLatency(tab.id)
    }
    history.drop(tab.id)
    return ++tab.generation
  }

  function reportError(
    tab: WorkspaceTab,
    error: unknown,
    scope: StreamScope = 'session',
  ): void {
    tab.status = 'error'
    tab.candleState = 'error'
    if (scope === 'session') {
      tab.orderBookState = 'error'
    }
    tab.statusMessage = error instanceof Error ? error.message : String(error)
  }

  function applySymbol(tab: WorkspaceTab, symbol: MarketSymbol): void {
    tab.selection.symbol = symbol.symbol
    tab.selection.baseAsset = symbol.baseAsset
    tab.selection.quoteAsset = symbol.quoteAsset
    tab.selection.priceTickSize = symbol.priceTickSize
    tab.selection.pricePrecision = symbol.pricePrecision
    tab.selection.quantityPrecision = symbol.quantityPrecision
    tab.orderBookAggregation = symbol.priceTickSize
  }

  async function startSession(
    tab: WorkspaceTab,
    generation: number,
  ): Promise<void> {
    try {
      await startMarketStream(
        tab.id,
        tab.selection,
        tab.id === activeTabId.value,
      )
    } catch (error) {
      if (stillOwns(tab, generation)) {
        reportError(tab, error)
      }
    }
  }

  function setVisibility(tab: WorkspaceTab, visible: boolean): void {
    void setMarketStreamVisibility(tab.id, visible).catch((error) => {
      if (find(tab.id) === tab) {
        reportError(tab, error)
      }
    })
  }

  function hasCapacity(): boolean {
    if (tabs.length < MAX_WORKSPACE_TABS) {
      return true
    }
    activeTab.value.statusMessage
      = `Limite de ${MAX_WORKSPACE_TABS} abas simultâneas atingido`
    return false
  }

  async function restart(
    tab: WorkspaceTab,
    patch: Partial<MarketSelection>,
  ): Promise<void> {
    const generation = beginTransition(tab, 'session')

    await stopMarketStream(tab.id)
    if (!stillOwns(tab, generation)) {
      return
    }
    Object.assign(tab.selection, patch)
    if (
      patch.symbol !== undefined
      || patch.market !== undefined
      || patch.priceTickSize !== undefined
    ) {
      tab.orderBookAggregation = tab.selection.priceTickSize
    }
    tab.renderRevision += 1
    await startSession(tab, generation)
  }

  async function changeMarket(market: Market): Promise<void> {
    const tab = activeTab.value
    if (market === tab.selection.market) {
      return
    }

    const generation = beginTransition(tab, 'session')
    void window.cryptoPro?.windows.closeSymbolSearch()

    await stopMarketStream(tab.id)
    if (!stillOwns(tab, generation)) {
      return
    }
    tab.selection.market = market

    try {
      const catalog = await ensureCatalog(tab.selection)
      if (!stillOwns(tab, generation)) {
        return
      }
      const nextSymbol = preferredSymbol(catalog.items)
      if (!nextSymbol) {
        throw new Error(`Nenhum par negociável disponível para ${market}`)
      }
      applySymbol(tab, nextSymbol)
      tab.renderRevision += 1
      await startSession(tab, generation)
    } catch (error) {
      if (stillOwns(tab, generation)) {
        reportError(tab, error)
      }
    }
  }

  async function changeSymbol(
    symbol: MarketSymbol,
    tab = activeTab.value,
  ): Promise<void> {
    if (
      symbol.symbol === tab.selection.symbol
      && symbol.market === tab.selection.market
    ) {
      return
    }
    await restart(tab, {
      market: symbol.market,
      symbol: symbol.symbol,
      baseAsset: symbol.baseAsset,
      quoteAsset: symbol.quoteAsset,
      priceTickSize: symbol.priceTickSize,
      pricePrecision: symbol.pricePrecision,
      quantityPrecision: symbol.quantityPrecision,
    })
  }

  async function changeInterval(interval: string): Promise<void> {
    const tab = activeTab.value
    if (interval === tab.selection.interval) {
      return
    }

    // Only the candle subscription is replaced: the order book keeps its
    // socket, its snapshot and its Vue instance.
    const generation = beginTransition(tab, 'candles')
    tab.selection.interval = interval
    tab.renderRevision += 1

    try {
      await updateMarketCandleStream(tab.id, tab.selection)
    } catch (error) {
      if (stillOwns(tab, generation)) {
        reportError(tab, error, 'candles')
      }
    }
  }

  function activate(tabId: string): void {
    const nextTab = find(tabId)
    if (!nextTab || nextTab.id === activeTabId.value) {
      return
    }
    const previousTab = activeTab.value
    activeTabId.value = nextTab.id
    setVisibility(previousTab, false)
    setVisibility(nextTab, true)
  }

  function openInNewTab(
    symbol: MarketSymbol,
    sourceTab = activeTab.value,
  ): void {
    if (!hasCapacity()) {
      return
    }

    const previousActiveTab = activeTab.value
    const tab = createWorkspaceTab(
      selectionForNewTab(sourceTab.selection, symbol),
    )
    // Ctrl+click on the pair already showing: the new tab can start from the
    // candles the source tab holds instead of a fresh REST page.
    const inherited = history.read(sourceTab.id, tab.selection)
    if (inherited) {
      history.store(
        tab.id,
        marketSelectionFingerprint(tab.selection),
        [...inherited],
      )
    }

    tabs.push(tab)
    history.attach(tab.id, () => tab.selection)
    activeTabId.value = tab.id
    setVisibility(previousActiveTab, false)
    void startSession(tab, tab.generation)
  }

  function close(tabId: string): void {
    if (tabs.length === 1) {
      return
    }
    const index = tabs.findIndex((tab) => tab.id === tabId)
    if (index < 0) {
      return
    }
    const [closedTab] = tabs.splice(index, 1)
    // Invalidating the generation stops any continuation still in flight from
    // writing into a tab the user already closed.
    closedTab.generation += 1
    history.detach(closedTab.id)
    resetStreamLatency(closedTab.id)
    void stopMarketStream(closedTab.id)

    if (activeTabId.value !== tabId) {
      return
    }
    const nextTab = tabs[Math.min(index, tabs.length - 1)]
    activeTabId.value = nextTab.id
    setVisibility(nextTab, true)
  }

  async function bootstrap(): Promise<void> {
    const tab = activeTab.value
    const generation = ++tab.generation
    const initialFingerprint = marketSelectionFingerprint(tab.selection)
    try {
      const catalog = await ensureCatalog(tab.selection)
      if (!stillOwns(tab, generation)) {
        return
      }
      const initialSymbol = preferredSymbol(
        catalog.items,
        tab.selection.symbol,
      )
      if (!initialSymbol) {
        throw new Error('A Binance não retornou pares negociáveis')
      }
      applySymbol(tab, initialSymbol)
      // The catalog may have corrected precision or resolved a different
      // default pair; only then is the pre-loaded history no longer valid.
      if (marketSelectionFingerprint(tab.selection) !== initialFingerprint) {
        history.drop(tab.id)
        tab.renderRevision += 1
      }
      await startSession(tab, generation)
    } catch (error) {
      if (stillOwns(tab, generation)) {
        reportError(tab, error)
      }
    }
  }

  onMounted(() => {
    tabs.forEach((tab) => history.attach(tab.id, () => tab.selection))
    unsubscribeStatus = onStreamStatus((sessionId, status) => {
      const tab = find(sessionId)
      if (tab) {
        applyWorkspaceStreamStatus(tab, status)
      }
    })
    void bootstrap()
  })

  onBeforeUnmount(() => {
    disposed = true
    tabs.forEach((tab) => {
      tab.generation += 1
      void stopMarketStream(tab.id)
    })
    history.detachAll()
    unsubscribeStatus?.()
  })

  return {
    tabs,
    activeTabId,
    activeTab,
    selection,
    chartRenderKey,
    find,
    hasCapacity,
    reportError,
    activate,
    close,
    openInNewTab,
    changeMarket,
    changeSymbol,
    changeInterval,
    initialHistory: (tab) => history.read(tab.id, tab.selection),
    storeHistory: (sessionId, fingerprint, candles) => {
      const tab = find(sessionId)
      if (tab && marketSelectionFingerprint(tab.selection) === fingerprint) {
        history.store(sessionId, fingerprint, candles)
      }
    },
  }
}
