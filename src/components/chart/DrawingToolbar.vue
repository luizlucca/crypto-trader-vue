<script setup lang="ts">
import {
  Check,
  Crosshair,
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  Trash2,
} from '@lucide/vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useId,
} from 'vue'
import type {
  DrawingToolGroup,
  DrawingToolGroupId,
  DrawingToolId,
} from '@/domain/chartDrawings'
import DrawingToolIcon from './DrawingToolIcon.vue'
import {
  DRAWING_TOOL_GROUPS,
  DRAWING_TOOL_LABELS,
} from '@/domain/chartDrawings'

const props = defineProps<{
  activeTool: DrawingToolId | null
  drawingCount: number
  drawingsLocked: boolean
  drawingsVisible: boolean
}>()

const emit = defineEmits<{
  select: [tool: DrawingToolId | null]
  clear: []
  'toggle-lock': []
  'toggle-visibility': []
}>()

const componentId = useId()
const MENU_NAVIGATION_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'Home',
  'End',
])

const toolbar = shallowRef<HTMLElement | null>(null)
const menu = shallowRef<HTMLElement | null>(null)
const openGroupId = shallowRef<DrawingToolGroupId | null>(null)
const menuTop = shallowRef(0)
const rememberedTools = shallowRef(initialToolsByGroup())

const openGroup = computed(() => (
  DRAWING_TOOL_GROUPS.find((group) => group.id === openGroupId.value) ?? null
))

const menuStyle = computed<Record<string, string>>(() => ({
  top: `${menuTop.value}px`,
}))

const lockLabel = computed(() => (
  props.drawingsLocked ? 'Desbloquear desenhos' : 'Bloquear desenhos'
))

const visibilityLabel = computed(() => (
  props.drawingsVisible ? 'Ocultar desenhos' : 'Mostrar desenhos'
))

function initialToolsByGroup(): Record<DrawingToolGroupId, DrawingToolId> {
  const tools = {} as Record<DrawingToolGroupId, DrawingToolId>
  for (const group of DRAWING_TOOL_GROUPS) {
    tools[group.id] = group.tools[0]
  }
  return tools
}

function representativeTool(group: DrawingToolGroup): DrawingToolId {
  if (props.activeTool && group.tools.includes(props.activeTool)) {
    return props.activeTool
  }
  return rememberedTools.value[group.id]
}

function isGroupActive(group: DrawingToolGroup): boolean {
  return props.activeTool !== null && group.tools.includes(props.activeTool)
}

function groupTriggerId(groupId: DrawingToolGroupId): string {
  return `${componentId}-drawing-group-${groupId}`
}

function groupMenuId(groupId: DrawingToolGroupId): string {
  return `${componentId}-drawing-menu-${groupId}`
}

function listenForMenuDismiss(): void {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
}

function closeMenu(): void {
  openGroupId.value = null
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
}

async function toggleGroup(
  group: DrawingToolGroup,
  event: MouseEvent,
): Promise<void> {
  if (openGroupId.value === group.id) {
    closeMenu()
    return
  }
  const trigger = event.currentTarget
  const root = toolbar.value
  if (!(trigger instanceof HTMLElement) || !root) {
    return
  }
  const triggerRect = trigger.getBoundingClientRect()
  const toolbarRect = root.getBoundingClientRect()
  menuTop.value = triggerRect.top - toolbarRect.top
  openGroupId.value = group.id
  listenForMenuDismiss()
  await nextTick()
  const menuElement = menu.value
  if (!menuElement) {
    return
  }
  const highestTop = Math.max(
    6,
    root.clientHeight - menuElement.offsetHeight - 6,
  )
  menuTop.value = Math.min(menuTop.value, highestTop)
  const active = menuElement.querySelector<HTMLButtonElement>(
    '[aria-checked="true"]',
  )
  const first = menuElement.querySelector<HTMLButtonElement>(
    '[role="menuitemradio"]',
  )
  const focusTarget = active ?? first
  focusTarget?.focus()
}

function selectTool(groupId: DrawingToolGroupId, tool: DrawingToolId): void {
  rememberedTools.value = {
    ...rememberedTools.value,
    [groupId]: tool,
  }
  closeMenu()
  emit('select', tool)
}

function activateGroup(group: DrawingToolGroup): void {
  closeMenu()
  const tool = representativeTool(group)
  emit('select', props.activeTool === tool ? null : tool)
}

function selectCursor(): void {
  closeMenu()
  emit('select', null)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (
    openGroupId.value
    && event.target instanceof Node
    && !toolbar.value?.contains(event.target)
  ) {
    closeMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !openGroupId.value) {
    return
  }
  const groupId = openGroupId.value
  event.preventDefault()
  event.stopImmediatePropagation()
  closeMenu()
  document.getElementById(groupTriggerId(groupId))?.focus()
}

function handleMenuKeydown(event: KeyboardEvent): void {
  if (!MENU_NAVIGATION_KEYS.has(event.key)) {
    return
  }
  const items = Array.from(
    menu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    ?? [],
  )
  if (items.length === 0) {
    return
  }
  event.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLButtonElement)
  let next = 0
  if (event.key === 'Home') {
    next = 0
  } else if (event.key === 'End') {
    next = items.length - 1
  } else if (event.key === 'ArrowDown') {
    next = current < 0 ? 0 : (current + 1) % items.length
  } else {
    next = current <= 0 ? items.length - 1 : current - 1
  }
  items[next].focus()
}

onBeforeUnmount(closeMenu)
</script>

<template>
  <div
    ref="toolbar"
    class="drawing-toolbar"
    role="toolbar"
    aria-label="Ferramentas de desenho"
    aria-orientation="vertical"
  >
    <div class="drawing-tools">
      <button
        :aria-pressed="activeTool === null"
        :class="{ active: activeTool === null && !openGroupId }"
        aria-label="Cursor"
        title="Cursor (Esc)"
        type="button"
        @click="selectCursor"
      >
        <Crosshair aria-hidden="true" />
      </button>

      <hr>

      <div
        v-for="group in DRAWING_TOOL_GROUPS"
        :key="group.id"
        class="drawing-group-control"
        :class="{
          active: isGroupActive(group),
          open: openGroupId === group.id,
        }"
      >
        <button
          class="drawing-group-primary"
          type="button"
          :aria-label="`Usar ${DRAWING_TOOL_LABELS[representativeTool(group)]}`"
          :aria-pressed="isGroupActive(group)"
          :title="`Usar ${DRAWING_TOOL_LABELS[representativeTool(group)]}`"
          @click="activateGroup(group)"
        >
          <DrawingToolIcon :tool="representativeTool(group)" />
        </button>
        <button
          :id="groupTriggerId(group.id)"
          class="drawing-group-menu-trigger"
          type="button"
          :aria-controls="groupMenuId(group.id)"
          :aria-expanded="openGroupId === group.id"
          :aria-label="`Escolher ferramenta: ${group.label}`"
          :title="`Escolher ferramenta: ${group.label}`"
          aria-haspopup="menu"
          @click="toggleGroup(group, $event)"
        >
          <i class="drawing-group-caret" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      v-if="openGroup"
      :id="groupMenuId(openGroup.id)"
      ref="menu"
      :aria-label="openGroup.label"
      :style="menuStyle"
      class="drawing-tool-menu"
      role="menu"
      @keydown="handleMenuKeydown"
    >
      <strong>{{ openGroup.label }}</strong>
      <button
        v-for="tool in openGroup.tools"
        :key="tool"
        :aria-checked="activeTool === tool"
        :class="{ active: activeTool === tool }"
        role="menuitemradio"
        type="button"
        @click="selectTool(openGroup.id, tool)"
      >
        <DrawingToolIcon :tool="tool" />
        <span>{{ DRAWING_TOOL_LABELS[tool] }}</span>
        <Check v-if="activeTool === tool" aria-hidden="true" />
      </button>
    </div>

    <div class="drawing-actions">
      <button
        :aria-label="lockLabel"
        :aria-pressed="drawingsLocked"
        :class="{ active: drawingsLocked }"
        :disabled="drawingCount === 0"
        :title="lockLabel"
        type="button"
        @click="emit('toggle-lock')"
      >
        <component :is="drawingsLocked ? Lock : LockOpen" aria-hidden="true" />
      </button>
      <button
        :aria-label="visibilityLabel"
        :aria-pressed="!drawingsVisible"
        :class="{ active: !drawingsVisible }"
        :disabled="drawingCount === 0"
        :title="visibilityLabel"
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
