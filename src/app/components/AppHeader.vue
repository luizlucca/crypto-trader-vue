<script setup lang="ts">
import {
  Bell,
  ChevronDown,
  Gem,
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

const props = defineProps<{
  status: StreamStatus['state']
  selection: MarketSelection
  settingsOpen: boolean
}>()

const emit = defineEmits<{
  settings: []
}>()

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
