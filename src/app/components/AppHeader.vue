<script setup lang="ts">
import {
  Bell,
  ChevronDown,
  FlaskConical,
  Gem,
  Globe,
  Lock,
  LockKeyhole,
  Minus,
  Moon,
  Settings,
  Square,
  Sun,
  X,
} from '@lucide/vue'
import { computed } from 'vue'
import { appTheme, toggleTheme } from '@settings/services/theme'
import type { MarketSelection, StreamStatus } from '@shared/types/market'
import type { SecurityState } from '@shared/contracts/security'
import {
  environmentLabel,
  oppositeEnvironment,
} from '@shared/domain/providerEnvironment'

const props = defineProps<{
  status: StreamStatus['state']
  selection: MarketSelection
  settingsOpen: boolean
  securityState: SecurityState
  /** False when no account exists for the other venue yet. */
  hasSiblingAccount: boolean
}>()

const emit = defineEmits<{
  settings: []
  access: []
  lock: []
  switchEnvironment: []
}>()

const testing = computed(() => props.selection.environment === 'test')
const environmentName = computed(
  () => environmentLabel(props.selection.environment),
)

/**
 * Named for where the click leads, not for where the app is.
 *
 * With a sibling registered the click opens the account picker rather than
 * jumping: two testnet accounts differ by market, not by environment, so
 * "the other environment" can name more than one credential and the operator
 * has to be the one choosing. With none, the button invites registering one
 * instead of vanishing, which would leave no visible path to the other venue.
 */
const environmentActionLabel = computed(() => {
  // While locked the accounts are withheld, so `hasSiblingAccount` reads false
  // for want of an answer rather than because there is none. Offering to
  // register an account would be wrong advice to anyone who already has one.
  if (props.securityState !== 'unlocked') {
    return 'Entrar para trocar de conta ou ambiente'
  }
  const target = environmentLabel(
    oppositeEnvironment(props.selection.environment),
  )
  return props.hasSiblingAccount
    ? 'Trocar de conta ou ambiente'
    : `Adicionar conta de ${target}`
})

const connectionLabel = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'Conectado'
    case 'reconnecting':
      return 'Reconectando'
    case 'error':
      return 'Erro'
    default:
      return 'Conectando'
  }
})

function toggleAccountAccess(): void {
  if (props.securityState === 'unlocked') {
    emit('lock')
    return
  }
  emit('access')
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="brand-mark"><Gem aria-hidden="true" /></span>
      <span>CryptoPro</span>
    </div>

    <button class="exchange-selector" type="button">
      <Gem aria-hidden="true" />
      Binance · {{ selection.market === 'futures' ? 'Futuros' : 'Spot' }}
      <ChevronDown aria-hidden="true" class="chevron" />
    </button>

    <button
      class="environment-selector"
      :class="{ testing }"
      :title="environmentActionLabel"
      type="button"
      @click="emit('switchEnvironment')"
    >
      <FlaskConical v-if="testing" aria-hidden="true" />
      <Globe v-else aria-hidden="true" />
      {{ environmentName }}
      <ChevronDown aria-hidden="true" class="chevron" />
    </button>

    <div class="connection" :class="status">
      <span class="connection-dot" aria-hidden="true" />
      {{ connectionLabel }}
    </div>

    <div class="ticker-strip">
      <div class="ticker">
        <span>BTC/USDT</span>
        <strong>67.842,1</strong>
        <em class="positive">+1,24%</em>
      </div>
      <div class="ticker">
        <span>ETH/USDT</span>
        <strong>3.692,14</strong>
        <em class="positive">+0,85%</em>
      </div>
      <div class="ticker">
        <span>SOL/USDT</span>
        <strong>178,21</strong>
        <em class="negative">-0,43%</em>
      </div>
    </div>

    <div class="window-actions">
      <button
        :class="['account-access', securityState]"
        :title="securityState === 'unlocked'
          ? 'Bloquear contas privadas'
          : 'Entrar nas contas privadas'"
        type="button"
        @click="toggleAccountAccess"
      >
        <Lock v-if="securityState === 'unlocked'" aria-hidden="true" />
        <LockKeyhole v-else aria-hidden="true" />
        {{ securityState === 'unlocked' ? 'Bloquear' : 'Entrar' }}
      </button>
      <button
        :aria-label="appTheme === 'dark'
          ? 'Ativar tema claro'
          : 'Ativar tema escuro'"
        class="theme-toggle"
        :title="appTheme === 'dark' ? 'Tema claro' : 'Tema escuro'"
        type="button"
        @click="toggleTheme"
      >
        <Sun v-if="appTheme === 'dark'" aria-hidden="true" />
        <Moon v-else aria-hidden="true" />
      </button>
      <button
        :aria-expanded="settingsOpen"
        aria-controls="general-settings-panel"
        aria-label="Configurações"
        :class="{ active: settingsOpen }"
        title="Configurações"
        type="button"
        @click="emit('settings')"
      >
        <Settings aria-hidden="true" />
      </button>
      <button aria-label="Notificações" title="Notificações" type="button">
        <Bell aria-hidden="true" />
      </button>
      <button aria-label="Minimizar" title="Minimizar" type="button">
        <Minus aria-hidden="true" />
      </button>
      <button aria-label="Maximizar" title="Maximizar" type="button">
        <Square aria-hidden="true" />
      </button>
      <button aria-label="Fechar" title="Fechar" type="button">
        <X aria-hidden="true" />
      </button>
    </div>
  </header>
</template>
