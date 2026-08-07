<script setup lang="ts">
import { PanelBottom, PanelRight, PanelTop, Rows3 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  MarketSelection,
  OrderBookLevel,
  OrderBookSnapshot,
} from '@shared/types/market'
import { onOrderBook } from '@desktop/marketData'
import { setOrderBookPanelVisible } from '@app/services/panelVisibility'
import { publishRealtimePrice } from '@market/services/realtimePrice'
import { publishStreamLatency } from '@market/services/streamLatency'
import {
  ORDER_BOOK_ROWS_BOTH_SIDES,
  ORDER_BOOK_ROWS_PER_SIDE,
  aggregationPrecision,
  createAggregationOptions,
  formatAggregationStep,
} from '@shared/domain/orderBook'
import { calculateOrderBookRatio } from '@shared/domain/orderBookRatio'

/**
 * Which sides the book is showing.
 *
 * A one-sided view is not a filter, it is a different reading: with the panel
 * to itself, a side shows twice the depth. The provider already fills the
 * larger count, so switching costs nothing beyond the rows the renderer writes.
 */
type BookView = 'both' | 'asks' | 'bids'

const VIEW_STORAGE_KEY = 'cryptopro.order-book.view.v1'

/** The ratio always weighs the same top levels, whatever the view shows. */
const ROW_COUNT = ORDER_BOOK_ROWS_BOTH_SIDES

function readStoredView(): BookView {
  try {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'asks' || stored === 'bids' ? stored : 'both'
  } catch {
    return 'both'
  }
}

const props = defineProps<{
  sessionId: string
  selection: MarketSelection
  aggregationStep: number
}>()
const emit = defineEmits<{
  aggregationStep: [value: number]
}>()
const view = ref<BookView>(readStoredView())
const visibleRows = computed(() => (
  view.value === 'both' ? ORDER_BOOK_ROWS_BOTH_SIDES : ORDER_BOOK_ROWS_PER_SIDE
))
const askIndexes = computed(() => (
  view.value === 'bids'
    ? []
    : Array.from({ length: visibleRows.value }, (_, index) => index)
))
const bidIndexes = computed(() => (
  view.value === 'asks'
    ? []
    : Array.from({ length: visibleRows.value }, (_, index) => index)
))

function selectView(next: BookView): void {
  view.value = next
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, next)
  } catch {
    // Storage can be unavailable; the choice still holds for this session.
  }
}
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

/** Digit counts resolved once per frame instead of once per row. */
interface RowPrecision {
  price: number
  quantity: number
}

function renderRows(
  elements: Array<BookRowElements | undefined>,
  levels: OrderBookLevel[],
  side: 'ask' | 'bid',
  reverse: boolean,
  precision: RowPrecision,
  rows: number,
): void {
  const visibleLevelCount = Math.min(rows, levels.length)
  let maxTotal = 1
  for (let index = 0; index < visibleLevelCount; index += 1) {
    maxTotal = Math.max(maxTotal, levels[index].total)
  }

  elements.forEach((row, index) => {
    if (!row) {
      return
    }
    /*
     * When fewer levels arrive than there are rows, the blanks belong away
     * from the mid price. The ask side is drawn bottom-up, so it is shifted by
     * the missing count: the best ask stays against the spread and the gap
     * opens at the top, instead of a hole between the asks and the mid.
     */
    const levelIndex = reverse
      ? visibleLevelCount - 1 - (index - (rows - visibleLevelCount))
      : index
    const level = levelIndex >= 0 ? levels[levelIndex] : undefined

    if (!level) {
      writeText(row.price, '—')
      writeText(row.quantity, '—')
      writeText(row.total, '—')
      writeWidth(row.fill, '0%')
      return
    }

    writeText(row.price, level.price.toFixed(precision.price))
    writeText(row.quantity, level.quantity.toFixed(precision.quantity))
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
  // Levels arrive already aggregated from the utility process, which owns the
  // full local book (F-013). The renderer only formats and writes them.
  const precision: RowPrecision = {
    price: aggregationPrecision(props.aggregationStep),
    quantity: Math.min(props.selection.quantityPrecision, 8),
  }
  const rows = visibleRows.value
  renderRows(askRows, snapshot.asks, 'ask', true, precision, rows)
  renderRows(bidRows, snapshot.bids, 'bid', false, precision, rows)
  renderRatio(snapshot.bids, snapshot.asks)
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
    // Imperative channel, never a Vue emit: see services/streamLatency.ts.
    publishStreamLatency(props.sessionId, now - snapshot.eventTime)
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
  const empty: RowPrecision = { price: 0, quantity: 0 }
  renderRows(askRows, [], 'ask', false, empty, 0)
  renderRows(bidRows, [], 'bid', false, empty, 0)
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
  [() => props.aggregationStep, view],
  () => {
    if (latestSnapshot) {
      // The rows that just appeared are empty until the next snapshot, and on
      // a quiet market that could be seconds away.
      scheduleFrame()
    }
  },
  { flush: 'post' },
)
</script>

<template>
  <section class="order-book panel">
    <header class="panel-header">
      <h2>LIVRO DE ORDENS</h2>
      <button
        aria-label="Ocultar Livro de ordens"
        class="panel-hide"
        title="Ocultar Livro de ordens (Ctrl+Shift+B)"
        type="button"
        @click="setOrderBookPanelVisible(false)"
      >
        <PanelRight aria-hidden="true" />
      </button>
    </header>

    <!--
      Second row on purpose: the title plus every control asked for more width
      than the 232px panel has, and giving the controls their own line is what
      lets the panel keep its full name.
    -->
    <div class="book-controls">
      <div class="book-views" role="group" aria-label="Lados exibidos">
        <button
          :aria-pressed="view === 'both'"
          :class="{ active: view === 'both' }"
          aria-label="Compra e venda"
          title="Compra e venda"
          type="button"
          @click="selectView('both')"
        >
          <Rows3 aria-hidden="true" />
        </button>
        <button
          :aria-pressed="view === 'asks'"
          :class="{ active: view === 'asks' }"
          aria-label="Somente venda"
          class="asks"
          title="Somente venda"
          type="button"
          @click="selectView('asks')"
        >
          <PanelTop aria-hidden="true" />
        </button>
        <button
          :aria-pressed="view === 'bids'"
          :class="{ active: view === 'bids' }"
          aria-label="Somente compra"
          class="bids"
          title="Somente compra"
          type="button"
          @click="selectView('bids')"
        >
          <PanelBottom aria-hidden="true" />
        </button>
      </div>
      <label class="book-aggregation" title="Agrupar preços por intervalo">
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
    <div class="book-columns">
      <span>Preço ({{ selection.quoteAsset }})</span>
      <span>Qtd ({{ selection.baseAsset }})</span>
      <span>Total ({{ selection.baseAsset }})</span>
    </div>

    <div class="book-side asks">
      <div
        v-for="index in askIndexes"
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
        v-for="index in bidIndexes"
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
