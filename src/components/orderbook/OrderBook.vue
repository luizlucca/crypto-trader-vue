<script setup lang="ts">
import { Columns3, Rows3 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MarketSelection,
  OrderBookLevel,
  OrderBookSnapshot,
} from '../../types/market'
import { onOrderBook } from '../../services/marketData'
import { publishRealtimePrice } from '../../services/realtimePrice'
import {
  aggregateOrderBookLevels,
  aggregationPrecision,
  createAggregationOptions,
  formatAggregationStep,
} from './orderBookAggregation'
import { calculateOrderBookRatio } from './orderBookRatio'

const ROW_COUNT = 10
const props = defineProps<{
  sessionId: string
  selection: MarketSelection
  aggregationStep: number
}>()
const emit = defineEmits<{
  latency: [value: number]
  aggregationStep: [value: number]
}>()
const rowIndexes = Array.from({ length: ROW_COUNT }, (_, index) => index)
const aggregationOptions = computed(() => (
  createAggregationOptions(props.selection.priceTickSize)
))

interface BookRowElements {
  price: HTMLElement
  quantity: HTMLElement
  total: HTMLElement
  fill: HTMLElement
}

const askRows: Array<BookRowElements | undefined> = []
const bidRows: Array<BookRowElements | undefined> = []
const midPrice = ref<HTMLElement | null>(null)
const spread = ref<HTMLElement | null>(null)
const buyRatioText = ref<HTMLElement | null>(null)
const sellRatioText = ref<HTMLElement | null>(null)
const ratioTrack = ref<HTMLElement | null>(null)
const ratioFill = ref<HTMLElement | null>(null)
let latestSnapshot: OrderBookSnapshot | null = null
let frameHandle = 0
let unsubscribe: (() => void) | undefined
let lastUpdateID = 0
let lastMetricsAt = 0

function registerRow(
  target: Array<BookRowElements | undefined>,
  element: Element | null,
  index: number,
): void {
  if (!(element instanceof HTMLElement)) {
    target[index] = undefined
    return
  }

  const price = element.querySelector<HTMLElement>('[data-price]')
  const quantity = element.querySelector<HTMLElement>('[data-quantity]')
  const total = element.querySelector<HTMLElement>('[data-total]')
  const fill = element.querySelector<HTMLElement>('[data-fill]')
  if (price && quantity && total && fill) {
    target[index] = { price, quantity, total, fill }
  }
}

function matches(snapshot: OrderBookSnapshot): boolean {
  return snapshot.provider === props.selection.provider
    && snapshot.market === props.selection.market
    && snapshot.symbol === props.selection.symbol
}

function renderRows(
  elements: Array<BookRowElements | undefined>,
  levels: OrderBookLevel[],
  side: 'ask' | 'bid',
  reverse: boolean,
): void {
  const visibleLevelCount = Math.min(ROW_COUNT, levels.length)
  let maxTotal = 1
  for (let index = 0; index < visibleLevelCount; index += 1) {
    maxTotal = Math.max(maxTotal, levels[index].total)
  }

  elements.forEach((row, index) => {
    if (!row) {
      return
    }
    const levelIndex = reverse
      ? visibleLevelCount - 1 - index
      : index
    const level = levelIndex >= 0 ? levels[levelIndex] : undefined

    if (!level) {
      writeText(row.price, '—')
      writeText(row.quantity, '—')
      writeText(row.total, '—')
      writeWidth(row.fill, '0%')
      return
    }

    writeText(row.price, formatAggregatedPrice(level.price))
    writeText(
      row.quantity,
      level.quantity.toFixed(
        Math.min(props.selection.quantityPrecision, 8),
      ),
    )
    writeText(row.total, level.total.toFixed(3))
    writeWidth(
      row.fill,
      `${Math.max(2, (level.total / maxTotal) * 100)}%`,
    )
    if (row.fill.dataset.side !== side) {
      row.fill.dataset.side = side
    }
  })
}

function renderSnapshot(snapshot: OrderBookSnapshot): void {
  const asks = aggregateOrderBookLevels(
    snapshot.asks,
    'ask',
    props.aggregationStep,
    props.selection.pricePrecision,
  )
  const bids = aggregateOrderBookLevels(
    snapshot.bids,
    'bid',
    props.aggregationStep,
    props.selection.pricePrecision,
  )
  renderRows(askRows, asks, 'ask', true)
  renderRows(bidRows, bids, 'bid', false)
  renderRatio(bids, asks)
  if (midPrice.value) {
    writeText(midPrice.value, formatPrice(snapshot.midPrice))
  }
  if (spread.value) {
    writeText(spread.value, `Spread ${formatPrice(snapshot.spread)}`)
  }
  publishRealtimePrice({
    provider: snapshot.provider,
    market: snapshot.market,
    symbol: snapshot.symbol,
    value: snapshot.midPrice,
  })
  const now = Date.now()
  if (now - lastMetricsAt >= 500) {
    lastMetricsAt = now
    emit('latency', Math.max(0, now - snapshot.eventTime))
  }
}

function formatRatio(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

function renderRatio(
  bids: readonly OrderBookLevel[],
  asks: readonly OrderBookLevel[],
): void {
  const ratio = calculateOrderBookRatio(
    bids,
    asks,
    ROW_COUNT,
  )
  if (!ratio) {
    clearRatio()
    return
  }
  const buyText = formatRatio(ratio.buyPercent)
  const sellText = formatRatio(ratio.sellPercent)
  if (buyRatioText.value) {
    writeText(buyRatioText.value, `Compra ${buyText}%`)
  }
  if (sellRatioText.value) {
    writeText(sellRatioText.value, `${sellText}% Venda`)
  }
  if (ratioFill.value) {
    writeWidth(ratioFill.value, `${ratio.buyPercent.toFixed(2)}%`)
  }
  if (ratioTrack.value) {
    writeAttribute(
      ratioTrack.value,
      'aria-label',
      `Liquidez visível: compra ${buyText}%, venda ${sellText}%`,
    )
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
  scheduleFrame()
}

function scheduleFrame(): void {
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

function formatAggregatedPrice(value: number): string {
  return value.toFixed(aggregationPrecision(props.aggregationStep))
}

function changeAggregation(event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value) && value > 0) {
    emit('aggregationStep', value)
  }
}

function writeText(element: HTMLElement, value: string): void {
  if (element.textContent !== value) {
    element.textContent = value
  }
}

function writeWidth(element: HTMLElement, value: string): void {
  if (element.style.width !== value) {
    element.style.width = value
  }
}

function writeAttribute(
  element: HTMLElement,
  name: string,
  value: string,
): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value)
  }
}

function clearRatio(): void {
  if (buyRatioText.value) writeText(buyRatioText.value, 'Compra —')
  if (sellRatioText.value) writeText(sellRatioText.value, '— Venda')
  if (ratioFill.value) writeWidth(ratioFill.value, '50%')
  if (ratioTrack.value) {
    writeAttribute(
      ratioTrack.value,
      'aria-label',
      'Liquidez de compra e venda indisponível',
    )
  }
}

function clearBook(): void {
  latestSnapshot = null
  lastUpdateID = 0
  lastMetricsAt = 0
  renderRows(askRows, [], 'ask', false)
  renderRows(bidRows, [], 'bid', false)
  if (midPrice.value) writeText(midPrice.value, '—')
  if (spread.value) writeText(spread.value, 'Spread —')
  clearRatio()
}

onMounted(() => {
  unsubscribe = onOrderBook(props.sessionId, (snapshot) => {
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

watch(
  () => props.aggregationStep,
  () => {
    if (latestSnapshot) {
      scheduleFrame()
    }
  },
)
</script>

<template>
  <section class="order-book panel">
    <header class="panel-header">
      <h2>LIVRO DE ORDENS</h2>
      <div>
        <button aria-label="Livro combinado" class="active" title="Livro combinado" type="button">
          <Rows3 aria-hidden="true" />
        </button>
        <button aria-label="Livro em colunas" title="Livro em colunas" type="button">
          <Columns3 aria-hidden="true" />
        </button>
        <label
          class="book-aggregation"
          title="Agrupar preços por intervalo"
        >
          <span>Agregação</span>
          <select
            :value="aggregationStep"
            aria-label="Granularidade de preço do livro"
            @change="changeAggregation"
          >
            <option
              v-for="step in aggregationOptions"
              :key="step"
              :value="step"
            >
              {{ formatAggregationStep(step) }}
            </option>
          </select>
        </label>
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
      <span ref="buyRatioText">Compra —</span>
      <i
        ref="ratioTrack"
        aria-label="Liquidez de compra e venda indisponível"
        role="img"
      >
        <b ref="ratioFill" />
      </i>
      <span ref="sellRatioText">— Venda</span>
    </footer>
  </section>
</template>
