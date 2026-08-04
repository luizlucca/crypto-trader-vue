<script setup lang="ts">
import {
  ArrowDownRight,
  ArrowUpRight,
  Circle,
  Eye,
  EyeOff,
  GitCommitHorizontal,
  Minus,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  Ruler,
  Spline,
  Square,
  Trash2,
  TrendingUp,
  Triangle,
  Waypoints,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { DrawingToolId } from '@/domain/chartDrawings'
import {
  DRAWING_TOOL_GROUPS,
  DRAWING_TOOL_LABELS,
} from '@/domain/chartDrawings'

defineProps<{
  activeTool: DrawingToolId | null
  drawingCount: number
  drawingsVisible: boolean
}>()

const emit = defineEmits<{
  select: [tool: DrawingToolId | null]
  clear: []
  'toggle-visibility': []
}>()

const icons: Record<DrawingToolId, Component> = {
  'trend-line': TrendingUp,
  'horizontal-line': Minus,
  'horizontal-ray': MoveHorizontal,
  'vertical-line': MoveVertical,
  'fib-retracement': Spline,
  'fib-extension': Waypoints,
  'parallel-channel': GitCommitHorizontal,
  'rectangle': Square,
  'circle': Circle,
  'triangle': Triangle,
  'long-position': ArrowUpRight,
  'short-position': ArrowDownRight,
  'measure': Ruler,
  'price-range': MoveVertical,
  'date-range': MoveHorizontal,
}
</script>

<template>
  <div class="drawing-toolbar" aria-label="Ferramentas de desenho">
    <div class="drawing-tools">
      <button
        :aria-pressed="activeTool === null"
        :class="{ active: activeTool === null }"
        aria-label="Cursor"
        title="Cursor (Esc)"
        type="button"
        @click="emit('select', null)"
      >
        <MousePointer2 aria-hidden="true" />
      </button>

      <template v-for="(group, index) in DRAWING_TOOL_GROUPS" :key="index">
        <hr>
        <button
          v-for="tool in group"
          :key="tool"
          :aria-label="DRAWING_TOOL_LABELS[tool]"
          :aria-pressed="activeTool === tool"
          :class="{ active: activeTool === tool }"
          :title="DRAWING_TOOL_LABELS[tool]"
          type="button"
          @click="emit('select', activeTool === tool ? null : tool)"
        >
          <component :is="icons[tool]" aria-hidden="true" />
        </button>
      </template>
    </div>

    <div class="drawing-actions">
      <button
        :aria-label="drawingsVisible ? 'Ocultar desenhos' : 'Mostrar desenhos'"
        :aria-pressed="!drawingsVisible"
        :class="{ active: !drawingsVisible }"
        :disabled="drawingCount === 0"
        :title="drawingsVisible ? 'Ocultar desenhos' : 'Mostrar desenhos'"
        type="button"
        @click="emit('toggle-visibility')"
      >
        <component :is="drawingsVisible ? Eye : EyeOff" aria-hidden="true" />
      </button>
      <button
        :disabled="drawingCount === 0"
        aria-label="Excluir todos os desenhos"
        class="drawing-clear"
        title="Excluir todos os desenhos"
        type="button"
        @click="emit('clear')"
      >
        <Trash2 aria-hidden="true" />
        <i v-if="drawingCount > 0">{{ drawingCount }}</i>
      </button>
    </div>
  </div>
</template>
