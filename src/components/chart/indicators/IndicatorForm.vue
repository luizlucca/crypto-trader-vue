<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  IndicatorDefinition,
  IndicatorInputSpec,
  IndicatorInputs,
  IndicatorPlotStyle,
} from '@/domain/indicators'
import {
  coerceInput,
  groupIndicatorInputs,
  resolveInputs,
  resolvePlotStyles,
} from '@/domain/indicators'

/**
 * The parameter and appearance editor, with no window chrome of its own.
 *
 * Two hosts use it: the accordion inside the picker, while an indicator is
 * being previewed, and the floating dialog, for one already applied. Keeping
 * the fields in one place means the six input types are mapped once.
 */
const props = defineProps<{
  definition: IndicatorDefinition
  inputs: IndicatorInputs
  styles: Record<string, IndicatorPlotStyle>
  /** Plot ids that produced data; the others are not offered for styling. */
  populatedPlots: readonly string[]
  /** True once the first calculation returned, so "nothing" means nothing. */
  calculated: boolean
}>()

const emit = defineEmits<{
  /** Parameters changed; recalculating is the host's decision. */
  inputs: [inputs: IndicatorInputs]
  /** Appearance changed; applied live, nothing to recalculate. */
  styles: [styles: Record<string, IndicatorPlotStyle>]
}>()

type Tab = 'inputs' | 'style'
const tab = ref<Tab>('inputs')

const draft = ref<IndicatorInputs>({ ...props.inputs })
const styleDraft = ref<Record<string, IndicatorPlotStyle>>(
  resolvePlotStyles(props.definition, props.styles),
)

/**
 * Every declared line, always — the list must not change under the user.
 *
 * Filtering by "has data" made it unstable: on open the calculation has not
 * returned yet, so all four SMA lines showed; once it did, three of them
 * disappeared because `maType: None` leaves them empty. Which lines produce
 * data also depends on the parameters, so the list would shift again on every
 * edit.
 *
 * Lines without data are listed and marked instead. That keeps the panel
 * stable and lets the user pick a colour for a line before enabling the
 * parameter that turns it on.
 */
const stylablePlots = computed(() => props.definition.plots)

const populated = computed(() => new Set(props.populatedPlots))

/**
 * Roughly a fifth of the catalog draws nothing with its default parameters —
 * some express themselves only through fills we do not render, others need a
 * parameter turned on. Saying so beats a silent no-op on a chart people trade
 * from.
 */
const drawsNothing = computed(
  () => props.calculated && populated.value.size === 0,
)

/**
 * The catalog lists parameters in calculation order, interleaving numbers and
 * dropdowns. Grouping by family keeps related controls together.
 */
const inputGroups = computed(() => groupIndicatorInputs(props.definition.inputs))

watch(() => props.inputs, (next) => {
  draft.value = { ...next }
})
watch(() => props.styles, (next) => {
  styleDraft.value = resolvePlotStyles(props.definition, next)
})

function fromEvent(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function write(spec: IndicatorInputSpec, value: unknown): void {
  draft.value = { ...draft.value, [spec.id]: coerceInput(spec, value) }
  emit('inputs', { ...draft.value })
}

function writeStyle(plotId: string, patch: Partial<IndicatorPlotStyle>): void {
  styleDraft.value = {
    ...styleDraft.value,
    [plotId]: { ...styleDraft.value[plotId], ...patch },
  }
  emit('styles', styleDraft.value)
}

function reset(): void {
  if (tab.value === 'inputs') {
    draft.value = resolveInputs(props.definition)
    emit('inputs', { ...draft.value })
    return
  }
  styleDraft.value = resolvePlotStyles(props.definition)
  emit('styles', styleDraft.value)
}

defineExpose({ reset })
</script>

<template>
  <div class="indicator-form">
    <nav class="indicator-tabs" aria-label="Seções">
      <button
        :class="{ active: tab === 'inputs' }"
        type="button"
        @click="tab = 'inputs'"
      >
        Parâmetros
      </button>
      <button
        :class="{ active: tab === 'style' }"
        type="button"
        @click="tab = 'style'"
      >
        Estilo
      </button>
    </nav>

    <!--
      One control per input type. The catalog uses exactly six types, so this
      list is complete: no indicator needs a screen of its own.
    -->
    <div v-if="tab === 'inputs'" class="indicator-fields">
      <p v-if="definition.inputs.length === 0" class="indicator-no-inputs">
        Este indicador não possui parâmetros configuráveis.
      </p>
      <template v-for="group in inputGroups" :key="group.kind">
        <!-- A single group needs no heading: it is the whole form. -->
        <h4 v-if="inputGroups.length > 1" class="indicator-group-title">
          {{ group.label }}
        </h4>
        <div class="indicator-group-fields">
          <label
            v-for="spec in group.inputs"
            :key="spec.id"
            class="indicator-field"
          >
            <span>{{ spec.title }}</span>

            <input
              v-if="spec.type === 'int' || spec.type === 'float'"
              :max="spec.max"
              :min="spec.min"
              :step="spec.type === 'int' ? 1 : 'any'"
              :value="draft[spec.id]"
              type="number"
              @change="write(spec, fromEvent($event))"
            >
            <input
              v-else-if="spec.type === 'bool'"
              :checked="Boolean(draft[spec.id])"
              type="checkbox"
              @change="write(spec, ($event.target as HTMLInputElement).checked)"
            >
            <input
              v-else-if="spec.type === 'color'"
              :value="draft[spec.id]"
              type="color"
              @change="write(spec, fromEvent($event))"
            >
            <select
              v-else-if="spec.options?.length"
              :value="draft[spec.id]"
              @change="write(spec, fromEvent($event))"
            >
              <option v-for="option in spec.options" :key="option" :value="option">
                {{ option }}
              </option>
            </select>
            <select
              v-else-if="spec.type === 'source'"
              :value="draft[spec.id]"
              @change="write(spec, fromEvent($event))"
            >
              <option
                v-for="option in ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4']"
                :key="option"
                :value="option"
              >
                {{ option }}
              </option>
            </select>
            <input
              v-else
              :value="draft[spec.id]"
              type="text"
              @change="write(spec, fromEvent($event))"
            >
          </label>
        </div>
      </template>
    </div>

    <p v-if="drawsNothing" class="indicator-draws-nothing">
      Este indicador não desenhou nada com os parâmetros atuais. Alguns
      dependem de um parâmetro ativado; outros usam recursos visuais ainda não
      suportados.
    </p>

    <!-- One row per plotted line: an indicator can draw several. -->
    <div v-else class="indicator-styles">
      <header class="indicator-styles-legend">
        <span />
        <span />
        <span>Linha</span>
        <span>Espessura</span>
        <span>Opacidade</span>
      </header>
      <article
        v-for="plot in stylablePlots"
        :key="plot.id"
        :class="{
          hidden: !styleDraft[plot.id]?.visible,
          idle: !populated.has(plot.id),
        }"
        class="indicator-style-row"
      >
        <label
          class="indicator-style-toggle"
          :title="styleDraft[plot.id]?.visible ? 'Ocultar linha' : 'Mostrar linha'"
        >
          <input
            :checked="styleDraft[plot.id]?.visible"
            type="checkbox"
            @change="writeStyle(plot.id, {
              visible: ($event.target as HTMLInputElement).checked,
            })"
          >
        </label>

        <input
          :aria-label="`Cor de ${plot.title || plot.id}`"
          :value="styleDraft[plot.id]?.color"
          class="indicator-style-swatch"
          type="color"
          @input="writeStyle(plot.id, { color: fromEvent($event) })"
        >

        <strong class="indicator-style-name">
          <span :title="plot.title || plot.id">{{ plot.title || plot.id }}</span>
          <em
            v-if="!populated.has(plot.id)"
            title="Não produz valores com os parâmetros atuais"
          >inativa</em>
        </strong>

        <select
          :value="styleDraft[plot.id]?.lineWidth"
          :aria-label="`Espessura de ${plot.title || plot.id}`"
          class="indicator-style-width"
          title="Espessura"
          @change="writeStyle(plot.id, { lineWidth: Number(fromEvent($event)) })"
        >
          <option v-for="width in [1, 2, 3, 4]" :key="width" :value="width">
            {{ width }} px
          </option>
        </select>

        <span class="indicator-style-opacity" title="Opacidade">
          <input
            :aria-label="`Opacidade de ${plot.title || plot.id}`"
            :value="styleDraft[plot.id]?.opacity"
            max="1"
            min="0.1"
            step="0.05"
            type="range"
            @input="writeStyle(plot.id, { opacity: Number(fromEvent($event)) })"
          >
          <b>{{ Math.round((styleDraft[plot.id]?.opacity ?? 1) * 100) }}%</b>
        </span>
      </article>
    </div>
  </div>
</template>
