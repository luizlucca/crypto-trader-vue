<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { subscribeStreamLatency } from '@/services/streamLatency'

const props = defineProps<{
  sessionId: string
}>()

const element = shallowRef<HTMLElement | null>(null)
let unsubscribe: (() => void) | undefined

// Mirrors RealtimePriceText: the only node this component owns is written
// directly, so a latency sample never schedules a render pass.
function writeLatency(milliseconds: number): void {
  if (element.value) {
    element.value.textContent = `${milliseconds}ms`
  }
}

function subscribe(): void {
  unsubscribe?.()
  if (element.value) {
    element.value.textContent = '—'
  }
  unsubscribe = subscribeStreamLatency(props.sessionId, writeLatency)
}

watch(() => props.sessionId, subscribe, { flush: 'post' })

onMounted(subscribe)
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <b ref="element">—</b>
</template>
