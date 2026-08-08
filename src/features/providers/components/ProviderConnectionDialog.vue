<script setup lang="ts">
import { LoaderCircle, Settings2, X } from '@lucide/vue'
import { computed, onBeforeUnmount, watch } from 'vue'
import type {
  ProviderAccountSummary,
  ProviderConnectionSnapshot,
} from '@shared/contracts/security'
import ProviderIcon from './ProviderIcon.vue'
import {
  bindProviderConnectionDialogEscape,
} from '@providers/services/providerConnectionDialogEscape'

const props = defineProps<{
  open: boolean
  accounts: readonly ProviderAccountSummary[]
  connection: ProviderConnectionSnapshot
}>()

const emit = defineEmits<{
  select: [accountId: string]
  close: []
  openSettings: []
}>()

const connectingAccount = computed(() => props.accounts.find(
  (account) => account.accountId === props.connection.accountId,
))
const isConnecting = computed(() => props.connection.state === 'connecting')
let releaseEscape: (() => void) | undefined

watch(
  () => props.open,
  (open) => {
    releaseEscape?.()
    releaseEscape = open
      ? bindProviderConnectionDialogEscape(document, () => emit('close'))
      : undefined
  },
  { immediate: true },
)

onBeforeUnmount(() => releaseEscape?.())
</script>

<template>
  <Teleport to="body">
    <section
      v-if="open"
      aria-labelledby="provider-connection-title"
      aria-modal="true"
      class="provider-connection-dialog"
      role="dialog"
    >
      <header>
        <div>
          <span>CONEXÕES PRIVADAS</span>
          <h2 id="provider-connection-title">
            {{ isConnecting ? 'Validando conexão' : 'Escolha uma conta' }}
          </h2>
        </div>
        <button aria-label="Fechar" type="button" @click="emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>

      <div v-if="isConnecting" class="provider-connection-loading">
        <span class="provider-connection-spinner">
          <LoaderCircle aria-hidden="true" />
        </span>
        <div>
          <strong>
            Conectando a {{ connectingAccount?.label ?? 'sua conta' }}
          </strong>
          <p>Validando credenciais de forma segura nesta sessão.</p>
        </div>
      </div>

      <div v-else class="provider-connection-options">
        <p>Selecione a conta que deseja validar nesta sessão.</p>
        <button
          v-for="account in accounts"
          :key="account.accountId"
          class="provider-connection-option"
          type="button"
          @click="emit('select', account.accountId)"
        >
          <span class="provider-account-icon">
            <ProviderIcon :id="account.provider" />
          </span>
          <span>
            <strong>{{ account.label }}</strong>
            <small>Binance · {{ account.markets.join(' + ') }}</small>
          </span>
          <!--
            Two test accounts differ only by market, so the market has to be
            readable here: picking the wrong one fails as "credenciais".
          -->
          <span
            v-if="account.environment === 'test'"
            class="provider-account-environment"
          >TESTNET</span>
          <span
            v-if="account.accountId === connection.accountId
              && connection.state === 'connected'"
            class="provider-account-connected"
          >Conectada</span>
        </button>
      </div>

      <footer>
        <button class="secondary" type="button" @click="emit('close')">
          Agora não
        </button>
        <button
          class="provider-connection-settings"
          type="button"
          @click="emit('openSettings')"
        >
          <Settings2 aria-hidden="true" />
          Configurações
        </button>
      </footer>
    </section>
  </Teleport>
</template>
