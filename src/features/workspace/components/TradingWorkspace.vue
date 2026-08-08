<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { SecuritySnapshot } from '@shared/contracts/security'
import AppHeader from '@app/components/AppHeader.vue'
import AppToastHost from '@app/components/AppToastHost.vue'
import GeneralSettingsPanel from '@settings/components/GeneralSettingsPanel.vue'
import SecurityAccessDialog from '@security/components/SecurityAccessDialog.vue'
import NavigationRail from '@app/components/NavigationRail.vue'
import PanelResizeHandle from '@app/components/PanelResizeHandle.vue'
import MarketSidebar from '@market/components/MarketSidebar.vue'
import MarketChart from '@chart/components/MarketChart.vue'
import TestEnvironmentBadge from '@chart/components/TestEnvironmentBadge.vue'
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
import type {
  SecurityAccessMode,
} from '@security/services/securityAccessController'
import ProviderConnectionDialog
  from '@providers/components/ProviderConnectionDialog.vue'
import EnvironmentSwitchDialog
  from '@providers/components/EnvironmentSwitchDialog.vue'
import { switchEnvironment } from '@providers/services/environmentSwitch'
import { useConnectionGate } from '@providers/services/connectionGate'
import { siblingAccount } from '@shared/domain/providerEnvironment'
import { useNotifications } from '@app/services/notifications'
import {
  canRetryProviderConnection,
  nextPrivateAccessAction,
} from '@providers/services/privateAccessFlow'
import { canShowTradingTicket } from '@trading/domain/privateTradingAccess'
import {
  createProviderConnectionAttempt,
} from '@providers/services/providerConnectionAttempt'
import {
  notifyProviderConnectionFeedback,
  notifyProviderConnectionFailure,
} from '@providers/services/providerConnectionFeedback'
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
const securityAccessMode = ref<SecurityAccessMode>()
const providerConnectionOpen = ref(false)
const settingsPanel = ref<{
  selectSection(section: 'providers'): void
} | null>(null)
const favoriteKeys = shallowRef(loadFavoriteKeys())
const security = useSecuritySession()
const notifications = useNotifications()
const connectionAttempt = createProviderConnectionAttempt({
  disconnect: () => security.request({ kind: 'disconnect-account' })
    .then(() => undefined),
})

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

const gate = useConnectionGate()
const environmentSwitchPending = ref(false)
/**
 * Raised by whichever door tried to connect an account from another venue.
 * The workspace owns the dialog and the rebuild, so every door hands off here.
 */
const environmentSwitchTarget = gate.pendingSwitch

// The gate compares against what the chart is drawing, not against the
// connected account: those disagree for exactly as long as a switch is
// in flight, and that window is what it exists to close.
watch(
  () => selection.value.environment,
  (environment) => gate.followWorkspace(environment),
  { immediate: true },
)

/**
 * Whether the operator has an account for the venue they are not looking at.
 * Only used to decide what the header button offers; the picker itself lists
 * every account, because two test accounts differ by market, not environment.
 */
const hasSiblingAccount = computed(() => siblingAccount(
  security.snapshot.value.accounts,
  selection.value.environment,
) !== undefined)

/**
 * The header button opens the account picker rather than toggling blindly.
 * With a Spot testnet account and a Futures testnet account registered, "the
 * other environment" names two different credentials, and guessing between
 * them is how the wrong one gets connected.
 */
function requestEnvironmentSwitch(): void {
  if (security.snapshot.value.state !== 'unlocked') {
    openSecurityAccess()
    return
  }
  if (security.snapshot.value.accounts.length === 0) {
    openProviderSettings()
    return
  }
  providerConnectionOpen.value = true
}

async function confirmEnvironmentSwitch(): Promise<void> {
  const target = environmentSwitchTarget.value
  if (!target || environmentSwitchPending.value) {
    return
  }
  environmentSwitchPending.value = true
  try {
    const outcome = await switchEnvironment(target, {
      connect: (accountId) => security.request({
        kind: 'connect-account',
        accountId,
      }),
      resetWorkspace: workspace.resetTo,
    })
    // The workspace was never touched, so the operator is left exactly where
    // they were: the dialog stays open and names what failed.
    if (outcome.status === 'connection-failed') {
      notifyConnectionFeedback(outcome.snapshot, target.accountId)
      return
    }
    gate.clearPendingSwitch()
    providerConnectionOpen.value = false
  } finally {
    environmentSwitchPending.value = false
  }
}

function cancelEnvironmentSwitch(): void {
  if (!environmentSwitchPending.value) {
    gate.clearPendingSwitch()
  }
}

const statusLabel = computed(() => sessionStatusLabel(activeTab.value))
const tradingTicketVisible = computed(
  () => canShowTradingTicket(security.snapshot.value, selection.value.market),
)

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
  connectionAttempt.dispose()
  releaseSecuritySession?.()
  releaseSecuritySession = undefined
  releaseWindowEvents.forEach((release) => release())
  releaseWindowEvents.length = 0
})

function openSecurityAccess(): void {
  securityAccessMode.value = undefined
  securityAccessOpen.value = true
}

function openPasswordChange(): void {
  if (security.snapshot.value.state !== 'unlocked') {
    return
  }
  securityAccessMode.value = 'change-password'
  securityAccessOpen.value = true
}

function closeSecurityAccess(): void {
  securityAccessOpen.value = false
  securityAccessMode.value = undefined
}

function notifyPasswordChanged(): void {
  notifications.notify({
    tone: 'success',
    message: 'Senha pessoal alterada com segurança.',
  })
}

function openProviderSettings(): void {
  cancelProviderConnection()
  settingsPanel.value?.selectSection('providers')
  settingsOpen.value = true
}

function invalidateProviderConnection(): void {
  connectionAttempt.invalidate()
  providerConnectionOpen.value = false
}

function cancelProviderConnection(): void {
  connectionAttempt.cancel()
  providerConnectionOpen.value = false
}

function connectionFeedbackActions() {
  return {
    retry: (accountId: string) => {
      if (!canRetryProviderConnection(security.snapshot.value, accountId)) {
        return
      }
      providerConnectionOpen.value = true
      void connectProviderAccount(accountId)
    },
    openSettings: openProviderSettings,
  }
}

function notifyConnectionFeedback(
  snapshot: SecuritySnapshot,
  accountId: string,
): void {
  notifyProviderConnectionFeedback(
    snapshot,
    accountId,
    notifications,
    connectionFeedbackActions(),
  )
}

function notifyConnectionFailure(accountId: string): void {
  notifyProviderConnectionFailure(
    accountId,
    'unknown',
    notifications,
    connectionFeedbackActions(),
  )
}

async function connectProviderAccount(accountId: string): Promise<void> {
  /*
   * Connecting an account from another venue is a workspace switch, whichever
   * door it came through — the header button, this picker, or the reconnect
   * offered after a failure. Letting it through here would leave a testnet
   * credential connected under a production chart: the private side pointed at
   * one exchange while every price on screen came from the other.
   *
   * Routed to the confirmation instead of connecting. The reset destroys work,
   * so it is never a side effect of picking an account from a list.
   */
  if (!gate.mayConnect(accountId, security.snapshot.value.accounts)) {
    return
  }

  const attempt = connectionAttempt.begin(accountId)
  if (!attempt) {
    return
  }

  try {
    await connectionAttempt.waitForDisconnect()
    if (!connectionAttempt.isCurrent(
      attempt,
      security.snapshot.value.state,
    )) {
      return
    }
    // The account can disappear while the previous disconnect settles; leaving
    // the dialog open would strand an empty account picker over the workspace.
    if (!canRetryProviderConnection(security.snapshot.value, accountId)) {
      providerConnectionOpen.value = false
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
    if (snapshot.connection.accountId !== accountId) {
      providerConnectionOpen.value = false
      return
    }
    const connection = snapshot.connection
    if (connection.state === 'connected' || connection.state === 'failed') {
      providerConnectionOpen.value = false
      notifyConnectionFeedback(snapshot, accountId)
    }
  } catch {
    if (!connectionAttempt.isCurrent(
      attempt,
      security.snapshot.value.state,
    )) {
      return
    }
    providerConnectionOpen.value = false
    notifyConnectionFailure(accountId)
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
      invalidateProviderConnection()
    }
  },
)

function lockSecuritySession(): void {
  invalidateProviderConnection()
  void security.request({ kind: 'lock' })
}
</script>

<template>
  <div class="app-shell">
    <AppHeader
      :selection="selection"
      :settings-open="settingsOpen"
      :security-state="security.snapshot.value.state"
      :has-sibling-account="hasSiblingAccount"
      :status="activeTab.status"
      @access="openSecurityAccess"
      @lock="lockSecuritySession"
      @settings="settingsOpen = !settingsOpen"
      @switch-environment="requestEnvironmentSwitch"
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
      :data-trading="tradingTicketVisible ? 'visible' : 'hidden'"
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
        <TestEnvironmentBadge :environment="selection.environment" />
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
      <TradingTicket
        v-if="tradingTicketVisible"
        :selection="selection"
      />
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
      @change-password="openPasswordChange"
      @request-access="openSecurityAccess"
    />
    <SecurityAccessDialog
      :mode="securityAccessMode"
      :open="securityAccessOpen"
      :state="security.snapshot.value.state"
      @close="closeSecurityAccess"
      @authenticated="handleAuthenticated"
      @password-changed="notifyPasswordChanged"
    />
    <ProviderConnectionDialog
      :accounts="security.snapshot.value.accounts"
      :connection="security.snapshot.value.connection"
      :open="providerConnectionOpen"
      @close="cancelProviderConnection"
      @open-settings="openProviderSettings"
      @select="connectProviderAccount"
    />
    <EnvironmentSwitchDialog
      v-if="environmentSwitchTarget"
      :open-tabs="tabs.length"
      :pending="environmentSwitchPending"
      :target="environmentSwitchTarget"
      @cancel="cancelEnvironmentSwitch"
      @confirm="confirmEnvironmentSwitch"
    />
    <AppToastHost />
  </div>
</template>
