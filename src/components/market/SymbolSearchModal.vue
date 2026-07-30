<script setup lang="ts">
import { RefreshCw, Search, Star, X } from '@lucide/vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { favoriteKey } from '../../services/favorites'
import {
  formatClockTime,
  formatCompactNumber,
  formatMarketPercent,
  formatMarketPrice,
} from '../../services/numberFormat'
import type {
  CatalogSearchCriteria,
  CatalogSortDirection,
  CatalogSortKey,
} from '../../services/marketCatalogSearch'
import { MarketCatalogSearchEngine } from '../../services/marketCatalogSearchEngine'
import type { Market, MarketPair } from '../../types/market'
import CryptoAssetIcon from './CryptoAssetIcon.vue'

const ROW_HEIGHT = 52
const OVERSCAN = 3
const DEFAULT_VIEWPORT_HEIGHT = ROW_HEIGHT * 9

const props = defineProps<{
  provider: string
  market: Market
  title?: string
  selectedSymbol: string
  items: MarketPair[]
  favoriteKeys: Set<string>
  initialQuery: string
  loading: boolean
  refreshing: boolean
  loadedAt: number
  expiresAt: number
  cached: boolean
  stale: boolean
  warning?: string
}>()

const emit = defineEmits<{
  close: []
  refresh: []
  select: [item: MarketPair]
  favorite: [item: MarketPair]
}>()

const queryInput = ref<HTMLInputElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
let queryValue = props.initialQuery
const quoteAsset = ref('')
const favoritesOnly = ref(false)
const sortKey = ref<CatalogSortKey>('quoteVolume')
const sortDirection = ref<CatalogSortDirection>('desc')
const scrollTop = ref(0)
const activeIndex = ref(0)
const resultIndexes = shallowRef<Uint32Array>(new Uint32Array())
const quoteAssets = shallowRef<string[]>([])
const initialSearchPending = ref(true)
const viewportHeight = ref(DEFAULT_VIEWPORT_HEIGHT)
let searchEngine: MarketCatalogSearchEngine | undefined
let scrollFrame = 0
let viewportResizeFrame = 0
let viewportResizeObserver: ResizeObserver | undefined

interface SymbolRowDisplay {
  lastPrice: string
  percent: string
  quoteVolume: string
  lowPrice: string
  highPrice: string
  rangePosition: number
}

const rowDisplayCache = new WeakMap<MarketPair, SymbolRowDisplay>()

function displayFor(item: MarketPair): SymbolRowDisplay {
  const cached = rowDisplayCache.get(item)
  if (cached) {
    return cached
  }

  const priceRange = item.highPrice - item.lowPrice
  const rangePosition = Number.isFinite(priceRange)
    && priceRange > 0
    && Number.isFinite(item.lastPrice)
    ? Math.min(
        100,
        Math.max(0, ((item.lastPrice - item.lowPrice) / priceRange) * 100),
      )
    : 50
  const display: SymbolRowDisplay = {
    lastPrice: formatMarketPrice(item.lastPrice, item.pricePrecision),
    percent: formatMarketPercent(item.priceChangePercent),
    quoteVolume: formatCompactNumber(item.quoteVolume),
    lowPrice: formatMarketPrice(item.lowPrice, item.pricePrecision),
    highPrice: formatMarketPrice(item.highPrice, item.pricePrecision),
    rangePosition,
  }
  rowDisplayCache.set(item, display)
  return display
}

const resultCount = computed(() => resultIndexes.value.length)

const startIndex = computed(() => Math.max(
  0,
  Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN,
))
const endIndex = computed(() => Math.min(
  resultCount.value,
  Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + OVERSCAN,
))
const visibleRows = computed(() => {
  const rows: Array<{
    item: MarketPair
    index: number
    display: SymbolRowDisplay
    favorite: boolean
  }> = []
  for (let index = startIndex.value; index < endIndex.value; index += 1) {
    const item = props.items[resultIndexes.value[index]]
    if (item) {
      rows.push({
        item,
        index,
        display: displayFor(item),
        favorite: props.favoriteKeys.has(favoriteKey(item)),
      })
    }
  }
  return rows
})
const virtualHeight = computed(() => resultCount.value * ROW_HEIGHT)

const cacheLabel = computed(() => {
  if (!props.loadedAt) {
    return 'Catálogo ainda não carregado'
  }
  const loaded = formatClockTime(props.loadedAt)
  if (props.stale) {
    return `Cache desatualizado · última carga ${loaded}`
  }
  if (props.cached) {
    return `Cache local · expira ${formatClockTime(props.expiresAt)}`
  }
  return `Atualizado na Binance às ${loaded}`
})

function changeSort(nextKey: CatalogSortKey): void {
  if (sortKey.value === nextKey) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
    return
  }
  sortKey.value = nextKey
  sortDirection.value = nextKey === 'symbol' ? 'asc' : 'desc'
}

function sortIndicator(key: CatalogSortKey): string {
  if (sortKey.value !== key) {
    return ' ↕'
  }
  return sortDirection.value === 'asc' ? ' ↑' : ' ↓'
}

function onScroll(event: Event): void {
  const target = event.currentTarget as HTMLElement
  if (scrollFrame) {
    return
  }
  scrollFrame = requestAnimationFrame(() => {
    scrollTop.value = target.scrollTop
    scrollFrame = 0
  })
}

function resetScroll(): void {
  activeIndex.value = 0
  scrollTop.value = 0
  if (viewport.value) {
    viewport.value.scrollTop = 0
  }
}

function measureViewport(): void {
  const height = viewport.value?.clientHeight
  if (height && Math.abs(height - viewportHeight.value) >= 1) {
    viewportHeight.value = height
  }
}

function scheduleViewportMeasure(): void {
  if (viewportResizeFrame) {
    return
  }
  viewportResizeFrame = requestAnimationFrame(() => {
    viewportResizeFrame = 0
    measureViewport()
  })
}

function keepActiveRowVisible(): void {
  const element = viewport.value
  if (!element) {
    return
  }

  const rowTop = activeIndex.value * ROW_HEIGHT
  const rowBottom = rowTop + ROW_HEIGHT
  const visibleHeight = element.clientHeight || viewportHeight.value
  if (rowTop < element.scrollTop) {
    element.scrollTop = rowTop
  } else if (rowBottom > element.scrollTop + visibleHeight) {
    element.scrollTop = rowBottom - visibleHeight
  }
  scrollTop.value = element.scrollTop
}

function moveActiveRow(direction: number): void {
  const lastIndex = resultCount.value - 1
  if (lastIndex < 0) {
    return
  }
  activeIndex.value = Math.min(
    lastIndex,
    Math.max(0, activeIndex.value + direction),
  )
  void nextTick(keepActiveRowVisible)
}

function itemAt(resultIndex: number): MarketPair | undefined {
  return props.items[resultIndexes.value[resultIndex]]
}

function selectActiveRow(): void {
  const activeItem = itemAt(activeIndex.value)
  if (activeItem) {
    emit('select', activeItem)
  }
}

function searchCriteria(): CatalogSearchCriteria {
  return {
    query: queryValue,
    quoteAsset: quoteAsset.value,
    favoritesOnly: favoritesOnly.value,
    favoriteKeys: [...props.favoriteKeys],
    sortKey: sortKey.value,
    sortDirection: sortDirection.value,
  }
}

function runSearch(): void {
  if (!searchEngine) {
    return
  }
  searchEngine.search(searchCriteria())
}

function handleQueryInput(event: Event): void {
  queryValue = (event.currentTarget as HTMLInputElement).value
  runSearch()
}

function handleDocumentKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

function focusQuery(): void {
  void nextTick(() => {
    const element = queryInput.value
    if (!element) {
      return
    }
    if (element.value !== queryValue) {
      element.value = queryValue
    }
    element.focus()
    element.select()
  })
}

watch(
  [
    quoteAsset,
    favoritesOnly,
    sortKey,
    sortDirection,
    () => props.favoriteKeys,
  ],
  () => {
    runSearch()
  },
)

watch(
  () => props.items,
  (items) => {
    initialSearchPending.value = true
    resultIndexes.value = new Uint32Array()
    resetScroll()
    searchEngine?.replaceItems(items)
    runSearch()
  },
)

watch(
  () => props.initialQuery,
  (nextQuery) => {
    if (nextQuery === queryValue) {
      return
    }
    queryValue = nextQuery
    if (queryInput.value) {
      queryInput.value.value = nextQuery
    }
    resetScroll()
    runSearch()
    focusQuery()
  },
  { flush: 'post' },
)

onMounted(() => {
  searchEngine = new MarketCatalogSearchEngine({
    onReady: (assets) => {
      quoteAssets.value = assets
    },
    onResult: (indexes) => {
      resultIndexes.value = indexes
      resetScroll()
      initialSearchPending.value = false
    },
  })
  searchEngine.replaceItems(props.items)
  runSearch()
  if (viewport.value) {
    viewportResizeObserver = new ResizeObserver(scheduleViewportMeasure)
    viewportResizeObserver.observe(viewport.value)
    scheduleViewportMeasure()
  }
  document.addEventListener('keydown', handleDocumentKey)
  focusQuery()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKey)
  viewportResizeObserver?.disconnect()
  viewportResizeObserver = undefined
  searchEngine?.terminate()
  searchEngine = undefined
  if (scrollFrame) {
    cancelAnimationFrame(scrollFrame)
  }
  if (viewportResizeFrame) {
    cancelAnimationFrame(viewportResizeFrame)
  }
})
</script>

<template>
  <section
    aria-labelledby="symbol-modal-title"
    class="symbol-modal native"
    role="dialog"
  >
      <header
        class="symbol-modal-header"
        data-floating-drag-handle
      >
        <div>
          <span>
            {{ provider.toUpperCase() }} ·
            {{ market === 'futures' ? 'FUTUROS' : 'SPOT' }}
          </span>
          <h2 id="symbol-modal-title">
            {{ title || 'Selecionar par de moedas' }}
          </h2>
        </div>
        <div class="symbol-modal-cache" :class="{ stale }">
          <span>{{ cacheLabel }}</span>
          <button
            :disabled="refreshing"
            title="Ignorar o cache e buscar novamente na Binance"
            type="button"
            @click="emit('refresh')"
          >
            <RefreshCw aria-hidden="true" :class="{ spinning: refreshing }" />
            {{ refreshing ? 'Atualizando…' : 'Recarregar' }}
          </button>
        </div>
        <button
          aria-label="Fechar seletor"
          class="symbol-modal-close"
          type="button"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="symbol-modal-filters">
        <div class="symbol-search-row">
          <label class="symbol-search-input">
            <Search aria-hidden="true" />
            <input
              ref="queryInput"
              aria-autocomplete="list"
              aria-controls="symbol-results"
              aria-expanded="true"
              autocomplete="off"
              placeholder="Buscar BTC, ETH/USDT…"
              role="combobox"
              type="search"
              @input="handleQueryInput"
              @keydown.down.prevent="moveActiveRow(1)"
              @keydown.enter.prevent="selectActiveRow"
              @keydown.up.prevent="moveActiveRow(-1)"
            />
          </label>
          <div class="symbol-search-help" aria-label="Atalhos de teclado">
            <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
            <span><kbd>Enter</kbd> selecionar</span>
            <span><kbd>Esc</kbd> fechar</span>
          </div>
        </div>
        <div class="symbol-quote-filters">
          <button
            :class="{ active: quoteAsset === '' }"
            type="button"
            @click="quoteAsset = ''"
          >
            Todos
          </button>
          <button
            v-for="asset in quoteAssets"
            :key="asset"
            :class="{ active: quoteAsset === asset }"
            type="button"
            @click="quoteAsset = asset"
          >
            {{ asset }}
          </button>
          <button
            :class="{ active: favoritesOnly }"
            class="favorites-filter"
            type="button"
            @click="favoritesOnly = !favoritesOnly"
          >
            <Star aria-hidden="true" /> Favoritos
          </button>
        </div>
      </div>

      <p v-if="warning" class="symbol-catalog-warning">
        A Binance não respondeu à atualização. Exibindo o último cache:
        {{ warning }}
      </p>

      <div class="symbol-table-header symbol-table-grid">
        <span aria-label="Favorito" />
        <button type="button" @click="changeSort('symbol')">
          Par{{ sortIndicator('symbol') }}
        </button>
        <button type="button" @click="changeSort('lastPrice')">
          Último preço{{ sortIndicator('lastPrice') }}
        </button>
        <button type="button" @click="changeSort('priceChangePercent')">
          Variação 24h{{ sortIndicator('priceChangePercent') }}
        </button>
        <button type="button" @click="changeSort('quoteVolume')">
          Volume 24h{{ sortIndicator('quoteVolume') }}
        </button>
        <span>Faixa 24h</span>
      </div>

      <div
        id="symbol-results"
        ref="viewport"
        class="symbol-virtual-viewport"
        :class="{ loading: loading || initialSearchPending }"
        role="listbox"
        @scroll.passive="onScroll"
      >
        <div
          v-if="!loading && !initialSearchPending"
          class="symbol-virtual-content"
          :style="{ height: `${virtualHeight}px` }"
        >
          <div
            v-for="row in visibleRows"
            :key="`${row.item.market}:${row.item.symbol}`"
            v-memo="[
              row.item,
              row.index === activeIndex,
              row.item.symbol === selectedSymbol,
              row.favorite,
            ]"
            class="symbol-table-row symbol-table-grid"
            :class="{
              active: row.index === activeIndex,
              selected: row.item.symbol === selectedSymbol,
            }"
            :style="{ transform: `translateY(${row.index * ROW_HEIGHT}px)` }"
            :aria-selected="row.index === activeIndex"
            role="option"
            @click="emit('select', row.item)"
          >
            <button
              :aria-label="`${row.favorite ? 'Remover' : 'Adicionar'} ${row.item.symbol} dos favoritos`"
              :class="{ active: row.favorite }"
              class="symbol-favorite"
              type="button"
              @click.stop="emit('favorite', row.item)"
            >
              <Star aria-hidden="true" />
            </button>
            <strong class="symbol-pair-cell">
              <CryptoAssetIcon :size="27" :symbol="row.item.baseAsset" />
              <span>
                {{ row.item.baseAsset }}<small>/{{ row.item.quoteAsset }}</small>
              </span>
            </strong>
            <span>{{ row.display.lastPrice }}</span>
            <span :class="row.item.priceChangePercent >= 0 ? 'positive' : 'negative'">
              {{ row.display.percent }}
            </span>
            <span title="Volume na moeda de cotação">
              {{ row.display.quoteVolume }}
              <small>{{ row.item.quoteAsset }}</small>
            </span>
            <span class="symbol-range">
              <span class="symbol-range-values">
                <small>MÍN. {{ row.display.lowPrice }}</small>
                <small>MÁX. {{ row.display.highPrice }}</small>
              </span>
              <span class="symbol-range-track">
                <i :style="{ left: `${row.display.rangePosition}%` }" />
              </span>
            </span>
          </div>
        </div>

        <div
          v-if="loading || initialSearchPending"
          class="symbol-modal-state"
        >
          <i />
          {{
            loading
              ? 'Buscando pares e estatísticas de 24h na Binance…'
              : 'Preparando índice de pesquisa…'
          }}
        </div>
        <div
          v-else-if="resultCount === 0"
          class="symbol-modal-state"
        >
          Nenhum par corresponde aos filtros atuais.
        </div>
      </div>

      <footer class="symbol-modal-footer">
        <span>
          {{ resultCount }} de {{ items.length }} pares
        </span>
        <span>Dados e variações das últimas 24 horas</span>
      </footer>
  </section>
</template>
