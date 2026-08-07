<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue'
import { Ellipsis, Settings2, X } from '@lucide/vue'
import {
  indicatorLegendPlots,
  type IndicatorLegendPlot,
  type PresentedIndicator,
} from '@indicators/domain/indicatorLegend'
import { instanceLabel } from '@indicators/domain/indicators'
import IndicatorReadout from './IndicatorReadout.vue'

const props = defineProps<{
  applied: readonly PresentedIndicator[]
  activeInstanceId?: string
}>()

const emit = defineEmits<{
  configure: [instanceId: string]
  preview: [instanceId: string]
  remove: [instanceId: string]
}>()

const hoveredChipId = shallowRef<string>()
const dock = shallowRef<HTMLElement | null>(null)
const overflowMenuOpen = shallowRef(false)

const MAX_VISIBLE_INDICATORS = 6

const visibleApplied = computed(() => (
  props.applied.slice(0, MAX_VISIBLE_INDICATORS)
))

const overflowApplied = computed(() => (
  props.applied.slice(MAX_VISIBLE_INDICATORS)
))

/** Built only when indicators or their configured styles change. */
const legendPlots = computed(() => {
  const byInstance = new Map<string, IndicatorLegendPlot[]>()
  for (const entry of props.applied) {
    byInstance.set(
      entry.instance.instanceId,
      indicatorLegendPlots(entry),
    )
  }
  return byInstance
})

const displayedEntry = computed(() => {
  const instanceId = hoveredChipId.value ?? props.activeInstanceId
  if (!instanceId) {
    return undefined
  }
  return props.applied.find(
    (entry) => entry.instance.instanceId === instanceId,
  )
})

const displayedPlots = computed(() => {
  const entry = displayedEntry.value
  return entry ? plotsFor(entry) : []
})

const displayedRow = computed(() => {
  const instanceId = displayedEntry.value?.instance.instanceId
  if (!instanceId) {
    return 0
  }
  const index = visibleApplied.value.findIndex(
    (entry) => entry.instance.instanceId === instanceId,
  )
  return index >= 0 ? index : visibleApplied.value.length
})

const contextStyle = computed<Record<string, string>>(() => ({
  '--indicator-context-row': String(displayedRow.value),
}))

const contextAriaLabel = computed(() => {
  const entry = displayedEntry.value
  return entry ? `Valores de ${fullLabel(entry)}` : undefined
})

const isContextVisible = computed(() => (
  displayedPlots.value.length > 0 && !overflowMenuOpen.value
))

function preview(instanceId: string): void {
  hoveredChipId.value = instanceId
  emit('preview', instanceId)
}

function stopPreview(instanceId: string): void {
  if (hoveredChipId.value === instanceId) {
    hoveredChipId.value = undefined
  }
}

function fullLabel(entry: PresentedIndicator): string {
  return instanceLabel(entry.definition, entry.instance.inputs)
}

function isDisplayedIndicator(entry: PresentedIndicator): boolean {
  return displayedEntry.value?.instance.instanceId
    === entry.instance.instanceId
}

/** Keeps multi-purpose indicators such as SMA compact in the chart HUD. */
function compactLabel(entry: PresentedIndicator): string {
  const label = fullLabel(entry)
  const suffix = label.slice(entry.definition.shortName.length).trim()
  const parameters = suffix ? suffix.split(/\s+/) : []
  if (parameters.length <= 3) {
    return label
  }
  return `${entry.definition.shortName} ${parameters[0]}`
}

function toggleOverflowMenu(): void {
  overflowMenuOpen.value = !overflowMenuOpen.value
}

function configureIndicator(instanceId: string): void {
  overflowMenuOpen.value = false
  emit('configure', instanceId)
}

function removeIndicator(instanceId: string): void {
  overflowMenuOpen.value = false
  emit('remove', instanceId)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (
    overflowMenuOpen.value
    && event.target instanceof Node
    && !dock.value?.contains(event.target)
  ) {
    overflowMenuOpen.value = false
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    overflowMenuOpen.value = false
  }
}

function plotsFor(entry: PresentedIndicator): readonly IndicatorLegendPlot[] {
  return legendPlots.value.get(entry.instance.instanceId) ?? []
}

function swatchColor(entry: PresentedIndicator): string {
  const legendColor = plotsFor(entry)[0]?.color
  if (legendColor) {
    return legendColor
  }
  const firstPlotId = entry.definition.plots[0]?.id
  return (firstPlotId ? entry.instance.styles[firstPlotId]?.color : undefined)
    ?? 'var(--blue)'
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div
    v-if="applied.length"
    ref="dock"
    class="applied-indicators"
    aria-label="Indicadores aplicados"
  >
    <div class="applied-indicator-dock">
      <div
        v-for="entry in visibleApplied"
        :key="entry.instance.instanceId"
        class="applied-indicator"
        :class="{ active: isDisplayedIndicator(entry) }"
        :title="fullLabel(entry)"
        @pointerenter="preview(entry.instance.instanceId)"
        @pointerleave="stopPreview(entry.instance.instanceId)"
      >
        <span class="applied-indicator-swatches" aria-hidden="true">
          <i
            v-for="plot in plotsFor(entry)"
            :key="plot.plotId"
            :style="{ background: plot.color }"
          />
          <i
            v-if="plotsFor(entry).length === 0"
            :style="{ background: swatchColor(entry) }"
          />
        </span>
        <strong>
          {{ compactLabel(entry) }}
        </strong>
        <button
          :aria-label="`Parâmetros de ${entry.definition.name}`"
          title="Parâmetros"
          type="button"
          @click="configureIndicator(entry.instance.instanceId)"
        >
          <Settings2 aria-hidden="true" />
        </button>
        <button
          :aria-label="`Remover ${entry.definition.name}`"
          title="Remover"
          type="button"
          @click="removeIndicator(entry.instance.instanceId)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="overflowApplied.length"
        class="applied-indicator-overflow-toggle"
        type="button"
        :aria-expanded="overflowMenuOpen"
        :aria-label="`Mostrar mais ${overflowApplied.length} indicadores`"
        :title="`${overflowApplied.length} indicadores adicionais`"
        @click="toggleOverflowMenu"
      >
        <Ellipsis aria-hidden="true" />
        <span>+{{ overflowApplied.length }}</span>
      </button>
    </div>

    <div
      v-if="overflowMenuOpen && overflowApplied.length"
      class="applied-indicator-overflow-menu"
      role="menu"
      aria-label="Indicadores adicionais"
    >
      <div
        v-for="entry in overflowApplied"
        :key="entry.instance.instanceId"
        class="applied-indicator-overflow-row"
      >
        <span class="applied-indicator-swatches" aria-hidden="true">
          <i
            v-for="plot in plotsFor(entry)"
            :key="plot.plotId"
            :style="{ background: plot.color }"
          />
          <i
            v-if="plotsFor(entry).length === 0"
            :style="{ background: swatchColor(entry) }"
          />
        </span>
        <strong :title="fullLabel(entry)">
          {{ fullLabel(entry) }}
        </strong>
        <button
          role="menuitem"
          type="button"
          :aria-label="`Parâmetros de ${entry.definition.name}`"
          title="Parâmetros"
          @click="configureIndicator(entry.instance.instanceId)"
        >
          <Settings2 aria-hidden="true" />
        </button>
        <button
          role="menuitem"
          type="button"
          :aria-label="`Remover ${entry.definition.name}`"
          title="Remover"
          @click="removeIndicator(entry.instance.instanceId)"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      class="applied-indicator-context"
      :style="contextStyle"
      role="group"
      :aria-label="contextAriaLabel"
      :class="{ visible: isContextVisible }"
    >
      <IndicatorReadout
        v-if="displayedEntry"
        :key="displayedEntry.instance.instanceId"
        :instance-id="displayedEntry.instance.instanceId"
        :plots="displayedPlots"
      />
    </div>
  </div>
</template>
