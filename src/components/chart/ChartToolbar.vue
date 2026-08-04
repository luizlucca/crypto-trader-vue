<script setup lang="ts">
import {
  Bell,
  ChartNoAxesCombined,
  Maximize,
  PanelLeft,
  PanelRight,
  Plus,
  Rewind,
  Settings,
} from '@lucide/vue'
import {
  marketPanelVisible,
  orderBookPanelVisible,
  setMarketPanelVisible,
  setOrderBookPanelVisible,
} from '@/services/workspacePanels'

defineProps<{ interval: string, indicatorCount: number }>()
defineEmits<{ interval: [value: string], indicators: [] }>()

const intervals = ['1m', '5m', '15m', '1h', '4h', '1D']
</script>

<template>
  <div class="chart-toolbar">
    <!--
      A panel is brought back from the edge it left free, so the control sits
      where the eye already went looking for the panel: the market on the far
      left, the order book on the far right.
    -->
    <button
      v-if="!marketPanelVisible"
      aria-label="Exibir Mercado"
      class="panel-restore"
      title="Exibir Mercado (Ctrl+B)"
      type="button"
      @click="setMarketPanelVisible(true)"
    >
      <PanelLeft aria-hidden="true" />
    </button>
    <button
      aria-label="Adicionar"
      class="add-button"
      title="Adicionar"
      type="button"
    >
      <Plus aria-hidden="true" />
    </button>
    <button
      v-for="value in intervals"
      :key="value"
      :class="{ active: interval === value.toLowerCase() }"
      type="button"
      @click="$emit('interval', value.toLowerCase())"
    >
      {{ value }}
    </button>
    <span class="toolbar-divider" />
    <button
      :class="{ active: indicatorCount > 0 }"
      type="button"
      @click="$emit('indicators')"
    >
      <ChartNoAxesCombined aria-hidden="true" /> Indicadores
      <i v-if="indicatorCount > 0" class="toolbar-badge">
        {{ indicatorCount }}
      </i>
    </button>
    <button type="button"><Bell aria-hidden="true" /> Alerta</button>
    <button type="button"><Rewind aria-hidden="true" /> Replay</button>
    <span class="toolbar-spacer" />
    <button
      aria-label="Configurações do gráfico"
      title="Configurações"
      type="button"
    >
      <Settings aria-hidden="true" />
    </button>
    <button aria-label="Tela cheia" title="Tela cheia" type="button">
      <Maximize aria-hidden="true" />
    </button>
    <button
      v-if="!orderBookPanelVisible"
      aria-label="Exibir Livro de ordens"
      class="panel-restore"
      title="Exibir Livro de ordens (Ctrl+Shift+B)"
      type="button"
      @click="setOrderBookPanelVisible(true)"
    >
      <PanelRight aria-hidden="true" />
    </button>
  </div>
</template>
