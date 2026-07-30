<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import AppHeader from '../layout/AppHeader.vue'
import GeneralSettingsPanel from '../settings/GeneralSettingsPanel.vue'
import NavigationRail from '../layout/NavigationRail.vue'
import PanelResizeHandle from '../layout/PanelResizeHandle.vue'
import MarketSidebar from '../market/MarketSidebar.vue'
import MarketChart from '../chart/MarketChart.vue'
import OrderBook from '../orderbook/OrderBook.vue'
import TradingTicket from '../trading/TradingTicket.vue'
import PositionsPanel from '../positions/PositionsPanel.vue'
import WorkspaceTabs from './WorkspaceTabs.vue'
import {
  copyMarketSelection,
  type SymbolSearchContext,
} from '../../contracts/desktop'
import {
  loadMarketCatalog,
  onCandle,
  onStreamStatus,
  setMarketStreamVisibility,
  startMarketStream,
  stopMarketStream,
  updateMarketCandleStream,
} from '../../services/marketData'
import { loadFavoriteKeys, saveFavoriteKeys } from '../../services/favorites'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
  StreamStatus,
} from '../../types/market'
import {
  applyWorkspaceStreamStatus,
  createWorkspaceTab,
  marketSelectionFingerprint,
  MAX_WORKSPACE_TABS,
  selectionForNewTab,
  type WorkspaceTab,
} from '../../types/workspace'

interface HistoryCache {
  fingerprint: string
  candles: Candle[]
  ready: boolean
}

const SIDEBAR_STORAGE_KEY = 'cryptopro.market-sidebar-width.v1'
const SIDEBAR_MIN_WIDTH = 190
const SIDEBAR_DEFAULT_WIDTH = 250
const SIDEBAR_MAX_WIDTH = 420
const MAX_CACHED_CANDLES = 500

const defaultSelection: MarketSelection = {
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

function availableSidebarMaxWidth(): number {
  const reservedWorkspaceWidth = window.innerWidth <= 1360 ? 970 : 1015
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(
      SIDEBAR_MAX_WIDTH,
      window.innerWidth - reservedWorkspaceWidth,
    ),
  )
}

function loadSidebarWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
      ? stored
      : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function clampSidebarWidth(value: number, max: number): number {
  return Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)))
}

const initialTab = createWorkspaceTab(defaultSelection)
const tabs = reactive<WorkspaceTab[]>([initialTab])
const activeTabId = ref(initialTab.id)
const sidebarMaxWidth = ref(availableSidebarMaxWidth())
const settingsOpen = ref(false)
let preferredSidebarWidth = loadSidebarWidth()
const sidebarWidth = ref(clampSidebarWidth(
  preferredSidebarWidth,
  sidebarMaxWidth.value,
))
const catalogs = shallowRef(new Map<string, MarketCatalog>())
const loadingCatalogKeys = shallowRef(new Set<string>())
const favoriteKeys = shallowRef(loadFavoriteKeys())
const histories = new Map<string, HistoryCache>()
const catalogRequests = new Map<string, Promise<MarketCatalog>>()
const candleUnsubscribers = new Map<string, () => void>()
let unsubscribeStatus: (() => void) | undefined
let unsubscribeSymbolSelected: (() => void) | undefined
let unsubscribeFavorites: (() => void) | undefined
let disposed = false

const activeTab = computed(() => (
  tabs.find((tab) => tab.id === activeTabId.value) ?? tabs[0]
))
const selection = computed(() => activeTab.value.selection)
const activeCatalogKey = computed(() => catalogKey(selection.value))
const activeCatalog = computed(
  () => catalogs.value.get(activeCatalogKey.value) ?? null,
)
const symbols = computed(() => activeCatalog.value?.items ?? [])
const symbolsLoading = computed(() => (
  loadingCatalogKeys.value.has(activeCatalogKey.value)
  || activeCatalog.value === null
))
const chartRenderKey = computed(
  () => `${activeTab.value.id}:${activeTab.value.renderRevision}`,
)
const workspaceStyle = computed(() => ({
  '--market-sidebar-width': `${sidebarWidth.value}px`,
}))

const statusLabel = computed(() => {
  switch (activeTab.value.status) {
    case 'connected':
      return 'Candles e livro conectados'
    case 'reconnecting':
      return 'Reconectando aos streams'
    case 'error':
      return 'Falha na sessão de mercado'
    default:
      return 'Conectando aos streams'
  }
})

function catalogKey(value: Pick<MarketSelection, 'provider' | 'market'>): string {
  return `${value.provider}:${value.market}`
}

function findTab(tabId: string): WorkspaceTab | undefined {
  return tabs.find((tab) => tab.id === tabId)
}

function isCurrentGeneration(tab: WorkspaceTab, generation: number): boolean {
  return !disposed
    && findTab(tab.id) === tab
    && tab.generation === generation
}

function setCatalogLoading(key: string, loading: boolean): void {
  const next = new Set(loadingCatalogKeys.value)
  if (loading) {
    next.add(key)
  } else {
    next.delete(key)
  }
  loadingCatalogKeys.value = next
}

async function ensureCatalog(
  tab: WorkspaceTab,
  forceRefresh = false,
): Promise<MarketCatalog> {
  const key = catalogKey(tab.selection)
  const cached = catalogs.value.get(key)
  if (cached && !forceRefresh) {
    return cached
  }
  const pending = catalogRequests.get(key)
  if (pending && !forceRefresh) {
    return pending
  }

  setCatalogLoading(key, true)
  const request = loadMarketCatalog(
    tab.selection.provider,
    tab.selection.market,
    '',
    forceRefresh,
  )
  catalogRequests.set(key, request)
  try {
    const nextCatalog = await request
    const next = new Map(catalogs.value)
    next.set(key, nextCatalog)
    catalogs.value = next
    return nextCatalog
  } finally {
    if (catalogRequests.get(key) === request) {
      catalogRequests.delete(key)
      setCatalogLoading(key, false)
    }
  }
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

function defaultSymbol(items: MarketSymbol[]): MarketSymbol | undefined {
  return items.find((item) => item.symbol === 'BTCUSDT') ?? items[0]
}

function initialHistory(tab: WorkspaceTab): Candle[] | undefined {
  const cached = histories.get(tab.id)
  if (
    cached?.ready
    && cached.fingerprint === marketSelectionFingerprint(tab.selection)
  ) {
    return cached.candles
  }
  return undefined
}

function cacheRealtimeCandle(tab: WorkspaceTab, candle: Candle): void {
  const fingerprint = marketSelectionFingerprint(tab.selection)
  if (
    candle.provider !== tab.selection.provider
    || candle.market !== tab.selection.market
    || candle.symbol !== tab.selection.symbol
    || candle.interval !== tab.selection.interval
  ) {
    return
  }

  const current = histories.get(tab.id)
  if (!current || current.fingerprint !== fingerprint) {
    histories.set(tab.id, {
      fingerprint,
      candles: [candle],
      ready: false,
    })
    return
  }

  const last = current.candles.at(-1)
  if (!last || candle.time > last.time) {
    current.candles.push(candle)
    if (current.candles.length > MAX_CACHED_CANDLES) {
      current.candles.shift()
    }
  } else if (candle.time === last.time) {
    current.candles[current.candles.length - 1] = candle
  }
}

function storeHistory(
  sessionId: string,
  fingerprint: string,
  candles: Candle[],
): void {
  const tab = findTab(sessionId)
  if (!tab || marketSelectionFingerprint(tab.selection) !== fingerprint) {
    return
  }
  const pending = histories.get(sessionId)
  const latest = pending?.fingerprint === fingerprint
    ? pending.candles.at(-1)
    : undefined
  const merged = candles.slice(-MAX_CACHED_CANDLES)
  const last = merged.at(-1)
  if (latest && (!last || latest.time >= last.time)) {
    if (last?.time === latest.time) {
      merged[merged.length - 1] = latest
    } else {
      merged.push(latest)
    }
  }
  histories.set(sessionId, {
    fingerprint,
    candles: merged.slice(-MAX_CACHED_CANDLES),
    ready: true,
  })
}

function attachTabRuntime(tab: WorkspaceTab): void {
  if (candleUnsubscribers.has(tab.id)) {
    return
  }
  candleUnsubscribers.set(
    tab.id,
    onCandle(tab.id, (candle) => cacheRealtimeCandle(tab, candle)),
  )
}

function detachTabRuntime(tabId: string): void {
  candleUnsubscribers.get(tabId)?.()
  candleUnsubscribers.delete(tabId)
  histories.delete(tabId)
}

async function startTabSession(
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
    if (isCurrentGeneration(tab, generation)) {
      tab.status = 'error'
      tab.candleState = 'error'
      tab.orderBookState = 'error'
      tab.statusMessage = error instanceof Error ? error.message : String(error)
    }
  }
}

async function restartTab(
  tab: WorkspaceTab,
  patch: Partial<MarketSelection>,
): Promise<void> {
  const generation = ++tab.generation
  tab.status = 'connecting'
  tab.candleState = 'connecting'
  tab.orderBookState = 'connecting'
  tab.statusMessage = ''
  tab.latency = null
  histories.delete(tab.id)

  await stopMarketStream(tab.id)
  if (!isCurrentGeneration(tab, generation)) {
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
  await startTabSession(tab, generation)
}

async function changeMarket(market: Market): Promise<void> {
  const tab = activeTab.value
  if (market === tab.selection.market) {
    return
  }

  const generation = ++tab.generation
  tab.status = 'connecting'
  tab.candleState = 'connecting'
  tab.orderBookState = 'connecting'
  tab.statusMessage = ''
  tab.latency = null
  histories.delete(tab.id)
  void window.cryptoPro?.windows.closeSymbolSearch()

  await stopMarketStream(tab.id)
  if (!isCurrentGeneration(tab, generation)) {
    return
  }
  tab.selection.market = market

  try {
    const nextCatalog = await ensureCatalog(tab)
    if (!isCurrentGeneration(tab, generation)) {
      return
    }
    const nextSymbol = defaultSymbol(nextCatalog.items)
    if (!nextSymbol) {
      throw new Error(`Nenhum par negociável disponível para ${market}`)
    }
    applySymbol(tab, nextSymbol)
    tab.renderRevision += 1
    await startTabSession(tab, generation)
  } catch (error) {
    if (isCurrentGeneration(tab, generation)) {
      reportTabError(tab, error)
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
  await restartTab(tab, {
    market: symbol.market,
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    priceTickSize: symbol.priceTickSize,
    pricePrecision: symbol.pricePrecision,
    quantityPrecision: symbol.quantityPrecision,
  })
}

function hasTabCapacity(): boolean {
  if (tabs.length < MAX_WORKSPACE_TABS) {
    return true
  }
  activeTab.value.statusMessage = (
    `Limite de ${MAX_WORKSPACE_TABS} abas simultâneas atingido`
  )
  return false
}

function openSymbolSearch(
  query = '',
  intent: SymbolSearchContext['intent'] = 'replace-tab',
  sourceTab = activeTab.value,
): void {
  if (intent === 'new-tab' && !hasTabCapacity()) {
    return
  }
  const desktop = window.cryptoPro
  if (!desktop) {
    sourceTab.status = 'error'
    sourceTab.statusMessage = (
      'API Electron indisponível. Reinicie com "npm run dev".'
    )
    return
  }
  void desktop.windows.openSymbolSearch({
    tabId: sourceTab.id,
    intent,
    selection: copyMarketSelection(sourceTab.selection),
    initialQuery: query,
  }).catch((error) => {
    sourceTab.status = 'error'
    sourceTab.statusMessage = error instanceof Error
      ? error.message
      : String(error)
  })
}

function requestNewTab(): void {
  openSymbolSearch('', 'new-tab')
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"]',
  ))
}

function handleGlobalKey(event: KeyboardEvent): void {
  if (settingsOpen.value) {
    return
  }

  if (
    event.key.toLowerCase() === 't'
    && (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
  ) {
    event.preventDefault()
    requestNewTab()
    return
  }

  if (
    event.key !== 'Enter'
    || event.repeat
    || event.defaultPrevented
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || isTextEditingTarget(event.target)
  ) {
    return
  }

  event.preventDefault()
  openSymbolSearch()
}

function persistSidebarWidth(value: number): void {
  preferredSidebarWidth = clampSidebarWidth(value, SIDEBAR_MAX_WIDTH)
  try {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      String(preferredSidebarWidth),
    )
  } catch {
    // The current session still keeps the chosen width if storage is denied.
  }
}

function updateSidebarBounds(): void {
  sidebarMaxWidth.value = availableSidebarMaxWidth()
  sidebarWidth.value = clampSidebarWidth(
    preferredSidebarWidth,
    sidebarMaxWidth.value,
  )
}

async function changeInterval(interval: string): Promise<void> {
  const tab = activeTab.value
  if (interval === tab.selection.interval) {
    return
  }

  const generation = ++tab.generation
  tab.status = 'connecting'
  tab.candleState = 'connecting'
  tab.statusMessage = ''
  histories.delete(tab.id)
  tab.selection.interval = interval
  tab.renderRevision += 1

  try {
    await updateMarketCandleStream(tab.id, tab.selection)
  } catch (error) {
    if (isCurrentGeneration(tab, generation)) {
      reportTabError(tab, error, 'candles')
    }
  }
}

function reportTabError(
  tab: WorkspaceTab,
  error: unknown,
  stream: 'all' | 'candles' = 'all',
): void {
  tab.status = 'error'
  tab.candleState = 'error'
  if (stream === 'all') {
    tab.orderBookState = 'error'
  }
  tab.statusMessage = error instanceof Error ? error.message : String(error)
}

function setTabVisibility(tab: WorkspaceTab, visible: boolean): void {
  void setMarketStreamVisibility(tab.id, visible).catch((error) => {
    if (findTab(tab.id) === tab) {
      reportTabError(tab, error)
    }
  })
}

function activateTab(tabId: string): void {
  const nextTab = findTab(tabId)
  if (!nextTab || nextTab.id === activeTabId.value) {
    return
  }
  const previousTab = activeTab.value
  activeTabId.value = nextTab.id
  setTabVisibility(previousTab, false)
  setTabVisibility(nextTab, true)
}

function openSymbolInNewTab(
  symbol: MarketSymbol,
  sourceTab = activeTab.value,
): void {
  if (!hasTabCapacity()) {
    return
  }

  const previousActiveTab = activeTab.value
  const tab = createWorkspaceTab(selectionForNewTab(
    sourceTab.selection,
    symbol,
  ))
  const sourceHistory = histories.get(sourceTab.id)
  if (
    sourceHistory?.ready
    && sourceHistory.fingerprint === marketSelectionFingerprint(tab.selection)
  ) {
    histories.set(tab.id, {
      fingerprint: sourceHistory.fingerprint,
      candles: [...sourceHistory.candles],
      ready: true,
    })
  }

  tabs.push(tab)
  attachTabRuntime(tab)
  activeTabId.value = tab.id
  setTabVisibility(previousActiveTab, false)
  void startTabSession(tab, tab.generation)
}

function closeTab(tabId: string): void {
  if (tabs.length === 1) {
    return
  }
  const index = tabs.findIndex((tab) => tab.id === tabId)
  if (index < 0) {
    return
  }
  const [closedTab] = tabs.splice(index, 1)
  closedTab.generation += 1
  detachTabRuntime(closedTab.id)
  void stopMarketStream(closedTab.id)

  if (activeTabId.value !== tabId) {
    return
  }
  const nextTab = tabs[Math.min(index, tabs.length - 1)]
  activeTabId.value = nextTab.id
  setTabVisibility(nextTab, true)
}

function updateLatency(value: number): void {
  activeTab.value.latency = Math.max(0, Math.round(value))
}

async function bootstrap(): Promise<void> {
  const tab = activeTab.value
  const generation = ++tab.generation
  const initialFingerprint = marketSelectionFingerprint(tab.selection)
  try {
    const initialCatalog = await ensureCatalog(tab)
    if (!isCurrentGeneration(tab, generation)) {
      return
    }
    const initialSymbol = initialCatalog.items.find(
      (symbol) => symbol.symbol === tab.selection.symbol,
    ) ?? defaultSymbol(initialCatalog.items)
    if (!initialSymbol) {
      throw new Error('A Binance não retornou pares negociáveis')
    }
    applySymbol(tab, initialSymbol)
    if (marketSelectionFingerprint(tab.selection) !== initialFingerprint) {
      histories.delete(tab.id)
      tab.renderRevision += 1
    }
    await startTabSession(tab, generation)
  } catch (error) {
    if (isCurrentGeneration(tab, generation)) {
      reportTabError(tab, error)
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', updateSidebarBounds)
  document.addEventListener('keydown', handleGlobalKey)
  tabs.forEach(attachTabRuntime)
  unsubscribeStatus = onStreamStatus((sessionId, nextStatus) => {
    const tab = findTab(sessionId)
    if (!tab) {
      return
    }
    applyWorkspaceStreamStatus(tab, nextStatus)
  })
  const desktop = window.cryptoPro
  if (desktop) {
    unsubscribeSymbolSelected = desktop.windows.onSymbolSelected(
      ({ tabId, intent, item }) => {
        const targetTab = findTab(tabId) ?? activeTab.value
        if (intent === 'new-tab') {
          openSymbolInNewTab(item, targetTab)
        } else if (findTab(tabId)) {
          void changeSymbol(item, targetTab)
        }
      },
    )
    unsubscribeFavorites = desktop.windows.onFavoritesChanged(
      (keys) => {
        const next = new Set(keys)
        favoriteKeys.value = next
        saveFavoriteKeys(next)
      },
    )
    desktop.windows.syncFavorites([...favoriteKeys.value])
  }
  void bootstrap()
})

onBeforeUnmount(() => {
  disposed = true
  tabs.forEach((tab) => {
    tab.generation += 1
    void stopMarketStream(tab.id)
    detachTabRuntime(tab.id)
  })
  window.removeEventListener('resize', updateSidebarBounds)
  document.removeEventListener('keydown', handleGlobalKey)
  unsubscribeStatus?.()
  unsubscribeSymbolSelected?.()
  unsubscribeFavorites?.()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :selection="selection"
      :settings-open="settingsOpen"
      :status="activeTab.status"
      @settings="settingsOpen = !settingsOpen"
    />
    <main class="workspace-grid" :style="workspaceStyle">
      <NavigationRail @settings="settingsOpen = true" />
      <MarketSidebar
        :connection-state="activeTab.status"
        :favorite-keys="favoriteKeys"
        :loading="symbolsLoading"
        :selection="selection"
        :symbols="symbols"
        @market="changeMarket"
        @new-tab="openSymbolInNewTab"
        @open-search="openSymbolSearch"
        @symbol="changeSymbol"
      />
      <PanelResizeHandle
        v-model="sidebarWidth"
        :default-value="SIDEBAR_DEFAULT_WIDTH"
        :max="sidebarMaxWidth"
        :min="SIDEBAR_MIN_WIDTH"
        @commit="persistSidebarWidth"
      />
      <section class="chart-workspace panel">
        <WorkspaceTabs
          :active-tab-id="activeTab.id"
          :max-tabs="MAX_WORKSPACE_TABS"
          :tabs="tabs"
          @activate="activateTab"
          @add="requestNewTab"
          @close="closeTab"
        />
        <MarketChart
          :key="chartRenderKey"
          :initial-history="initialHistory(activeTab)"
          :selection="selection"
          :session-id="activeTab.id"
          @history="storeHistory"
          @interval="changeInterval"
        />
      </section>
      <OrderBook
        :key="activeTab.id"
        :aggregation-step="activeTab.orderBookAggregation"
        :selection="selection"
        :session-id="activeTab.id"
        @aggregation-step="activeTab.orderBookAggregation = $event"
        @latency="updateLatency"
      />
      <TradingTicket :selection="selection" />
      <PositionsPanel />
    </main>
    <footer class="status-bar">
      <span :class="activeTab.status">
        <i />{{ statusLabel }}
      </span>
      <span>
        Latência:
        <b>{{ activeTab.latency === null ? '—' : `${activeTab.latency}ms` }}</b>
      </span>
      <span v-if="activeTab.statusMessage" class="status-error">
        {{ activeTab.statusMessage }}
      </span>
      <span class="status-spacer" />
      <span>
        Aba {{ tabs.findIndex((tab) => tab.id === activeTab.id) + 1 }}
        de {{ tabs.length }} ·
        {{ selection.provider }} · {{ selection.market }} ·
        {{ selection.symbol }} · {{ selection.interval }}
      </span>
    </footer>
    <GeneralSettingsPanel
      :open="settingsOpen"
      @close="settingsOpen = false"
    />
  </div>
</template>
