<script setup lang="ts">
import { computed, ref } from 'vue'
import type {
  Market,
  MarketSelection,
  MarketSymbol,
  StreamStatus,
} from '../../types/market'

const props = defineProps<{
  selection: MarketSelection
  symbols: MarketSymbol[]
  loading: boolean
  connectionState: StreamStatus['state']
  lastPrice: number
}>()

const emit = defineEmits<{
  market: [market: Market]
  symbol: [symbol: MarketSymbol]
}>()

const search = ref('')
const preferredSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']

const visibleSymbols = computed(() => {
  const query = search.value.trim().toUpperCase().replace('/', '')
  return [...props.symbols]
    .filter((symbol) => !query || symbol.symbol.includes(query))
    .sort((left, right) => {
      const leftPriority = preferredSymbols.indexOf(left.symbol)
      const rightPriority = preferredSymbols.indexOf(right.symbol)
      if (leftPriority >= 0 || rightPriority >= 0) {
        if (leftPriority < 0) return 1
        if (rightPriority < 0) return -1
        return leftPriority - rightPriority
      }
      return left.symbol.localeCompare(right.symbol)
    })
    .slice(0, 18)
})

const favorites = computed(() => preferredSymbols
  .map((symbol) => props.symbols.find((item) => item.symbol === symbol))
  .filter((symbol): symbol is MarketSymbol => Boolean(symbol)))

function displaySymbol(symbol: MarketSymbol): string {
  return `${symbol.baseAsset}/${symbol.quoteAsset}`
}

function displayedPrice(symbol: MarketSymbol): string {
  if (symbol.symbol !== props.selection.symbol || props.lastPrice <= 0) {
    return '—'
  }
  return props.lastPrice.toFixed(Math.min(symbol.pricePrecision, 8))
}
</script>

<template>
  <aside class="market-sidebar">
    <section class="sidebar-section market-section">
      <h2>MERCADO</h2>
      <label class="search-field">
        <span>⌕</span>
        <input
          v-model="search"
          aria-label="Buscar símbolo"
          placeholder="Buscar ativo (Enter)"
        />
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
        <button type="button">★</button>
      </div>
      <div class="market-table market-table-header">
        <span>Símbolo</span>
        <span>Último</span>
        <span>Status</span>
      </div>
      <div class="market-list">
        <div v-if="loading" class="market-loading">Carregando símbolos…</div>
        <template v-else>
          <button
            v-for="item in visibleSymbols"
            :key="item.symbol"
            class="market-table market-row"
            :class="{ selected: item.symbol === selection.symbol }"
            type="button"
            @click="emit('symbol', item)"
          >
            <span>★ {{ displaySymbol(item) }}</span>
            <span>{{ displayedPrice(item) }}</span>
            <span :class="{ positive: item.symbol === selection.symbol && connectionState === 'connected' }">
              {{ item.symbol === selection.symbol && connectionState === 'connected' ? 'LIVE' : 'OK' }}
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
      <button
        v-for="item in favorites"
        :key="`favorite-${item.symbol}`"
        class="compact-row favorite-row"
        type="button"
        @click="emit('symbol', item)"
      >
        <span>★ {{ displaySymbol(item) }}</span>
        <span :class="{ positive: item.symbol === selection.symbol }">
          {{ item.symbol === selection.symbol ? displayedPrice(item) : '—' }}
        </span>
      </button>
      <button class="text-action" type="button">+ Adicionar favorito</button>
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
