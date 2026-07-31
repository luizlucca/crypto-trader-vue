<script setup lang="ts">
import { computed } from 'vue'
import type { ThemePalette } from '@/services/themeCatalog'

const props = defineProps<{
  palette: ThemePalette
  large?: boolean
}>()

const previewStyle = computed(() => ({
  '--preview-bg': props.palette.chartBackground,
  '--preview-grid': props.palette.chartGrid,
  '--preview-border': props.palette.chartBorder,
  '--preview-accent': props.palette.accent,
  '--preview-up': props.palette.candleUp,
  '--preview-down': props.palette.candleDown,
}))
</script>

<template>
  <span
    :class="{ large }"
    :style="previewStyle"
    class="theme-preview"
    aria-hidden="true"
  >
    <i class="preview-grid-line line-one" />
    <i class="preview-grid-line line-two" />
    <i class="preview-grid-line line-three" />
    <i class="preview-candle candle-one" />
    <i class="preview-candle candle-two" />
    <i class="preview-candle candle-three" />
    <i class="preview-candle candle-four" />
    <i class="preview-candle candle-five" />
    <i class="preview-price-line" />
    <i class="preview-accent" />
  </span>
</template>
