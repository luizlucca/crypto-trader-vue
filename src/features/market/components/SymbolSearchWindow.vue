<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import { createDefaultMarketSelection } from '@market/domain/marketSelection'
import { loadMarketCatalog } from '@desktop/marketData'
import { copyMarketPair } from '@shared/contracts/desktop'
import {
  favoriteKey,
  loadFavoriteKeys,
  saveFavoriteKeys,
} from '@market/services/favorites'
import type { SymbolSearchContext } from '@shared/contracts/desktop'
import type {
  MarketCatalog,
  MarketPair,
  MarketSelection,
} from '@shared/types/market'
import SymbolSearchModal from './SymbolSearchModal.vue'

const selection = reactive<MarketSelection>(createDefaultMarketSelection())
const catalog = shallowRef<MarketCatalog | null>(null)
const favoriteKeys = shallowRef(loadFavoriteKeys())
const initialQuery = ref('')
const intent = ref<SymbolSearchContext['intent']>('replace-tab')
const loading = ref(true)
const refreshing = ref(false)
const errorMessage = ref('')
let contextGeneration = 0
let unsubscribeContext: (() => void) | undefined
let unsubscribeFavorites: (() => void) | undefined

function applyContext(context: SymbolSearchContext): void {
  Object.assign(selection, context.selection)
  initialQuery.value = context.initialQuery
  intent.value = context.intent
  void loadCatalog(false)
}

async function loadCatalog(forceRefresh: boolean): Promise<void> {
  const generation = ++contextGeneration
  const provider = selection.provider
  const market = selection.market
  if (forceRefresh) {
    refreshing.value = true
  } else {
    loading.value = true
  }
  errorMessage.value = ''

  try {
    const nextCatalog = await loadMarketCatalog(
      provider,
      market,
      '',
      forceRefresh,
    )
    if (
      generation === contextGeneration
      && provider === selection.provider
      && market === selection.market
    ) {
      catalog.value = nextCatalog
    }
  } catch (error) {
    if (generation === contextGeneration) {
      errorMessage.value = error instanceof Error
        ? error.message
        : String(error)
    }
  } finally {
    if (generation === contextGeneration) {
      loading.value = false
      refreshing.value = false
    }
  }
}

function toggleFavorite(item: MarketPair): void {
  const key = favoriteKey(item)
  const next = new Set(favoriteKeys.value)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  favoriteKeys.value = next
  saveFavoriteKeys(next)
  window.cryptoPro?.windows.syncFavorites([...next])
}

function close(): void {
  void window.cryptoPro?.windows.closeSymbolSearch()
}

function select(item: MarketPair): void {
  void window.cryptoPro?.windows.selectSymbol(copyMarketPair(item))
}

onMounted(async () => {
  const desktop = window.cryptoPro
  if (!desktop) {
    loading.value = false
    errorMessage.value = 'A janela de pesquisa requer o runtime Electron.'
    return
  }

  unsubscribeContext = desktop.windows.onSearchContext(applyContext)
  unsubscribeFavorites = desktop.windows.onFavoritesChanged((keys) => {
    const next = new Set(keys)
    favoriteKeys.value = next
    saveFavoriteKeys(next)
  })

  const context = await desktop.windows.getSearchContext()
  if (context) {
    applyContext(context)
  } else {
    await loadCatalog(false)
  }
})

onBeforeUnmount(() => {
  contextGeneration += 1
  unsubscribeContext?.()
  unsubscribeFavorites?.()
})
</script>

<template>
  <main class="symbol-search-window">
    <SymbolSearchModal
      :cached="catalog?.cached ?? false"
      :error="errorMessage"
      :expires-at="catalog?.expiresAt ?? 0"
      :favorite-keys="favoriteKeys"
      :initial-query="initialQuery"
      :items="catalog?.items ?? []"
      :loaded-at="catalog?.loadedAt ?? 0"
      :loading="loading"
      :market="selection.market"
      :provider="selection.provider"
      :refreshing="refreshing"
      :selected-symbol="selection.symbol"
      :stale="catalog?.stale ?? false"
      :title="intent === 'new-tab'
        ? 'Selecionar ativo para nova aba'
        : 'Selecionar par de moedas'"
      :warning="catalog?.warning"
      @close="close"
      @favorite="toggleFavorite"
      @refresh="loadCatalog(true)"
      @select="select"
    />
  </main>
</template>
