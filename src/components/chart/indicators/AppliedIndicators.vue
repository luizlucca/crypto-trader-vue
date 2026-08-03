<script setup lang="ts">
import { Settings2, X } from '@lucide/vue'
import type { AppliedIndicator } from '@/domain/indicators'
import { instanceLabel } from '@/domain/indicators'
import IndicatorReadout from './IndicatorReadout.vue'

defineProps<{
  applied: readonly AppliedIndicator[]
}>()

defineEmits<{
  configure: [instanceId: string]
  remove: [instanceId: string]
}>()

function swatchColor(entry: AppliedIndicator): string {
  const firstPlotId = entry.definition.plots[0]?.id
  return (firstPlotId ? entry.instance.styles[firstPlotId]?.color : undefined)
    ?? 'var(--blue)'
}
</script>

<template>
  <div v-if="applied.length" class="applied-indicators">
    <div
      v-for="entry in applied"
      :key="entry.instance.instanceId"
      class="applied-indicator"
    >
      <span
        class="applied-indicator-swatch"
        :style="{ background: swatchColor(entry) }"
      />
      <strong>
        {{ instanceLabel(entry.definition, entry.instance.inputs) }}
      </strong>
      <IndicatorReadout :instance-id="entry.instance.instanceId" />
      <button
        :aria-label="`Parâmetros de ${entry.definition.name}`"
        title="Parâmetros"
        type="button"
        @click="$emit('configure', entry.instance.instanceId)"
      >
        <Settings2 aria-hidden="true" />
      </button>
      <button
        :aria-label="`Remover ${entry.definition.name}`"
        title="Remover"
        type="button"
        @click="$emit('remove', entry.instance.instanceId)"
      >
        <X aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
