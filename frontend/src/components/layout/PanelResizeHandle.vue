<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: number
  min: number
  max: number
  defaultValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  commit: [value: number]
}>()

let pointerID: number | null = null
let startX = 0
let startWidth = 0
let pendingWidth = 0
let resizeFrame = 0

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, Math.round(value)))
}

function publishPendingWidth(): void {
  resizeFrame = 0
  emit('update:modelValue', pendingWidth)
}

function scheduleWidth(value: number): void {
  pendingWidth = clamp(value)
  if (!resizeFrame) {
    resizeFrame = requestAnimationFrame(publishPendingWidth)
  }
}

function beginResize(event: PointerEvent): void {
  if (event.button !== 0) {
    return
  }
  const handle = event.currentTarget as HTMLElement
  pointerID = event.pointerId
  startX = event.clientX
  startWidth = props.modelValue
  pendingWidth = props.modelValue
  handle.setPointerCapture(event.pointerId)
  document.body.classList.add('panel-resizing')
}

function continueResize(event: PointerEvent): void {
  if (pointerID !== event.pointerId) {
    return
  }
  scheduleWidth(startWidth + event.clientX - startX)
}

function endResize(event: PointerEvent): void {
  if (pointerID !== event.pointerId) {
    return
  }
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame)
    publishPendingWidth()
  }
  pointerID = null
  document.body.classList.remove('panel-resizing')
  emit('commit', pendingWidth)
}

function resizeWithKeyboard(event: KeyboardEvent): void {
  const increment = event.shiftKey ? 32 : 12
  let nextValue = props.modelValue
  switch (event.key) {
    case 'ArrowLeft':
      nextValue -= increment
      break
    case 'ArrowRight':
      nextValue += increment
      break
    case 'Home':
      nextValue = props.min
      break
    case 'End':
      nextValue = props.max
      break
    default:
      return
  }
  event.preventDefault()
  const clamped = clamp(nextValue)
  emit('update:modelValue', clamped)
  emit('commit', clamped)
}

function resetWidth(): void {
  const width = clamp(props.defaultValue)
  emit('update:modelValue', width)
  emit('commit', width)
}

onBeforeUnmount(() => {
  if (resizeFrame) {
    cancelAnimationFrame(resizeFrame)
  }
  document.body.classList.remove('panel-resizing')
})
</script>

<template>
  <button
    :aria-valuemax="max"
    :aria-valuemin="min"
    :aria-valuenow="modelValue"
    aria-label="Redimensionar painel de mercados"
    aria-orientation="vertical"
    class="panel-resize-handle"
    role="separator"
    title="Arraste para redimensionar · duplo clique para restaurar"
    type="button"
    @dblclick="resetWidth"
    @keydown="resizeWithKeyboard"
    @pointercancel="endResize"
    @pointerdown="beginResize"
    @pointermove="continueResize"
    @pointerup="endResize"
  >
    <span />
  </button>
</template>
