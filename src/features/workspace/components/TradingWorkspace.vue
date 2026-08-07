<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type {
  AccountFailureCode,
  SecuritySnapshot,
} from '@shared/contracts/security'
import AppHeader from '@app/components/AppHeader.vue'
import AppToastHost from '@app/components/AppToastHost.vue'
import GeneralSettingsPanel from '@settings/components/GeneralSettingsPanel.vue'
import SecurityAccessDialog from '@security/components/SecurityAccessDialog.vue'
import NavigationRail from '@app/components/NavigationRail.vue'
import PanelResizeHandle from '@app/components/PanelResizeHandle.vue'
import MarketSidebar from '@market/components/MarketSidebar.vue'
import MarketChart from '@chart/components/MarketChart.vue'
import OrderBook from '@orderbook/components/OrderBook.vue'
import TradingTicket from '@trading/components/TradingTicket.vue'
import PositionsPanel from '@positions/components/PositionsPanel.vue'
import StreamLatencyText from './StreamLatencyText.vue'
import WorkspaceTabs from './WorkspaceTabs.vue'
import {
  copyMarketSelection,
  type SymbolSearchContext,
} from '@shared/contracts/desktop'
import { loadFavoriteKeys, saveFavoriteKeys } from '@market/services/favorites'
import { useCatalogCache } from '@market/composables/useCatalogCache'
import { useGlobalShortcuts } from '@workspace/composables/useGlobalShortcuts'
import { useResizableSidebar } from '@workspace/composables/useResizableSidebar'
import { useSecuritySession } from '@security/services/securitySession'
import ProviderConnectionDialog
  from '@providers/components/ProviderConnectionDialog.vue'
import { useNotifications } from '@app/services/notifications'
import { nextPrivateAccessAction } from '@providers/services/privateAccessFlow'
import {
  createProviderConnectionAttempt,
} from '@providers/services/providerConnectionAttempt'
import {
  marketPanelVisible,
  orderBookPanelVisible,
  toggleMarketPanel,
  toggleOrderBookPanel,
} from '@app/services/panelVisibility'
import { useWorkspaceTabs } from '@workspace/composables/useWorkspaceTabs'
import {
  MAX_WORKSPACE_TABS,
  sessionStatusLabel,
  workspaceTabLabel,
  type WorkspaceTab,
} from '@workspace/domain/workspace'

const SIDEBAR_DEFAULT_WIDTH = 250
const SIDEBAR_MIN_WIDTH = 190

const settingsOpen = ref(false)
const securityAccessOpen = ref(false)
const providerConnectionOpen = ref(false)
const settingsPanel = ref<{
  selectSection(section: 'providers'): void
} | null>(null)
const favoriteKeys = shallowRef(loadFavoriteKeys())
const security = useSecuritySession()
const notifications = useNotifications()
const connectionAttempt = createProviderConnectionAttempt()
let pendingDisconnect: Promise<void> | undefined

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

const statusLabel = computed(() => sessionStatusLabel(activeTab.value))

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
let releaseSecuritySession: (() => void) | undefined

onMounted(() => {
  releaseSecuritySession = security.start()
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
  releaseSecuritySession?.()
  releaseSecuritySession = undefined
  releaseWindowEvents.forEach((release) => release())
  releaseWindowEvents.length = 0
})

function openSecurityAccess(): void {
  securityAccessOpen.value = true
}

function openProviderSettings(): void {
  cancelProviderConnection()
  settingsPanel.value?.selectSection('providers')
  settingsOpen.value = true
}

function cancelProviderConnection(): void {
  const cancelled = connectionAttempt.cancel()
  providerConnectionOpen.value = false
  if (!cancelled) {
    return
  }
  const disconnect = security.request({ kind: 'disconnect-account' })
    .then(() => undefined)
    .catch(() => undefined)
  pendingDisconnect = disconnect
  void disconnect.finally(() => {
    if (pendingDisconnect === disconnect) {
      pendingDisconnect = undefined
    }
  })
}

function connectionFailureMessage(failureCode: AccountFailureCode): string {
  switch (failureCode) {
    case 'credentials':
      return 'Não foi possível validar as credenciais da conta.'
    case 'permission':
      return 'A conta não tem a permissão necessária para conectar.'
    case 'clock':
      return 'A data e a hora do computador precisam ser ajustadas.'
    case 'network':
      return 'Não foi possível alcançar a Binance. Tente novamente.'
    case 'unknown':
      return 'Não foi possível conectar a conta agora. Tente novamente.'
  }
}

function notifyConnectionFailure(
  accountId: string,
  failureCode: AccountFailureCode,
): void {
  notifications.notify({
    tone: 'error',
    message: connectionFailureMessage(failureCode),
    retry: () => {
      providerConnectionOpen.value = true
      void connectProviderAccount(accountId)
    },
    openSettings: openProviderSettings,
  })
}

async function connectProviderAccount(accountId: string): Promise<void> {
  const attempt = connectionAttempt.begin(accountId)
  if (!attempt) {
    return
  }

  try {
    await pendingDisconnect
    if (!connectionAttempt.isCurrent(
      attempt,
      security.snapshot.value.state,
    )) {
      return
    }
    const account = security.snapshot.value.accounts.find(
      (candidate) => candidate.accountId === accountId,
    )
    if (!account) {
      return
    }

    const snapshot = await security.request({
      kind: 'connect-account',
      accountId,
    })
    if (!connectionAttempt.isCurrent(
      attempt,
      security.snapshot.value.state,
    ) || snapshot.state !== 'unlocked') {
      return
    }
    const connection = snapshot.connection
    if (connection.accountId !== accountId) {
      providerConnectionOpen.value = false
      return
    }
    if (connection.state === 'connected') {
      providerConnectionOpen.value = false
      notifications.notify({
        tone: 'success',
        message: `Conectado à Binance — ${account.label}`,
      })
      return
    }
    if (connection.state === 'failed') {
      providerConnectionOpen.value = false
      notifyConnectionFailure(accountId, connection.failureCode ?? 'unknown')
    }
  } catch {
    if (!connectionAttempt.isCurrent(
      attempt,
      security.snapshot.value.state,
    )) {
      return
    }
    providerConnectionOpen.value = false
    notifyConnectionFailure(accountId, 'unknown')
  } finally {
    connectionAttempt.finish(attempt)
  }
}

function handleAuthenticated(snapshot: SecuritySnapshot): void {
  const action = nextPrivateAccessAction(snapshot)
  switch (action.kind) {
    case 'open-providers':
      openProviderSettings()
      return
    case 'connect-account':
      providerConnectionOpen.value = true
      void connectProviderAccount(action.accountId)
      return
    case 'choose-account':
      providerConnectionOpen.value = true
  }
}

watch(
  () => security.snapshot.value.state,
  (state) => {
    if (state !== 'unlocked') {
      cancelProviderConnection()
    }
  },
)

function lockSecuritySession(): void {
  cancelProviderConnection()
  void security.request({ kind: 'lock' })
}
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :selection="selection"
      :settings-open="settingsOpen"
      :security-state="security.snapshot.value.state"
      :status="activeTab.status"
      @access="openSecurityAccess"
      @lock="lockSecuritySession"
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
      <!--
        The chart is the panel the tab strip controls. Named and labelled so
        the tablist above it points at something instead of at nothing.
      -->
      <section
        :id="`chart-panel-${activeTab.id}`"
        :aria-label="`Gráfico de ${workspaceTabLabel(activeTab)}`"
        class="chart-workspace panel"
        role="tabpanel"
      >
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
      ref="settingsPanel"
      :open="settingsOpen"
      @close="settingsOpen = false"
      @request-access="openSecurityAccess"
    />
    <SecurityAccessDialog
      :open="securityAccessOpen"
      :state="security.snapshot.value.state"
      @close="securityAccessOpen = false"
      @authenticated="handleAuthenticated"
    />
    <ProviderConnectionDialog
      :accounts="security.snapshot.value.accounts"
      :connection="security.snapshot.value.connection"
      :open="providerConnectionOpen"
      @close="cancelProviderConnection"
      @open-settings="openProviderSettings"
      @select="connectProviderAccount"
    />
    <AppToastHost />
  </div>
</template>
