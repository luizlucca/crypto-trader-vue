<script setup lang="ts">
import { computed } from 'vue'
import { cryptoIconRegistry } from './cryptoIconRegistry'

const props = withDefaults(defineProps<{
  symbol: string
  size?: number
}>(), {
  size: 20,
})

const normalizedSymbol = computed(() => props.symbol.trim().toUpperCase())
const iconMarkup = computed(() => cryptoIconRegistry[normalizedSymbol.value])
const fallback = computed(() => normalizedSymbol.value.slice(0, 2) || '?')
const dimensions = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))
</script>

<template>
  <span
    aria-hidden="true"
    :class="{ fallback: !iconMarkup }"
    :style="dimensions"
    class="crypto-asset-icon"
  >
    <!-- SVGs are static, trusted build-time assets from @web3icons/core. -->
    <span v-if="iconMarkup" v-html="iconMarkup" />
    <span v-else>{{ fallback }}</span>
  </span>
</template>
