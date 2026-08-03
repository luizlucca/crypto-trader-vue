<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import {
  peekIndicatorReadout,
  subscribeIndicatorReadout,
} from '@/services/indicatorReadout'

const props = defineProps<{
  instanceId: string
}>()

const element = shallowRef<HTMLElement | null>(null)
let unsubscribe: (() => void) | undefined

// Mirrors StreamLatencyText: the only node this component owns is written
// directly, so moving the cursor never schedules a render pass.
function write(text: string): void {
  if (element.value) {
    element.value.textContent = text
  }
}

function subscribe(): void {
  unsubscribe?.()
  write(peekIndicatorReadout(props.instanceId) ?? '')
  unsubscribe = subscribeIndicatorReadout(props.instanceId, write)
}

watch(() => props.instanceId, subscribe, { flush: 'post' })

onMounted(subscribe)
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <em ref="element" class="applied-indicator-readout" />
</template>
