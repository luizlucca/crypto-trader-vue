<script setup lang="ts">
import { KeyRound, Pencil, Plus, PlugZap, Trash2 } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import type {
  BinanceAccountDraft,
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import type { ProviderDefinition } from '@providers/domain/providerCatalog'
import { formatApiKeyHint } from '@providers/services/providerAccounts'
import {
  notifyProviderConnectionFeedback,
  notifyProviderConnectionFailure,
  providerAccountFailureMessage,
  providerConnectionFailureMessage,
  providerConnectionStateLabel,
} from '@providers/services/providerConnectionFeedback'
import { useNotifications } from '@app/services/notifications'
import { useSecuritySession } from '@security/services/securitySession'
import BinanceAccountForm from './BinanceAccountForm.vue'
import ProviderCatalog from './ProviderCatalog.vue'
import ProviderIcon from './ProviderIcon.vue'

const props = defineProps<{
  snapshot: SecuritySnapshot
  open: boolean
}>()

const emit = defineEmits<{
  requestAccess: []
}>()

const session = useSecuritySession()
const notifications = useNotifications()
const editingAccount = ref<ProviderAccountSummary>()
const view = ref<'accounts' | 'catalog' | 'form'>('accounts')
const saving = ref(false)
const removingId = ref<string>()
const connectingId = ref<string>()
let activeConnectionAttempt: { accountId: string, id: number } | undefined
let nextConnectionAttemptId = 1
let activeSaveAttempt: number | undefined
let nextSaveAttemptId = 1
const unlocked = computed(() => props.snapshot.state === 'unlocked')

watch(() => props.snapshot.state, (state) => {
  if (state === 'unlocked') {
    return
  }
  activeConnectionAttempt = undefined
  activeSaveAttempt = undefined
  connectingId.value = undefined
  saving.value = false
})

// The settings layer only hides itself, so closing it never unmounts this
// panel. Without dropping the editor, a typed API key and secret would sit in
// the hidden DOM until the operator cancelled, switched section or locked.
watch(() => props.open, (open) => {
  if (open) {
    return
  }
  view.value = 'accounts'
  editingAccount.value = undefined
})

function openCatalog(): void {
  view.value = 'catalog'
}

function selectProvider(id: ProviderDefinition['id']): void {
  if (id === 'binance') {
    editingAccount.value = undefined
    view.value = 'form'
  }
}

function editAccount(account: ProviderAccountSummary): void {
  editingAccount.value = account
  view.value = 'form'
}

function cancelCatalog(): void {
  view.value = 'accounts'
}

function cancelForm(): void {
  view.value = editingAccount.value ? 'accounts' : 'catalog'
  editingAccount.value = undefined
}

async function saveAccount(draft: BinanceAccountDraft): Promise<void> {
  const attempt = nextSaveAttemptId++
  activeSaveAttempt = attempt
  saving.value = true
  try {
    const snapshot = await session.request({
      kind: 'save-binance-account',
      draft,
    })
    if (activeSaveAttempt !== attempt || !unlocked.value) {
      return
    }
    view.value = 'accounts'
    editingAccount.value = undefined
    if (draft.validateAndConnect && snapshot.connection.accountId) {
      notifyConnectionFeedback(snapshot, snapshot.connection.accountId)
    }
  } catch {
    if (activeSaveAttempt !== attempt || !unlocked.value) {
      return
    }
    if (draft.validateAndConnect && draft.accountId) {
      notifyConnectionFailure(draft.accountId)
    } else if (draft.validateAndConnect) {
      notifications.notify({
        tone: 'error',
        message: providerConnectionFailureMessage('unknown'),
      })
    }
  } finally {
    if (activeSaveAttempt === attempt) {
      activeSaveAttempt = undefined
      saving.value = false
    }
  }
}

async function connectAccount(accountId: string): Promise<void> {
  if (!unlocked.value || activeConnectionAttempt) {
    return
  }
  const attempt = {
    accountId,
    id: nextConnectionAttemptId++,
  }
  activeConnectionAttempt = attempt
  connectingId.value = accountId
  try {
    const snapshot = await session.request({
      kind: 'connect-account',
      accountId,
    })
    if (activeConnectionAttempt !== attempt || !unlocked.value) {
      return
    }
    notifyConnectionFeedback(snapshot, accountId)
  } catch {
    if (activeConnectionAttempt !== attempt || !unlocked.value) {
      return
    }
    notifyConnectionFailure(accountId)
  } finally {
    if (activeConnectionAttempt === attempt) {
      activeConnectionAttempt = undefined
      connectingId.value = undefined
    }
  }
}

function editAccountFrom(
  snapshot: SecuritySnapshot,
  accountId: string,
): void {
  const account = snapshot.accounts.find(
    (candidate) => candidate.accountId === accountId,
  )
  if (!account) {
    return
  }
  editAccount(account)
}

function notifyConnectionFeedback(
  snapshot: SecuritySnapshot,
  accountId: string,
): void {
  notifyProviderConnectionFeedback(snapshot, accountId, notifications, {
    retry: (retryAccountId) => { void connectAccount(retryAccountId) },
    openSettings: (settingsAccountId) => editAccountFrom(
      snapshot,
      settingsAccountId,
    ),
  })
}

function notifyConnectionFailure(accountId: string): void {
  notifyProviderConnectionFailure(accountId, 'unknown', notifications, {
    retry: (retryAccountId) => { void connectAccount(retryAccountId) },
    openSettings: (settingsAccountId) => editAccountFrom(
      props.snapshot,
      settingsAccountId,
    ),
  })
}

function isActiveAccount(accountId: string): boolean {
  return props.snapshot.connection.accountId === accountId
    && props.snapshot.connection.state === 'connected'
}

async function removeAccount(accountId: string): Promise<void> {
  removingId.value = accountId
  try {
    await session.request({ kind: 'remove-account', accountId })
  } finally {
    removingId.value = undefined
  }
}
</script>

<template>
  <section class="settings-content provider-settings">
    <div class="settings-section-heading">
      <div>
        <span>PROVEDORES</span>
        <h3>Contas e conexões privadas</h3>
        <p>As credenciais ficam cifradas localmente e nunca são exibidas.</p>
      </div>
      <button
        v-if="unlocked && view === 'accounts'"
        class="create-theme-button"
        type="button"
        @click="openCatalog"
      >
        <Plus aria-hidden="true" />
        Adicionar provedor
      </button>
    </div>

    <div v-if="!unlocked" class="provider-locked-state">
      <span><KeyRound aria-hidden="true" /></span>
      <div>
        <strong>Plataforma bloqueada</strong>
        <p>Desbloqueie para visualizar ou alterar as contas configuradas.</p>
      </div>
      <button class="primary" type="button" @click="emit('requestAccess')">
        Entrar
      </button>
    </div>

    <ProviderCatalog
      v-else-if="view === 'catalog'"
      @cancel="cancelCatalog"
      @select="selectProvider"
    />

    <BinanceAccountForm
      v-else-if="view === 'form'"
      :account="editingAccount"
      :pending="saving"
      @cancel="cancelForm"
      @save="saveAccount"
    />

    <div v-else class="provider-account-list">
      <article v-for="account in snapshot.accounts" :key="account.accountId">
        <span class="provider-account-icon">
          <ProviderIcon :id="account.provider" />
        </span>
        <div class="provider-account-copy">
          <strong>{{ account.label }}</strong>
          <small>
            Binance · {{ account.markets.join(' + ') }} ·
            {{ formatApiKeyHint(account.apiKeySuffix) }}
          </small>
          <small
            v-if="providerAccountFailureMessage(account)"
            class="provider-account-failure"
            role="status"
          >
            {{ providerAccountFailureMessage(account) }}
          </small>
        </div>
        <span
          :class="['provider-connection', account.connection]"
          :aria-label="isActiveAccount(account.accountId)
            ? 'Conta conectada'
            : undefined"
        >
          {{ providerConnectionStateLabel(account.connection) }}
        </span>
        <button
          :disabled="connectingId !== undefined
            || isActiveAccount(account.accountId)"
          class="provider-connect-button"
          type="button"
          @click="connectAccount(account.accountId)"
        >
          {{ connectingId === account.accountId ? 'Conectando…' : 'Conectar' }}
        </button>
        <button
          aria-label="Editar conta"
          type="button"
          @click="editAccount(account)"
        >
          <Pencil aria-hidden="true" />
        </button>
        <button
          aria-label="Remover conta"
          :disabled="removingId === account.accountId"
          type="button"
          @click="removeAccount(account.accountId)"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </article>
      <div v-if="snapshot.accounts.length === 0" class="provider-empty-state">
        <PlugZap aria-hidden="true" />
        <strong>Nenhuma conta conectada</strong>
        <p>Adicione uma conta Binance para validar credenciais privadas.</p>
      </div>
    </div>
  </section>
</template>
