<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import SymbolSearchWindow from '@market/components/SymbolSearchWindow.vue'
import TradingWorkspace from '@workspace/components/TradingWorkspace.vue'

const isSymbolSearch = new URLSearchParams(window.location.search)
  .get('view') === 'search'

if (isSymbolSearch) {
  document.body.classList.add('symbol-search-body')
}

onBeforeUnmount(() => {
  document.body.classList.remove('symbol-search-body')
})
</script>

<template>
  <SymbolSearchWindow v-if="isSymbolSearch" />
  <TradingWorkspace v-else />
</template>
