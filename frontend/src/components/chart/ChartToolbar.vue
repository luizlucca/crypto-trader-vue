<script setup lang="ts">
defineProps<{ interval: string }>()
defineEmits<{ interval: [value: string] }>()

const intervals = ['1m', '5m', '15m', '1h', '4h', '1D']
</script>

<template>
  <div class="chart-toolbar">
    <button class="add-button" type="button">＋</button>
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
    <button type="button">◫ Indicadores</button>
    <button type="button">● Alerta</button>
    <button type="button">◀ Replay</button>
    <span class="toolbar-spacer" />
    <button type="button">⚙</button>
    <button type="button">⛶</button>
  </div>
</template>
