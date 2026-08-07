<script setup lang="ts">
import { KeyRound, Pencil, Plus, PlugZap, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import type {
  BinanceAccountDraft,
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { formatApiKeyHint } from '@providers/services/providerAccounts'
import { useSecuritySession } from '@security/services/securitySession'
import BinanceAccountForm from './BinanceAccountForm.vue'

const props = defineProps<{
  snapshot: SecuritySnapshot
}>()

const emit = defineEmits<{
  requestAccess: []
}>()

const session = useSecuritySession()
const editing = ref<ProviderAccountSummary>()
const saving = ref(false)
const removingId = ref<string>()
const formOpen = computed(() => editing.value !== undefined)
const unlocked = computed(() => props.snapshot.state === 'unlocked')

function addAccount(): void {
  editing.value = {
    accountId: '',
    provider: 'binance',
    label: '',
    markets: ['spot'],
    apiKeySuffix: '••••',
    enabled: true,
    connection: 'disconnected',
  }
}

function editAccount(account: ProviderAccountSummary): void {
  editing.value = account
}

async function saveAccount(draft: BinanceAccountDraft): Promise<void> {
  saving.value = true
  try {
    await session.request({ kind: 'save-binance-account', draft })
    editing.value = undefined
  } finally {
    saving.value = false
  }
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
        v-if="unlocked && !formOpen"
        class="create-theme-button"
        type="button"
        @click="addAccount"
      >
        <Plus aria-hidden="true" />
        Adicionar Binance
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

    <BinanceAccountForm
      v-else-if="formOpen"
      :account="editing?.accountId ? editing : undefined"
      :pending="saving"
      @cancel="editing = undefined"
      @save="saveAccount"
    />

    <div v-else class="provider-account-list">
      <article v-for="account in snapshot.accounts" :key="account.accountId">
        <span class="provider-account-icon"><PlugZap aria-hidden="true" /></span>
        <div class="provider-account-copy">
          <strong>{{ account.label }}</strong>
          <small>
            Binance · {{ account.markets.join(' + ') }} ·
            {{ formatApiKeyHint(account.apiKeySuffix) }}
          </small>
        </div>
        <span :class="['provider-connection', account.connection]">
          {{ account.connection }}
        </span>
        <button aria-label="Editar conta" type="button" @click="editAccount(account)">
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
        <p>Adicione uma conta Binance para validar suas credenciais privadas.</p>
      </div>
    </div>
  </section>
</template>
