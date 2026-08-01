<script setup lang="ts">
import { Settings2, X } from '@lucide/vue'
import type {
  IndicatorDefinition,
  IndicatorInstance,
} from '@/domain/indicators'
import { instanceLabel } from '@/domain/indicators'

defineProps<{
  applied: readonly { instance: IndicatorInstance, definition: IndicatorDefinition }[]
}>()

defineEmits<{
  configure: [instanceId: string]
  remove: [instanceId: string]
}>()
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
        :style="{ background: entry.definition.plots[0]?.color ?? 'var(--blue)' }"
      />
      <strong>{{ instanceLabel(entry.definition, entry.instance.inputs) }}</strong>
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
