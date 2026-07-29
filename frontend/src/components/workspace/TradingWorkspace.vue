<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import AppHeader from '../layout/AppHeader.vue'
import NavigationRail from '../layout/NavigationRail.vue'
import PanelResizeHandle from '../layout/PanelResizeHandle.vue'
import MarketSidebar from '../market/MarketSidebar.vue'
import SymbolSearchModal from '../market/SymbolSearchModal.vue'
import MarketChart from '../chart/MarketChart.vue'
import OrderBook from '../orderbook/OrderBook.vue'
import TradingTicket from '../trading/TradingTicket.vue'
import PositionsPanel from '../positions/PositionsPanel.vue'
import {
  loadMarketCatalog,
  onStreamStatus,
  startMarketStream,
  stopMarketStream,
} from '../../services/marketData'
import {
  favoriteKey,
  loadFavoriteKeys,
  saveFavoriteKeys,
} from '../../services/favorites'
import type {
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  StreamStatus,
} from '../../types/market'

type MarketChartExposed = { loadHistory: () => Promise<void> }

const SIDEBAR_STORAGE_KEY = 'cryptopro.market-sidebar-width.v1'
const SIDEBAR_MIN_WIDTH = 190
const SIDEBAR_DEFAULT_WIDTH = 250
const SIDEBAR_MAX_WIDTH = 420

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

const selection = reactive<MarketSelection>({
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  pricePrecision: 2,
  quantityPrecision: 3,
})
const chart = ref<MarketChartExposed | null>(null)
const sidebarMaxWidth = ref(availableSidebarMaxWidth())
let preferredSidebarWidth = loadSidebarWidth()
const sidebarWidth = ref(clampSidebarWidth(
  preferredSidebarWidth,
  sidebarMaxWidth.value,
))
const catalog = shallowRef<MarketCatalog | null>(null)
const symbolsLoading = ref(true)
const catalogRefreshing = ref(false)
const catalogError = ref('')
const symbolSearchOpen = ref(false)
const symbolSearchQuery = ref('')
const favoriteKeys = shallowRef(loadFavoriteKeys())
const status = ref<StreamStatus['state']>('connecting')
const statusMessage = ref('')
const latencyText = ref<HTMLElement | null>(null)
let unsubscribeStatus: (() => void) | undefined
let sessionGeneration = 0

const symbols = computed(() => catalog.value?.items ?? [])
const workspaceStyle = computed(() => ({
  '--market-sidebar-width': `${sidebarWidth.value}px`,
}))

const statusLabel = computed(() => {
  switch (status.value) {
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

function applySymbol(symbol: MarketSymbol): void {
  selection.symbol = symbol.symbol
  selection.baseAsset = symbol.baseAsset
  selection.quoteAsset = symbol.quoteAsset
  selection.pricePrecision = symbol.pricePrecision
  selection.quantityPrecision = symbol.quantityPrecision
}

function defaultSymbol(items: MarketSymbol[]): MarketSymbol | undefined {
  return items.find((item) => item.symbol === 'BTCUSDT') ?? items[0]
}

async function startSession(generation: number): Promise<void> {
  await nextTick()
  if (generation !== sessionGeneration) {
    return
  }

  try {
    await chart.value?.loadHistory()
    if (generation !== sessionGeneration) {
      return
    }
    await startMarketStream(selection)
  } catch (error) {
    if (generation !== sessionGeneration) {
      return
    }
    status.value = 'error'
    statusMessage.value = error instanceof Error ? error.message : String(error)
  }
}

async function restartSession(patch: Partial<MarketSelection>): Promise<void> {
  const generation = ++sessionGeneration
  status.value = 'connecting'
  statusMessage.value = ''
  resetLatency()

  await stopMarketStream()
  if (generation !== sessionGeneration) {
    return
  }
  Object.assign(selection, patch)
  await startSession(generation)
}

async function changeMarket(market: Market): Promise<void> {
  if (market === selection.market) {
    return
  }

  const generation = ++sessionGeneration
  status.value = 'connecting'
  statusMessage.value = ''
  symbolsLoading.value = true
  catalog.value = null
  catalogError.value = ''
  symbolSearchOpen.value = false
  resetLatency()

  await stopMarketStream()
  if (generation !== sessionGeneration) {
    return
  }
  selection.market = market

  try {
    const nextCatalog = await loadMarketCatalog(selection.provider, market)
    if (generation !== sessionGeneration) {
      return
    }
    catalog.value = nextCatalog
    const nextSymbols = nextCatalog.items
    const nextSymbol = defaultSymbol(nextSymbols)
    if (!nextSymbol) {
      throw new Error(`Nenhum par negociável disponível para ${market}`)
    }
    applySymbol(nextSymbol)
    await startSession(generation)
  } catch (error) {
    if (generation === sessionGeneration) {
      status.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (generation === sessionGeneration) {
      symbolsLoading.value = false
    }
  }
}

async function changeSymbol(symbol: MarketSymbol): Promise<void> {
  if (symbol.symbol === selection.symbol) {
    return
  }
  await restartSession({
    symbol: symbol.symbol,
    baseAsset: symbol.baseAsset,
    quoteAsset: symbol.quoteAsset,
    pricePrecision: symbol.pricePrecision,
    quantityPrecision: symbol.quantityPrecision,
  })
}

async function selectSymbol(symbol: MarketPair): Promise<void> {
  symbolSearchOpen.value = false
  await changeSymbol(symbol)
}

function openSymbolSearch(query = ''): void {
  symbolSearchQuery.value = query
  symbolSearchOpen.value = true
}

function isEditableOrInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, button, a, [contenteditable="true"], [role="button"]',
  ))
}

function handleGlobalEnter(event: KeyboardEvent): void {
  if (
    event.key !== 'Enter'
    || event.repeat
    || event.defaultPrevented
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || symbolSearchOpen.value
    || isEditableOrInteractive(event.target)
  ) {
    return
  }

  event.preventDefault()
  openSymbolSearch()
}

function toggleFavorite(symbol: MarketSymbol): void {
  const key = favoriteKey(symbol)
  const next = new Set(favoriteKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  favoriteKeys.value = next
  saveFavoriteKeys(next)
}

function resetLatency(): void {
  if (latencyText.value) {
    latencyText.value.textContent = '—'
  }
}

function updateLatency(value: number): void {
  if (latencyText.value) {
    latencyText.value.textContent = `${Math.max(0, Math.round(value))}ms`
  }
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

async function refreshCatalog(): Promise<void> {
  if (catalogRefreshing.value) {
    return
  }

  const market = selection.market
  catalogRefreshing.value = true
  catalogError.value = ''
  try {
    const nextCatalog = await loadMarketCatalog(
      selection.provider,
      market,
      '',
      true,
    )
    if (selection.market === market) {
      catalog.value = nextCatalog
    }
  } catch (error) {
    if (selection.market === market) {
      catalogError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    catalogRefreshing.value = false
  }
}

async function changeInterval(interval: string): Promise<void> {
  if (interval !== selection.interval) {
    await restartSession({ interval })
  }
}

async function bootstrap(): Promise<void> {
  const generation = ++sessionGeneration
  symbolsLoading.value = true
  try {
    const initialCatalog = await loadMarketCatalog(
      selection.provider,
      selection.market,
    )
    if (generation !== sessionGeneration) {
      return
    }
    catalog.value = initialCatalog
    const initialSymbols = initialCatalog.items
    const initialSymbol = initialSymbols.find(
      (symbol) => symbol.symbol === selection.symbol,
    ) ?? defaultSymbol(initialSymbols)
    if (!initialSymbol) {
      throw new Error('A Binance não retornou pares negociáveis')
    }
    applySymbol(initialSymbol)
    await startSession(generation)
  } catch (error) {
    if (generation === sessionGeneration) {
      status.value = 'error'
      statusMessage.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    if (generation === sessionGeneration) {
      symbolsLoading.value = false
    }
  }
}

onMounted(() => {
  window.addEventListener('resize', updateSidebarBounds)
  document.addEventListener('keydown', handleGlobalEnter)
  unsubscribeStatus = onStreamStatus((nextStatus) => {
    if (
      nextStatus.provider === selection.provider
      && nextStatus.market === selection.market
      && nextStatus.symbol === selection.symbol
    ) {
      status.value = nextStatus.state
      statusMessage.value = nextStatus.message ?? ''
    }
  })
  void bootstrap()
})

onBeforeUnmount(() => {
  sessionGeneration += 1
  window.removeEventListener('resize', updateSidebarBounds)
  document.removeEventListener('keydown', handleGlobalEnter)
  unsubscribeStatus?.()
  void stopMarketStream()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader :selection="selection" :status="status" />
    <main class="workspace-grid" :style="workspaceStyle">
      <NavigationRail />
      <MarketSidebar
        :connection-state="status"
        :favorite-keys="favoriteKeys"
        :loading="symbolsLoading"
        :selection="selection"
        :symbols="symbols"
        @market="changeMarket"
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
      <MarketChart
        ref="chart"
        :selection="selection"
        @interval="changeInterval"
      />
      <OrderBook
        :selection="selection"
        @latency="updateLatency"
      />
      <TradingTicket :selection="selection" />
      <PositionsPanel />
    </main>
    <SymbolSearchModal
      :cached="catalog?.cached ?? false"
      :expires-at="catalog?.expiresAt ?? 0"
      :favorite-keys="favoriteKeys"
      :initial-query="symbolSearchQuery"
      :items="symbols"
      :loaded-at="catalog?.loadedAt ?? 0"
      :loading="symbolsLoading"
      :market="selection.market"
      :open="symbolSearchOpen"
      :provider="selection.provider"
      :refreshing="catalogRefreshing"
      :selected-symbol="selection.symbol"
      :stale="catalog?.stale ?? false"
      :warning="catalog?.warning || catalogError"
      @close="symbolSearchOpen = false"
      @favorite="toggleFavorite"
      @refresh="refreshCatalog"
      @select="selectSymbol"
    />
    <footer class="status-bar">
      <span :class="status"><i />{{ statusLabel }}</span>
      <span>Latência: <b ref="latencyText">—</b></span>
      <span v-if="statusMessage" class="status-error">{{ statusMessage }}</span>
      <span class="status-spacer" />
      <span>
        {{ selection.provider }} · {{ selection.market }} ·
        {{ selection.symbol }} · {{ selection.interval }}
      </span>
    </footer>
  </div>
</template>
