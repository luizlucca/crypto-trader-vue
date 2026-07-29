<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MarketSelection,
  OrderBookLevel,
  OrderBookSnapshot,
} from '../../types/market'
import { onOrderBook } from '../../services/marketData'

const ROW_COUNT = 10
const props = defineProps<{ selection: MarketSelection }>()
const emit = defineEmits<{
  latency: [value: number]
  price: [value: number]
}>()
const rowIndexes = Array.from({ length: ROW_COUNT }, (_, index) => index)

const askRows: HTMLElement[] = []
const bidRows: HTMLElement[] = []
const midPrice = ref<HTMLElement | null>(null)
const spread = ref<HTMLElement | null>(null)
let latestSnapshot: OrderBookSnapshot | null = null
let frameHandle = 0
let unsubscribe: (() => void) | undefined
let lastUpdateID = 0
let lastMetricsAt = 0

function registerRow(
  target: HTMLElement[],
  element: Element | null,
  index: number,
): void {
  if (element instanceof HTMLElement) {
    target[index] = element
  }
}

function matches(snapshot: OrderBookSnapshot): boolean {
  return snapshot.provider === props.selection.provider
    && snapshot.market === props.selection.market
    && snapshot.symbol === props.selection.symbol
}

function renderRows(
  elements: HTMLElement[],
  levels: OrderBookLevel[],
  side: 'ask' | 'bid',
): void {
  const maxTotal = Math.max(...levels.map((level) => level.total), 1)

  elements.forEach((element, index) => {
    const level = levels[index]
    const price = element.querySelector<HTMLElement>('[data-price]')
    const quantity = element.querySelector<HTMLElement>('[data-quantity]')
    const total = element.querySelector<HTMLElement>('[data-total]')
    const fill = element.querySelector<HTMLElement>('[data-fill]')

    if (!level) {
      if (price) price.textContent = '—'
      if (quantity) quantity.textContent = '—'
      if (total) total.textContent = '—'
      if (fill) fill.style.width = '0%'
      return
    }

    if (price) price.textContent = formatPrice(level.price)
    if (quantity) {
      quantity.textContent = level.quantity.toFixed(
        Math.min(props.selection.quantityPrecision, 8),
      )
    }
    if (total) total.textContent = level.total.toFixed(3)
    if (fill) {
      fill.style.width = `${Math.max(2, (level.total / maxTotal) * 100)}%`
      fill.dataset.side = side
    }
  })
}

function renderSnapshot(snapshot: OrderBookSnapshot): void {
  const asks = snapshot.asks.slice(0, ROW_COUNT).reverse()
  const bids = snapshot.bids.slice(0, ROW_COUNT)
  renderRows(askRows, asks, 'ask')
  renderRows(bidRows, bids, 'bid')
  if (midPrice.value) {
    midPrice.value.textContent = formatPrice(snapshot.midPrice)
  }
  if (spread.value) {
    spread.value.textContent = `Spread ${formatPrice(snapshot.spread)}`
  }
  const now = Date.now()
  if (now - lastMetricsAt >= 500) {
    lastMetricsAt = now
    emit('latency', Math.max(0, now - snapshot.eventTime))
    emit('price', snapshot.midPrice)
  }
}

function scheduleRender(snapshot: OrderBookSnapshot): void {
  if (
    snapshot.lastUpdateId > 0
    && lastUpdateID > 0
    && snapshot.lastUpdateId <= lastUpdateID
  ) {
    return
  }
  lastUpdateID = snapshot.lastUpdateId
  latestSnapshot = snapshot
  if (frameHandle !== 0) {
    return
  }
  frameHandle = requestAnimationFrame(() => {
    frameHandle = 0
    if (latestSnapshot) {
      renderSnapshot(latestSnapshot)
    }
  })
}

function formatPrice(value: number): string {
  return value.toFixed(Math.min(props.selection.pricePrecision, 8))
}

function clearBook(): void {
  latestSnapshot = null
  lastUpdateID = 0
  lastMetricsAt = 0
  renderRows(askRows, [], 'ask')
  renderRows(bidRows, [], 'bid')
  if (midPrice.value) midPrice.value.textContent = '—'
  if (spread.value) spread.value.textContent = 'Spread —'
}

onMounted(() => {
  unsubscribe = onOrderBook((snapshot) => {
    if (matches(snapshot)) {
      scheduleRender(snapshot)
    }
  })
})

onBeforeUnmount(() => {
  unsubscribe?.()
  if (frameHandle !== 0) {
    cancelAnimationFrame(frameHandle)
  }
})

watch(
  () => `${props.selection.market}:${props.selection.symbol}`,
  clearBook,
)
</script>

<template>
  <section class="order-book panel">
    <header class="panel-header">
      <h2>LIVRO DE ORDENS</h2>
      <div>
        <button class="active" type="button">▥</button>
        <button type="button">▥</button>
        <button type="button">⌄</button>
      </div>
    </header>
    <div class="book-columns">
      <span>Preço ({{ selection.quoteAsset }})</span>
      <span>Qtd ({{ selection.baseAsset }})</span>
      <span>Total ({{ selection.baseAsset }})</span>
    </div>

    <div class="book-side asks">
      <div
        v-for="index in rowIndexes"
        :key="`ask-${index}`"
        :ref="(element) => registerRow(askRows, element as Element | null, index)"
        class="book-row"
      >
        <i data-fill />
        <span data-price>—</span>
        <span data-quantity>—</span>
        <span data-total>—</span>
      </div>
    </div>

    <div class="book-mid">
      <strong ref="midPrice">—</strong>
      <span>↑</span>
      <small ref="spread">Spread —</small>
    </div>

    <div class="book-side bids">
      <div
        v-for="index in rowIndexes"
        :key="`bid-${index}`"
        :ref="(element) => registerRow(bidRows, element as Element | null, index)"
        class="book-row"
      >
        <i data-fill />
        <span data-price>—</span>
        <span data-quantity>—</span>
        <span data-total>—</span>
      </div>
    </div>

    <footer class="book-ratio">
      <span>Compra 54,2%</span>
      <i><b /></i>
      <span>45,8% Venda</span>
    </footer>
  </section>
</template>
