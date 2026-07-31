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
    <div class="instrument-tab-scroll">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        :aria-selected="tab.id === activeTabId"
        class="instrument-tab"
        :class="{ active: tab.id === activeTabId }"
        role="tab"
        @auxclick="closeOnMiddleClick($event, tab.id)"
      >
        <button
          class="instrument-tab-main"
          type="button"
          @click="emit('activate', tab.id)"
        >
          <i
            class="instrument-tab-status"
            :class="tab.orderBookState"
            :title="streamStatusLabel(tab)"
            :aria-label="streamStatusLabel(tab)"
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
