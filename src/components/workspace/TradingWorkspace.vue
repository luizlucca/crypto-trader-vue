<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import GeneralSettingsPanel from '@/components/settings/GeneralSettingsPanel.vue'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import PanelResizeHandle from '@/components/layout/PanelResizeHandle.vue'
import MarketSidebar from '@/components/market/MarketSidebar.vue'
import MarketChart from '@/components/chart/MarketChart.vue'
import OrderBook from '@/components/orderbook/OrderBook.vue'
import TradingTicket from '@/components/trading/TradingTicket.vue'
import PositionsPanel from '@/components/positions/PositionsPanel.vue'
import StreamLatencyText from './StreamLatencyText.vue'
import WorkspaceTabs from './WorkspaceTabs.vue'
import {
  copyMarketSelection,
  type SymbolSearchContext,
} from '@shared/contracts/desktop'
import { loadFavoriteKeys, saveFavoriteKeys } from '@/services/favorites'
import { useCatalogCache } from '@/composables/useCatalogCache'
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts'
import { useResizableSidebar } from '@/composables/useResizableSidebar'
import {
  marketPanelVisible,
  orderBookPanelVisible,
  toggleMarketPanel,
  toggleOrderBookPanel,
} from '@/services/workspacePanels'
import { useWorkspaceTabs } from '@/composables/useWorkspaceTabs'
import { MAX_WORKSPACE_TABS, type WorkspaceTab } from '@/domain/workspace'

const SIDEBAR_DEFAULT_WIDTH = 250
const SIDEBAR_MIN_WIDTH = 190

const settingsOpen = ref(false)
const favoriteKeys = shallowRef(loadFavoriteKeys())

const {
  width: sidebarWidth,
  maxWidth: sidebarMaxWidth,
  persist: persistSidebarWidth,
} = useResizableSidebar({
  storageKey: 'cryptopro.market-sidebar-width.v1',
  minWidth: SIDEBAR_MIN_WIDTH,
  maxWidth: 420,
  defaultWidth: SIDEBAR_DEFAULT_WIDTH,
  reservedWidth: (viewportWidth) => viewportWidth <= 1360 ? 970 : 1015,
})

const catalog = useCatalogCache()
const workspace = useWorkspaceTabs({ ensureCatalog: catalog.ensure })

const {
  tabs,
  activeTab,
  selection,
  chartRenderKey,
  initialHistory,
  storeHistory,
} = workspace

const symbols = computed(() => catalog.get(selection.value)?.items ?? [])
const symbolsLoading = computed(() => catalog.isLoading(selection.value))
const symbolsFailed = computed(() => catalog.hasFailed(selection.value))
const workspaceStyle = computed(() => ({
  '--market-sidebar-width': `${sidebarWidth.value}px`,
}))
const activeTabPosition = computed(
  () => tabs.findIndex((tab) => tab.id === activeTab.value.id) + 1,
)

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

/**
 * The picker lives in its own BrowserWindow, so opening it is a window
 * command rather than local state. The session is only created after the user
 * actually chooses an asset.
 */
function openSymbolSearch(
  query = '',
  intent: SymbolSearchContext['intent'] = 'replace-tab',
  sourceTab: WorkspaceTab = activeTab.value,
): void {
  if (intent === 'new-tab' && !workspace.hasCapacity()) {
    return
  }
  const desktop = window.cryptoPro
  if (!desktop) {
    workspace.reportError(
      sourceTab,
      new Error('API Electron indisponível. Reinicie com "npm run dev".'),
    )
    return
  }
  void desktop.windows.openSymbolSearch({
    tabId: sourceTab.id,
    intent,
    selection: copyMarketSelection(sourceTab.selection),
    initialQuery: query,
  }).catch((error) => workspace.reportError(sourceTab, error))
}

function requestNewTab(): void {
  openSymbolSearch('', 'new-tab')
}

const marketChart = ref<{ openIndicatorPicker: () => void } | null>(null)

useGlobalShortcuts({
  newTab: requestNewTab,
  openSearch: () => openSymbolSearch(),
  openIndicators: () => marketChart.value?.openIndicatorPicker(),
  toggleMarketPanel,
  toggleOrderBookPanel,
  suspended: settingsOpen,
})

const releaseWindowEvents: (() => void)[] = []

onMounted(() => {
  const desktop = window.cryptoPro
  if (!desktop) {
    return
  }
  // The picker carries the tab that opened it, so choosing an asset always
  // lands on that tab even if the user activated another one meanwhile.
  releaseWindowEvents.push(
    desktop.windows.onSymbolSelected(({ tabId, intent, item }) => {
      const targetTab = workspace.find(tabId) ?? activeTab.value
      if (intent === 'new-tab') {
        workspace.openInNewTab(item, targetTab)
      } else if (workspace.find(tabId)) {
        void workspace.changeSymbol(item, targetTab)
      }
    }),
    desktop.windows.onFavoritesChanged((keys) => {
      const next = new Set(keys)
      favoriteKeys.value = next
      saveFavoriteKeys(next)
    }),
  )
  desktop.windows.syncFavorites([...favoriteKeys.value])
})

onBeforeUnmount(() => {
  releaseWindowEvents.forEach((release) => release())
  releaseWindowEvents.length = 0
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
    <!--
      Hidden panels collapse their grid track to zero instead of being removed
      from the template: every child is placed by an explicit column, and
      dropping a track would renumber all of them.
    -->
    <main
      class="workspace-grid"
      :data-market="marketPanelVisible ? 'visible' : 'hidden'"
      :data-order-book="orderBookPanelVisible ? 'visible' : 'hidden'"
      :style="workspaceStyle"
    >
      <NavigationRail
        :settings-open="settingsOpen"
        @settings="settingsOpen = !settingsOpen"
      />
      <MarketSidebar
        v-if="marketPanelVisible"
        :connection-state="activeTab.status"
        :failed="symbolsFailed"
        :favorite-keys="favoriteKeys"
        :loading="symbolsLoading"
        :selection="selection"
        :symbols="symbols"
        @market="workspace.changeMarket"
        @new-tab="workspace.openInNewTab"
        @open-search="openSymbolSearch"
        @symbol="workspace.changeSymbol"
      />
      <PanelResizeHandle
        v-if="marketPanelVisible"
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
          @activate="workspace.activate"
          @add="requestNewTab"
          @close="workspace.close"
        />
        <MarketChart
          :key="chartRenderKey"
          ref="marketChart"
          :initial-history="initialHistory(activeTab)"
          :selection="selection"
          :session-id="activeTab.id"
          @history="storeHistory"
          @interval="workspace.changeInterval"
        />
      </section>
      <OrderBook
        v-if="orderBookPanelVisible"
        :key="activeTab.id"
        :aggregation-step="activeTab.orderBookAggregation"
        :selection="selection"
        :session-id="activeTab.id"
        @aggregation-step="workspace.changeOrderBookAggregation"
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
        <StreamLatencyText :session-id="activeTab.id" />
      </span>
      <span
        v-if="activeTab.statusMessage"
        class="status-error"
        role="status"
        :title="activeTab.statusMessage"
      >
        {{ activeTab.statusMessage }}
      </span>
      <span class="status-spacer" />
      <span>
        Aba {{ activeTabPosition }} de {{ tabs.length }} ·
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
