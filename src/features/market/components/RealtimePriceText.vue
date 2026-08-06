<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { subscribeRealtimePrice } from '@market/services/realtimePrice'
import { formatMarketPrice } from '@market/services/numberFormat'
import type { Market } from '@shared/types/market'

const props = defineProps<{
  provider: string
  market: Market
  symbol: string
  precision: number
  fallback: number
}>()

const element = ref<HTMLElement | null>(null)
let unsubscribe: (() => void) | undefined

function writePrice(value: number): void {
  if (element.value) {
    element.value.textContent = formatMarketPrice(value, props.precision)
  }
}

function subscribe(): void {
  unsubscribe?.()
  unsubscribe = subscribeRealtimePrice(
    props.provider,
    props.market,
    props.symbol,
    writePrice,
  )
}

watch(
  () => [
    props.provider,
    props.market,
    props.symbol,
    props.precision,
    props.fallback,
  ] as const,
  () => {
    writePrice(props.fallback)
    subscribe()
  },
  { flush: 'post' },
)

onMounted(() => {
  writePrice(props.fallback)
  subscribe()
})

onBeforeUnmount(() => {
  unsubscribe?.()
})
</script>

<template>
  <span ref="element" class="realtime-price">
    {{ formatMarketPrice(fallback, precision) }}
  </span>
</template>
