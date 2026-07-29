<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle, MarketSelection } from '../../types/market'
import { loadCandles, onCandle } from '../../services/marketData'
import { publishRealtimePrice } from '../../services/realtimePrice'
import ChartToolbar from './ChartToolbar.vue'
import DrawingToolbar from './DrawingToolbar.vue'

const props = defineProps<{
  selection: MarketSelection
}>()

const emit = defineEmits<{
  interval: [value: string]
}>()

const container = ref<HTMLElement | null>(null)
const legend = ref<HTMLElement | null>(null)
const legendOpen = ref<HTMLElement | null>(null)
const legendHigh = ref<HTMLElement | null>(null)
const legendLow = ref<HTMLElement | null>(null)
const legendClose = ref<HTMLElement | null>(null)
const loading = ref(true)
const errorMessage = ref('')
const chart = shallowRef<IChartApi | null>(null)
const candleSeries = shallowRef<ISeriesApi<'Candlestick'> | null>(null)
const volumeSeries = shallowRef<ISeriesApi<'Histogram'> | null>(null)
let unsubscribeCandle: (() => void) | undefined
let lastTimestamp = 0

function candlePoint(candle: Candle): CandlestickData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

function volumePoint(candle: Candle): HistogramData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open
      ? 'rgba(21, 191, 141, 0.44)'
      : 'rgba(241, 75, 88, 0.42)',
  }
}

async function loadHistory(): Promise<void> {
  if (!candleSeries.value || !volumeSeries.value) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  lastTimestamp = 0
  candleSeries.value.setData([])
  volumeSeries.value.setData([])
  try {
    const history = await loadCandles(props.selection, 500)
    const candles = [...new Map(
      history.map((candle) => [candle.time, candle]),
    ).values()].sort((left, right) => left.time - right.time)
    candleSeries.value.setData(candles.map(candlePoint))
    volumeSeries.value.setData(candles.map(volumePoint))
    const lastCandle = candles.at(-1)
    if (lastCandle) {
      lastTimestamp = lastCandle.time
      updateLegend(lastCandle)
    }
    chart.value?.timeScale().fitContent()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    loading.value = false
  }
}

function displaySymbol(): string {
  return `${props.selection.baseAsset}/${props.selection.quoteAsset}`
}

function updateLegend(candle: Candle): void {
  publishRealtimePrice({
    provider: candle.provider,
    market: candle.market,
    symbol: candle.symbol,
    value: candle.close,
  })
  if (!legend.value) {
    return
  }
  const precision = Math.min(props.selection.pricePrecision, 8)
  writeLegendValue(legendOpen.value, candle.open, precision)
  writeLegendValue(legendHigh.value, candle.high, precision)
  writeLegendValue(legendLow.value, candle.low, precision)
  writeLegendValue(legendClose.value, candle.close, precision)
  legend.value.dataset.direction = candle.close >= candle.open ? 'up' : 'down'
}

function writeLegendValue(
  target: HTMLElement | null,
  value: number,
  precision: number,
): void {
  if (!target) {
    return
  }
  const text = value.toFixed(precision)
  if (target.textContent !== text) {
    target.textContent = text
  }
}

function isCurrentSelection(candle: Candle): boolean {
  return candle.provider === props.selection.provider
    && candle.market === props.selection.market
    && candle.symbol === props.selection.symbol
    && candle.interval === props.selection.interval
}

onMounted(() => {
  if (!container.value) {
    return
  }

  const chartApi = createChart(container.value, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: '#061821' },
      textColor: '#8195a3',
      fontFamily: '"JetBrains Mono Variable", "SFMono-Regular", Consolas, monospace',
      fontSize: 12,
    },
    grid: {
      vertLines: { color: '#12303b' },
      horzLines: { color: '#12303b' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: '#5b7280', labelBackgroundColor: '#24414e' },
      horzLine: { color: '#5b7280', labelBackgroundColor: '#24414e' },
    },
    rightPriceScale: {
      borderColor: '#173744',
      scaleMargins: { top: 0.08, bottom: 0.05 },
    },
    timeScale: {
      borderColor: '#173744',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
    },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
  })

  const candles = chartApi.addSeries(CandlestickSeries, {
    upColor: '#24c7ad',
    downColor: '#ef6671',
    borderVisible: false,
    wickUpColor: '#24c7ad',
    wickDownColor: '#ef6671',
    priceLineColor: '#21bfa0',
    lastValueVisible: true,
  }, 0)

  const volume = chartApi.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: false,
    priceLineVisible: false,
  }, 1)
  chartApi.panes()[1]?.setHeight(94)

  chart.value = chartApi
  candleSeries.value = candles
  volumeSeries.value = volume

  unsubscribeCandle = onCandle((candle) => {
    if (!isCurrentSelection(candle)) {
      return
    }
    if (candle.time < lastTimestamp) {
      return
    }
    // Direct incremental writes bypass Vue rendering and preserve the viewport.
    candles.update(candlePoint(candle))
    volume.update(volumePoint(candle))
    lastTimestamp = candle.time
    updateLegend(candle)
  })
})

onBeforeUnmount(() => {
  unsubscribeCandle?.()
  candleSeries.value = null
  volumeSeries.value = null
  chart.value?.remove()
  chart.value = null
})

defineExpose({ loadHistory })
</script>

<template>
  <section class="chart-panel panel">
    <div class="instrument-tabs">
      <button class="active" type="button">
        {{ displaySymbol() }} <small>{{ selection.interval }}</small>
        <span>×</span>
      </button>
      <button class="new-tab" type="button">＋</button>
    </div>
    <ChartToolbar
      :interval="selection.interval"
      @interval="emit('interval', $event)"
    />
    <div class="chart-stage">
      <DrawingToolbar />
      <div ref="container" class="chart-container" />
      <div ref="legend" class="chart-legend">
        <strong>{{ displaySymbol() }} · {{ selection.interval }}</strong>
        <span>O <b ref="legendOpen">—</b></span>
        <span>H <b ref="legendHigh">—</b></span>
        <span>L <b ref="legendLow">—</b></span>
        <span>C <b ref="legendClose">—</b></span>
        <i>LIVE</i>
      </div>
      <div v-if="loading" class="chart-message">Carregando candles…</div>
      <div v-else-if="errorMessage" class="chart-message error">{{ errorMessage }}</div>
      <div class="chart-watermark">
        <strong>{{ displaySymbol() }}</strong>
        <span>{{ selection.interval.toUpperCase() }}</span>
      </div>
      <span class="tradingview-attribution">Charts by TradingView</span>
    </div>
  </section>
</template>
