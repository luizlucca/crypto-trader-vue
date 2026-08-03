<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import type { IndicatorLegendPlot } from '@/domain/indicatorLegend'
import {
  peekIndicatorReadout,
  subscribeIndicatorReadout,
} from '@/services/indicatorReadout'

const props = defineProps<{
  instanceId: string
  plots: readonly IndicatorLegendPlot[]
}>()

const valueElements = new Map<string, HTMLElement>()
let unsubscribe: (() => void) | undefined

/** Direct DOM write: crosshair movement never enters Vue's render queue. */
function write(plotId: string, text: string): void {
  const element = valueElements.get(plotId)
  if (!element) {
    return
  }
  element.textContent = text
  element.parentElement?.toggleAttribute('hidden', text.length === 0)
}

function setValueElement(element: unknown, plotId: string): void {
  if (!(element instanceof HTMLElement)) {
    valueElements.delete(plotId)
    return
  }
  valueElements.set(plotId, element)
  write(
    plotId,
    peekIndicatorReadout(props.instanceId, plotId) ?? '',
  )
}

function subscribe(): void {
  unsubscribe?.()
  valueElements.forEach((_element, plotId) => write(plotId, ''))
  unsubscribe = subscribeIndicatorReadout(props.instanceId, write)
}

watch(() => props.instanceId, subscribe, { flush: 'post' })

onMounted(subscribe)
onBeforeUnmount(() => unsubscribe?.())
</script>

<template>
  <span class="applied-indicator-readout">
    <span
      v-for="plot in plots"
      :key="plot.plotId"
      class="applied-indicator-value"
      :style="{ '--indicator-plot-color': plot.color }"
      hidden
    >
      <i aria-hidden="true" />
      <span>{{ plot.title }}</span>
      <em
        :ref="(element) => setValueElement(element, plot.plotId)"
      />
    </span>
  </span>
</template>
