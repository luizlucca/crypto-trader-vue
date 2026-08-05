<script setup lang="ts">
import { Plus, RotateCcw, Trash2 } from '@lucide/vue'
import { computed, shallowRef, watch } from 'vue'
import type {
  ChartDrawing,
  DrawingConfiguration,
  DrawingLevel,
} from '@/domain/chartDrawings'
import {
  DRAWING_DEFAULT_NEGATIVE_COLOR,
  DRAWING_DEFAULT_POSITIVE_COLOR,
  DRAWING_MAX_LEVELS,
  DRAWING_MAX_TEXT_LENGTH,
  defaultDrawingLevels,
  defaultDrawingText,
  drawingStyleCapabilities,
} from '@/domain/chartDrawings'
import type { TextAppearance } from '@/domain/textAppearance'
import {
  DEFAULT_TEXT_APPEARANCE,
  copyTextAppearance,
  normalizeTextAppearance,
  textFontFamilyStack,
} from '@/domain/textAppearance'
import TextAppearanceControls
  from '@/components/shared/TextAppearanceControls.vue'

const props = defineProps<{ drawing: ChartDrawing }>()

const emit = defineEmits<{
  apply: [configuration: DrawingConfiguration]
  close: []
}>()

const capabilities = computed(() => (
  drawingStyleCapabilities(props.drawing.tool)
))
const positiveColor = shallowRef(DRAWING_DEFAULT_POSITIVE_COLOR)
const negativeColor = shallowRef(DRAWING_DEFAULT_NEGATIVE_COLOR)
const text = shallowRef('')
const textAppearance = shallowRef<TextAppearance>(
  copyTextAppearance(DEFAULT_TEXT_APPEARANCE),
)
const levels = shallowRef<DrawingLevel[]>([])

function loadDrawing(): void {
  const configuration = props.drawing.configuration
  positiveColor.value = configuration?.positiveColor
    ?? DRAWING_DEFAULT_POSITIVE_COLOR
  negativeColor.value = configuration?.negativeColor
    ?? DRAWING_DEFAULT_NEGATIVE_COLOR
  text.value = configuration?.text ?? defaultDrawingText(props.drawing.tool)
  textAppearance.value = normalizeTextAppearance(
    configuration?.textAppearance ?? DEFAULT_TEXT_APPEARANCE,
  )
  levels.value = configuration?.levels?.map(copyLevel)
    ?? defaultDrawingLevels(props.drawing.tool)
}

function resetDefaults(): void {
  positiveColor.value = DRAWING_DEFAULT_POSITIVE_COLOR
  negativeColor.value = DRAWING_DEFAULT_NEGATIVE_COLOR
  text.value = defaultDrawingText(props.drawing.tool)
  textAppearance.value = copyTextAppearance(DEFAULT_TEXT_APPEARANCE)
  levels.value = defaultDrawingLevels(props.drawing.tool)
}

function updateLevelValue(index: number, event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  if (!Number.isFinite(value)) {
    return
  }
  replaceLevel(index, { ...levels.value[index], value })
}

function updateLevelColor(index: number, event: Event): void {
  replaceLevel(index, {
    ...levels.value[index],
    color: (event.currentTarget as HTMLInputElement).value,
  })
}

function replaceLevel(index: number, level: DrawingLevel): void {
  const next = [...levels.value]
  next[index] = level
  levels.value = next
}

function removeLevel(index: number): void {
  if (levels.value.length <= 1) {
    return
  }
  levels.value = levels.value.filter((_, current) => current !== index)
}

function addLevel(): void {
  if (levels.value.length >= DRAWING_MAX_LEVELS) {
    return
  }
  const previous = levels.value.at(-1)
  levels.value = [
    ...levels.value,
    {
      value: previous ? previous.value + 0.236 : 0,
      color: previous?.color ?? '#42A5F5',
    },
  ]
}

function applyConfiguration(): void {
  const configuration: DrawingConfiguration = {}
  if (capabilities.value.signedColors) {
    configuration.positiveColor = positiveColor.value
    configuration.negativeColor = negativeColor.value
  }
  if (capabilities.value.levels) {
    configuration.levels = levels.value.map(copyLevel)
  }
  if (capabilities.value.text) {
    configuration.text = text.value.slice(0, DRAWING_MAX_TEXT_LENGTH)
    configuration.textAppearance = copyTextAppearance(textAppearance.value)
  }
  emit('apply', configuration)
}

function copyLevel(level: DrawingLevel): DrawingLevel {
  return { value: level.value, color: level.color }
}

watch(
  () => props.drawing.id,
  loadDrawing,
  { immediate: true },
)
</script>

<template>
  <form class="drawing-properties" @submit.prevent="applyConfiguration">
    <header>
      <span>
        <strong>Configurações da ferramenta</strong>
        <small>Aplicadas somente ao confirmar</small>
      </span>
    </header>

    <section
      v-if="capabilities.signedColors"
      class="drawing-properties__section"
    >
      <div class="drawing-properties__heading">
        <strong>Cores por resultado</strong>
        <small>Valor ou percentual calculado</small>
      </div>
      <div class="drawing-properties__color-grid">
        <label>
          <span>Positivo ou zero</span>
          <i :style="{ '--drawing-color': positiveColor }" />
          <input
            v-model="positiveColor"
            type="color"
            aria-label="Cor para resultado positivo"
          >
          <code>{{ positiveColor.toUpperCase() }}</code>
        </label>
        <label>
          <span>Negativo</span>
          <i :style="{ '--drawing-color': negativeColor }" />
          <input
            v-model="negativeColor"
            type="color"
            aria-label="Cor para resultado negativo"
          >
          <code>{{ negativeColor.toUpperCase() }}</code>
        </label>
      </div>
    </section>

    <section v-if="capabilities.text" class="drawing-properties__section">
      <label class="drawing-properties__text">
        <span>
          <strong>Texto</strong>
          <small>{{ text.length }}/{{ DRAWING_MAX_TEXT_LENGTH }}</small>
        </span>
        <textarea
          v-model="text"
          :maxlength="DRAWING_MAX_TEXT_LENGTH"
          rows="3"
          autofocus
          placeholder="Digite a anotação"
          :style="{
            color: textAppearance.color,
            fontFamily: textFontFamilyStack(textAppearance.fontFamily),
            fontSize: `${textAppearance.fontSize}px`,
            fontStyle: textAppearance.fontStyle,
            fontWeight: textAppearance.fontWeight,
          }"
        />
      </label>
      <TextAppearanceControls v-model="textAppearance" />
    </section>

    <section v-if="capabilities.levels" class="drawing-properties__section">
      <div class="drawing-properties__heading">
        <strong>Níveis e cores</strong>
        <small>{{ levels.length }}/{{ DRAWING_MAX_LEVELS }}</small>
      </div>
      <div class="drawing-level-list">
        <div
          v-for="(level, index) in levels"
          :key="index"
          class="drawing-level-row"
        >
          <span>{{ index + 1 }}</span>
          <label>
            <span class="sr-only">Valor do nível {{ index + 1 }}</span>
            <input
              type="number"
              step="any"
              :value="level.value"
              @input="updateLevelValue(index, $event)"
            >
          </label>
          <label class="drawing-level-row__color">
            <span class="sr-only">Cor do nível {{ index + 1 }}</span>
            <i :style="{ '--drawing-color': level.color }" />
            <input
              type="color"
              :value="level.color"
              @input="updateLevelColor(index, $event)"
            >
          </label>
          <button
            type="button"
            :disabled="levels.length <= 1"
            :aria-label="`Remover nível ${level.value}`"
            title="Remover nível"
            @click="removeLevel(index)"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </div>
      <button
        class="drawing-properties__add"
        type="button"
        :disabled="levels.length >= DRAWING_MAX_LEVELS"
        @click="addLevel"
      >
        <Plus aria-hidden="true" />
        Adicionar nível
      </button>
    </section>

    <footer>
      <button
        class="drawing-properties__reset"
        type="button"
        @click="resetDefaults"
      >
        <RotateCcw aria-hidden="true" />
        Restaurar padrão
      </button>
      <span />
      <button type="button" @click="emit('close')">Cancelar</button>
      <button class="primary" type="submit">Aplicar</button>
    </footer>
  </form>
</template>
