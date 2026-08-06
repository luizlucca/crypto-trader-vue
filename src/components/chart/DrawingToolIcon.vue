<script setup lang="ts">
import { computed } from 'vue'
import type { DrawingToolId } from '@/domain/chartDrawings'
import { DRAWING_TOOL_ICONS } from './drawingToolIcons'

const props = defineProps<{ tool: DrawingToolId }>()
const icon = computed(() => DRAWING_TOOL_ICONS[props.tool])
</script>

<template>
  <svg
    class="drawing-tool-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path
      v-for="path in icon.paths"
      :key="`path-${path}`"
      :d="path"
    />
    <line
      v-for="([x1, y1, x2, y2], index) in icon.lines"
      :key="`line-${index}-${x1}-${y1}-${x2}-${y2}`"
      :x1="x1"
      :y1="y1"
      :x2="x2"
      :y2="y2"
    />
    <polyline
      v-for="points in icon.polylines"
      :key="`polyline-${points}`"
      :points="points"
    />
    <rect
      v-for="([x, y, width, height, radius], index) in icon.rects"
      :key="`rect-${index}-${x}-${y}-${width}-${height}`"
      :x="x"
      :y="y"
      :width="width"
      :height="height"
      :rx="radius ?? 0"
    />
    <ellipse
      v-for="([cx, cy, rx, ry], index) in icon.ellipses"
      :key="`ellipse-${index}-${cx}-${cy}-${rx}-${ry}`"
      :cx="cx"
      :cy="cy"
      :rx="rx"
      :ry="ry"
    />
    <circle
      v-for="([cx, cy, radius], index) in icon.circles"
      :key="`circle-${index}-${cx}-${cy}-${radius}`"
      :cx="cx"
      :cy="cy"
      :r="radius"
    />
  </svg>
</template>
