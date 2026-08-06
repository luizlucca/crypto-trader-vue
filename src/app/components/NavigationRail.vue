<script setup lang="ts">
import {
  CandlestickChart,
  ListOrdered,
  LogOut,
  Settings,
  WalletCards,
  Workflow,
} from '@lucide/vue'

defineProps<{
  settingsOpen: boolean
}>()

const emit = defineEmits<{
  settings: []
}>()
</script>

<template>
  <nav class="navigation-rail" aria-label="Navegação principal">
    <button
      aria-current="page"
      aria-label="Mercado"
      class="active"
      title="Mercado"
      type="button"
    >
      <CandlestickChart aria-hidden="true" />
    </button>
    <button aria-label="Carteira" title="Carteira" type="button">
      <WalletCards aria-hidden="true" />
    </button>
    <button aria-label="Ordens" title="Ordens" type="button">
      <ListOrdered aria-hidden="true" />
    </button>
    <button aria-label="Estratégias" title="Estratégias" type="button">
      <Workflow aria-hidden="true" />
    </button>
    <span class="rail-spacer" />
    <button
      :aria-expanded="settingsOpen"
      :class="{ active: settingsOpen }"
      aria-controls="general-settings-panel"
      aria-label="Configurações"
      title="Configurações"
      type="button"
      @click="emit('settings')"
    >
      <Settings aria-hidden="true" />
    </button>
    <button aria-label="Sair" title="Sair" type="button">
      <LogOut aria-hidden="true" />
    </button>
  </nav>
</template>
