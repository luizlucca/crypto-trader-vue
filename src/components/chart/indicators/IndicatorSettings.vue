<script setup lang="ts">
import { GripHorizontal, X } from '@lucide/vue'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type {
  IndicatorDefinition,
  IndicatorInputSpec,
  IndicatorInputs,
  IndicatorPlotStyle,
} from '@/domain/indicators'
import {
  coerceInput,
  resolveInputs,
  resolvePlotStyles,
} from '@/domain/indicators'
import { useDraggableDialog } from '@/composables/useDraggableDialog'

const props = defineProps<{
  definition: IndicatorDefinition
  inputs: IndicatorInputs
  styles: Record<string, IndicatorPlotStyle>
  /** Plot ids that produced data; the others are not offered for styling. */
  populatedPlots: readonly string[]
}>()

const emit = defineEmits<{
  close: []
  apply: [inputs: IndicatorInputs]
  styles: [styles: Record<string, IndicatorPlotStyle>]
}>()

const { panel, startDrag, center } = useDraggableDialog()

type Tab = 'inputs' | 'style'
const tab = ref<Tab>('inputs')

/** Drafts, so a half-typed value never reaches the chart. */
const draft = ref<IndicatorInputs>({ ...props.inputs })
const styleDraft = ref<Record<string, IndicatorPlotStyle>>(
  resolvePlotStyles(props.definition, props.styles),
)

/**
 * Only lines that actually drew something. Several indicators declare plots
 * that stay empty under the current parameters.
 */
const stylablePlots = computed(() => {
  const populated = new Set(props.populatedPlots)
  const drawn = props.definition.plots.filter((plot) => populated.has(plot.id))
  return drawn.length > 0 ? drawn : props.definition.plots
})

watch(() => props.inputs, (next) => {
  draft.value = { ...next }
})
watch(() => props.styles, (next) => {
  styleDraft.value = resolvePlotStyles(props.definition, next)
})

function write(spec: IndicatorInputSpec, value: unknown): void {
  draft.value = { ...draft.value, [spec.id]: coerceInput(spec, value) }
}

function fromEvent(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

/** Appearance is applied live: there is nothing to recalculate. */
function writeStyle(
  plotId: string,
  patch: Partial<IndicatorPlotStyle>,
): void {
  styleDraft.value = {
    ...styleDraft.value,
    [plotId]: { ...styleDraft.value[plotId], ...patch },
  }
  emit('styles', styleDraft.value)
}

function reset(): void {
  if (tab.value === 'inputs') {
    draft.value = resolveInputs(props.definition)
    return
  }
  styleDraft.value = resolvePlotStyles(props.definition)
  emit('styles', styleDraft.value)
}

function apply(): void {
  emit('apply', { ...draft.value })
  emit('close')
}

onMounted(() => {
  void nextTick(center)
})
</script>

<template>
  <!--
    Teleported to the body: a `position: fixed` panel is positioned against the
    nearest ancestor that establishes a containing block, and the chart panels
    use `contain` for paint isolation. Rendering in place put the dialog at an
    arbitrary offset instead of the viewport centre.
  -->
  <Teleport to="body">
    <section
      ref="panel"
      :aria-label="`Configurar ${definition.name}`"
      class="indicator-settings"
      role="dialog"
      @keydown.esc.prevent="emit('close')"
    >
      <header
        class="indicator-settings-header"
        title="Arraste para mover"
        @pointerdown="startDrag"
      >
        <GripHorizontal aria-hidden="true" class="indicator-drag-grip" />
        <div>
          <span>INDICADOR</span>
          <h3>{{ definition.name }}</h3>
        </div>
        <button
          aria-label="Fechar"
          title="Fechar (Esc)"
          type="button"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </header>

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
        <label
          v-for="spec in definition.inputs"
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

      <!-- One block per plotted line: an indicator can draw several. -->
      <div v-else class="indicator-styles">
        <article
          v-for="plot in stylablePlots"
          :key="plot.id"
          class="indicator-style-row"
        >
          <header>
            <label class="indicator-style-visible">
              <input
                :checked="styleDraft[plot.id]?.visible"
                type="checkbox"
                @change="writeStyle(plot.id, {
                  visible: ($event.target as HTMLInputElement).checked,
                })"
              >
              <strong>{{ plot.title || plot.id }}</strong>
            </label>
            <input
              :value="styleDraft[plot.id]?.color"
              aria-label="Cor da linha"
              type="color"
              @input="writeStyle(plot.id, { color: fromEvent($event) })"
            >
          </header>
          <div class="indicator-style-controls">
            <label>
              <span>Espessura</span>
              <select
                :value="styleDraft[plot.id]?.lineWidth"
                @change="writeStyle(plot.id, {
                  lineWidth: Number(fromEvent($event)),
                })"
              >
                <option v-for="width in [1, 2, 3, 4]" :key="width" :value="width">
                  {{ width }}px
                </option>
              </select>
            </label>
            <label>
              <span>Opacidade</span>
              <input
                :value="styleDraft[plot.id]?.opacity"
                max="1"
                min="0.1"
                step="0.05"
                type="range"
                @input="writeStyle(plot.id, {
                  opacity: Number(fromEvent($event)),
                })"
              >
              <b>{{ Math.round((styleDraft[plot.id]?.opacity ?? 1) * 100) }}%</b>
            </label>
          </div>
        </article>
      </div>

      <footer>
        <button class="text-action" type="button" @click="reset">
          Restaurar padrões
        </button>
        <button class="indicator-apply" type="button" @click="apply">
          Aplicar
        </button>
      </footer>
    </section>
  </Teleport>
</template>
