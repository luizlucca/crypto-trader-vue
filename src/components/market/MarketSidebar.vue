<script setup lang="ts">
import { PanelLeft, Search, Star } from '@lucide/vue'
import { computed, ref } from 'vue'
import { selectTop } from '@/domain/topSelection'
import { favoriteKey } from '@/services/favorites'
import { setMarketPanelVisible } from '@/services/workspacePanels'
import {
  formatMarketPercent,
  formatMarketPrice,
} from '@/services/numberFormat'
import CryptoAssetIcon from './CryptoAssetIcon.vue'
import RealtimePriceText from './RealtimePriceText.vue'
import type {
  Market,
  MarketPair,
  MarketSelection,
  StreamStatus,
} from '@shared/types/market'

type SidebarSortKey = 'symbol' | 'lastPrice' | 'priceChangePercent'
type SortDirection = 'asc' | 'desc'

const props = defineProps<{
  selection: MarketSelection
  symbols: MarketPair[]
  favoriteKeys: Set<string>
  loading: boolean
  connectionState: StreamStatus['state']
}>()

const emit = defineEmits<{
  market: [market: Market]
  symbol: [symbol: MarketPair]
  newTab: [symbol: MarketPair]
  openSearch: [query: string]
}>()

const search = ref('')
const sortKey = ref<SidebarSortKey>('symbol')
const sortDirection = ref<SortDirection>('asc')

const VISIBLE_ROWS = 14
const VISIBLE_FAVORITES = 8

// The catalog holds thousands of pairs and this recomputes on every keystroke,
// on the thread that paints the chart. `selectTop` avoids copying and sorting
// the whole array to display a handful of rows.
const visibleSymbols = computed(() => {
  const query = search.value.trim().toUpperCase().replace('/', '')
  const direction = sortDirection.value === 'asc' ? 1 : -1
  const key = sortKey.value

  return selectTop(
    props.symbols,
    VISIBLE_ROWS,
    (left, right) => {
      const result = key === 'symbol'
        ? left.symbol.localeCompare(right.symbol)
        : left[key] - right[key]
      return result === 0
        ? left.symbol.localeCompare(right.symbol)
        : result * direction
    },
    query ? (symbol) => symbol.symbol.includes(query) : undefined,
  )
})

const favorites = computed(() => selectTop(
  props.symbols,
  VISIBLE_FAVORITES,
  (left, right) => right.quoteVolume - left.quoteVolume,
  (symbol) => props.favoriteKeys.has(favoriteKey(symbol)),
))

function displaySymbol(symbol: MarketPair): string {
  return `${symbol.baseAsset}/${symbol.quoteAsset}`
}

function displayedPrice(symbol: MarketPair): string {
  return formatMarketPrice(symbol.lastPrice, symbol.pricePrecision)
}

function displayedChange(symbol: MarketPair): string {
  return formatMarketPercent(symbol.priceChangePercent)
}

function changeSort(nextSort: SidebarSortKey): void {
  if (sortKey.value === nextSort) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = nextSort
  sortDirection.value = nextSort === 'symbol' ? 'asc' : 'desc'
}

function sortIndicator(key: SidebarSortKey): string {
  if (sortKey.value !== key) {
    return '↕'
  }
  return sortDirection.value === 'asc' ? '↑' : '↓'
}

function ariaSort(key: SidebarSortKey): 'ascending' | 'descending' | 'none' {
  if (sortKey.value !== key) {
    return 'none'
  }
  return sortDirection.value === 'asc' ? 'ascending' : 'descending'
}

function selectSymbol(event: MouseEvent, symbol: MarketPair): void {
  if (event.ctrlKey || event.metaKey) {
    emit('newTab', symbol)
    return
  }
  emit('symbol', symbol)
}
</script>

<template>
  <aside class="market-sidebar">
    <section class="sidebar-section market-section">
      <div class="sidebar-title">
        <h2>MERCADO</h2>
        <button
          aria-label="Ocultar Mercado"
          class="panel-hide"
          title="Ocultar Mercado (Ctrl+B)"
          type="button"
          @click="setMarketPanelVisible(false)"
        >
          <PanelLeft aria-hidden="true" />
        </button>
      </div>
      <label class="search-field">
        <Search aria-hidden="true" />
        <input
          v-model="search"
          aria-label="Buscar símbolo"
          placeholder="Buscar ativo…"
        >
      </label>
      <div class="market-kind">
        <button
          :class="{ active: selection.market === 'spot' }"
          type="button"
          @click="emit('market', 'spot')"
        >
          Spot
        </button>
        <button
          :class="{ active: selection.market === 'futures' }"
          type="button"
          @click="emit('market', 'futures')"
        >
          Futuros
        </button>
      </div>
      <div class="quote-tabs">
        <button class="active" type="button">USDT</button>
        <button disabled type="button">COIN</button>
        <button disabled type="button">FIAT</button>
        <button
          aria-label="Abrir favoritos"
          title="Abrir favoritos"
          type="button"
          @click="emit('openSearch', '')"
        >
          <Star aria-hidden="true" />
        </button>
      </div>
      <div class="market-table market-table-header">
        <button
          :aria-sort="ariaSort('symbol')"
          role="columnheader"
          type="button"
          @click="changeSort('symbol')"
        >
          Símbolo <i>{{ sortIndicator('symbol') }}</i>
        </button>
        <button
          :aria-sort="ariaSort('lastPrice')"
          role="columnheader"
          type="button"
          @click="changeSort('lastPrice')"
        >
          Último <i>{{ sortIndicator('lastPrice') }}</i>
        </button>
        <button
          :aria-sort="ariaSort('priceChangePercent')"
          role="columnheader"
          type="button"
          @click="changeSort('priceChangePercent')"
        >
          24h <i>{{ sortIndicator('priceChangePercent') }}</i>
        </button>
      </div>
      <div class="market-list">
        <div v-if="loading" class="market-loading">Carregando símbolos…</div>
        <template v-else>
          <button
            v-for="item in visibleSymbols"
            :key="item.symbol"
            class="market-table market-row"
            :class="{ selected: item.symbol === selection.symbol }"
            title="Clique para abrir · Ctrl+clique para abrir em nova aba"
            type="button"
            @click="selectSymbol($event, item)"
          >
            <span class="market-symbol-cell">
              <CryptoAssetIcon :size="20" :symbol="item.baseAsset" />
              <span>
                {{ favoriteKeys.has(favoriteKey(item)) ? '★' : '' }}
                {{ displaySymbol(item) }}
              </span>
            </span>
            <RealtimePriceText
              v-if="item.symbol === selection.symbol"
              :fallback="item.lastPrice"
              :market="item.market"
              :precision="item.pricePrecision"
              :provider="item.provider"
              :symbol="item.symbol"
            />
            <span v-else>{{ displayedPrice(item) }}</span>
            <span :class="item.priceChangePercent >= 0 ? 'positive' : 'negative'">
              {{ displayedChange(item) }}
            </span>
          </button>
        </template>
        <div v-if="!loading && visibleSymbols.length === 0" class="market-loading">
          Nenhum ativo encontrado
        </div>
      </div>
    </section>

    <section class="sidebar-section favorites-section">
      <h2>FAVORITOS</h2>
      <div v-if="favorites.length === 0" class="favorites-empty">
        Nenhum favorito neste mercado
      </div>
      <button
        v-for="item in favorites"
        :key="`favorite-${item.symbol}`"
        class="compact-row favorite-row"
        title="Clique para abrir · Ctrl+clique para abrir em nova aba"
        type="button"
        @click="selectSymbol($event, item)"
      >
        <span class="market-symbol-cell">
          <CryptoAssetIcon :size="18" :symbol="item.baseAsset" />
          <span>★ {{ displaySymbol(item) }}</span>
        </span>
        <span
          :class="item.priceChangePercent >= 0 ? 'positive' : 'negative'"
          :title="displayedPrice(item)"
        >
          {{ displayedChange(item) }}
        </span>
      </button>
      <button
        class="text-action"
        type="button"
        @click="emit('openSearch', '')"
      >
        + Gerenciar favoritos
      </button>
    </section>

    <section class="sidebar-section connections-section">
      <h2>CONEXÕES</h2>
      <div class="connection-row">
        <span><i class="provider-icon binance" />Binance</span>
        <b :class="{ online: connectionState === 'connected' }" />
      </div>
      <div class="connection-row">
        <span><i class="provider-icon" />Bybit</span><b />
      </div>
      <div class="connection-row">
        <span><i class="provider-icon" />OKX</span><b />
      </div>
      <div class="connection-row">
        <span><i class="provider-icon" />Gate.io</span><b />
      </div>
      <button class="text-action" type="button">+ Adicionar corretora</button>
    </section>
  </aside>
</template>
