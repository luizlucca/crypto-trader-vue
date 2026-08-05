<script setup lang="ts">
import { workspaceTabLabel, type WorkspaceTab } from '@/domain/workspace'

defineProps<{
  tabs: WorkspaceTab[]
  activeTabId: string
  maxTabs: number
}>()

const emit = defineEmits<{
  activate: [tabId: string]
  add: []
  close: [tabId: string]
}>()

/**
 * Arrow-key navigation, as a tablist owes its user.
 *
 * With roving tabindex the strip is one stop in the tab order and the arrows
 * move between the tabs inside it — otherwise reaching the eighth chart means
 * eight presses of Tab, and a screen reader announces a list whose keys do
 * nothing.
 */
function moveFocus(
  event: KeyboardEvent,
  tabs: WorkspaceTab[],
  index: number,
): void {
  const count = tabs.length
  let target: number
  switch (event.key) {
    case 'ArrowRight':
      target = (index + 1) % count
      break
    case 'ArrowLeft':
      target = (index - 1 + count) % count
      break
    case 'Home':
      target = 0
      break
    case 'End':
      target = count - 1
      break
    default:
      return
  }
  event.preventDefault()
  emit('activate', tabs[target].id)
  // Focus follows selection, and the button to focus is found through the DOM
  // rather than a ref array: the strip is the element the handler is bound
  // inside, so its tabs are exactly the ones enumerated here.
  const strip = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  strip?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus()
}

function closeOnMiddleClick(event: MouseEvent, tabId: string): void {
  if (event.button === 1) {
    event.preventDefault()
    emit('close', tabId)
  }
}

function streamStatusLabel(tab: WorkspaceTab): string {
  const labels = {
    connecting: 'conectando',
    connected: 'conectado',
    reconnecting: 'reconectando',
    error: 'com erro',
  } as const
  return [
    `Livro ${labels[tab.orderBookState]}`,
    `candles ${labels[tab.candleState]}`,
  ].join(' · ')
}
</script>

<template>
  <nav class="instrument-tabs" aria-label="Abas de mercado">
    <div class="instrument-tab-scroll" role="tablist">
      <!--
        The wrapper only groups the two buttons; leaving it transparent keeps
        the focusable button as the tab the tablist owns.
      -->
      <div
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="instrument-tab"
        :class="{ active: tab.id === activeTabId }"
        role="presentation"
        @auxclick="closeOnMiddleClick($event, tab.id)"
      >
        <button
          :aria-controls="`chart-panel-${tab.id}`"
          :aria-selected="tab.id === activeTabId"
          :tabindex="tab.id === activeTabId ? 0 : -1"
          class="instrument-tab-main"
          role="tab"
          type="button"
          @click="emit('activate', tab.id)"
          @keydown="moveFocus($event, tabs, index)"
        >
          <i
            class="instrument-tab-status"
            :class="tab.orderBookState"
            :title="streamStatusLabel(tab)"
            :aria-label="streamStatusLabel(tab)"
            role="img"
          />
          <span>
            <strong>{{ workspaceTabLabel(tab) }}</strong>
            <small>
              {{ tab.selection.interval }} ·
              {{ tab.selection.market === 'futures' ? 'Futuros' : 'Spot' }}
            </small>
          </span>
        </button>
        <button
          v-if="tabs.length > 1"
          class="instrument-tab-close"
          :aria-label="`Fechar ${workspaceTabLabel(tab)}`"
          title="Fechar aba"
          type="button"
          @click.stop="emit('close', tab.id)"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </div>
    <button
      aria-label="Adicionar nova aba"
      class="new-tab"
      :disabled="tabs.length >= maxTabs"
      :title="tabs.length >= maxTabs
        ? `Limite de ${maxTabs} abas atingido`
        : 'Nova aba (Ctrl+T)'"
      type="button"
      @click="emit('add')"
    >
      <svg aria-hidden="true" viewBox="0 0 16 16">
        <path d="M8 3v10M3 8h10" />
      </svg>
    </button>
  </nav>
</template>
