<script setup lang="ts">
import { Trash2, X } from '@lucide/vue'
import type { ChartDrawing } from '@/domain/chartDrawings'
import {
  DRAWING_COLORS,
  DRAWING_LINE_WIDTHS,
  DRAWING_TOOL_LABELS,
} from '@/domain/chartDrawings'

defineProps<{ drawing: ChartDrawing }>()

const emit = defineEmits<{
  restyle: [style: { color?: string, lineWidth?: number }]
  remove: []
  close: []
}>()

/*
 * The palette and the widths come from the domain, not from here. A new
 * drawing, one read back from storage and the swatch painted as active all
 * have to agree; a copy in the toolbar would drift, and the only symptom
 * would be a style bar highlighting nothing.
 */
const colors = DRAWING_COLORS
const widths = DRAWING_LINE_WIDTHS
</script>

<template>
  <div class="drawing-style" role="toolbar" :aria-label="`Estilo do desenho: ${DRAWING_TOOL_LABELS[drawing.tool]}`">
    <strong>{{ DRAWING_TOOL_LABELS[drawing.tool] }}</strong>

    <span class="drawing-style-sep" />

    <button
      v-for="color in colors"
      :key="color"
      :aria-label="`Cor ${color}`"
      :aria-pressed="drawing.color.toLowerCase() === color.toLowerCase()"
      :class="{ active: drawing.color.toLowerCase() === color.toLowerCase() }"
      :style="{ '--swatch': color }"
      class="drawing-swatch"
      type="button"
      @click="emit('restyle', { color })"
    />

    <span class="drawing-style-sep" />

    <button
      v-for="width in widths"
      :key="width"
      :aria-label="`Espessura ${width}`"
      :aria-pressed="drawing.lineWidth === width"
      :class="{ active: drawing.lineWidth === width }"
      class="drawing-width"
      type="button"
      @click="emit('restyle', { lineWidth: width })"
    >
      <i :style="{ height: `${width}px` }" />
    </button>

    <span class="drawing-style-sep" />

    <button
      aria-label="Excluir desenho"
      title="Excluir desenho (Delete)"
      type="button"
      @click="emit('remove')"
    >
      <Trash2 aria-hidden="true" />
    </button>
    <button
      aria-label="Fechar"
      title="Fechar (Esc)"
      type="button"
      @click="emit('close')"
    >
      <X aria-hidden="true" />
    </button>
  </div>
</template>
