<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createTextWatermark,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type ITextWatermarkPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  RoundedCandleSeries,
  type RoundedCandleSeriesApi,
} from '../../plugins/roundedCandles/RoundedCandleSeries'
import type { RoundedCandleData } from '../../plugins/roundedCandles/data'
import type { Candle, MarketSelection } from '../../types/market'
import { loadCandles, onCandle } from '../../services/marketData'
import { publishRealtimePrice } from '../../services/realtimePrice'
import { appTheme, type AppTheme } from '../../services/theme'
import ChartToolbar from './ChartToolbar.vue'
import DrawingToolbar from './DrawingToolbar.vue'

const props = defineProps<{
  sessionId: string
  selection: MarketSelection
  initialHistory?: Candle[]
}>()

const CANDLE_UP_COLOR = '#24c7ad'
const CANDLE_DOWN_COLOR = '#ef6671'

const emit = defineEmits<{
  interval: [value: string]
  history: [sessionId: string, fingerprint: string, candles: Candle[]]
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
const candleSeries = shallowRef<RoundedCandleSeriesApi | null>(null)
const volumeSeries = shallowRef<ISeriesApi<'Histogram'> | null>(null)
let watermark: ITextWatermarkPluginApi<Time> | undefined
let unsubscribeCandle: (() => void) | undefined
let releaseVerticalPricePan: (() => void) | undefined
let lastTimestamp = 0
let historyGeneration = 0
let pendingCandle: Candle | undefined

interface ChartThemePalette {
  background: string
  text: string
  grid: string
  border: string
  crosshair: string
  crosshairLabel: string
  watermarkPrimary: string
  watermarkSecondary: string
}

const CHART_THEME: Record<AppTheme, ChartThemePalette> = {
  dark: {
    background: '#061821',
    text: '#8195a3',
    grid: '#12303b',
    border: '#173744',
    crosshair: '#5b7280',
    crosshairLabel: '#24414e',
    watermarkPrimary: 'rgba(132, 158, 171, 0.10)',
    watermarkSecondary: 'rgba(132, 158, 171, 0.075)',
  },
  light: {
    background: '#f8fbfc',
    text: '#526975',
    grid: '#dce7eb',
    border: '#bfd0d7',
    crosshair: '#718995',
    crosshairLabel: '#526975',
    watermarkPrimary: 'rgba(45, 76, 91, 0.085)',
    watermarkSecondary: 'rgba(45, 76, 91, 0.065)',
  },
}

function candlePoint(candle: Candle): RoundedCandleData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    color: candle.close >= candle.open
      ? CANDLE_UP_COLOR
      : CANDLE_DOWN_COLOR,
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
  pendingCandle = undefined
  const generation = ++historyGeneration
  const fingerprint = selectionFingerprint()
  candleSeries.value.setData([])
  volumeSeries.value.setData([])
  try {
    const history = props.initialHistory?.length
      ? props.initialHistory
      : await loadCandles(props.selection, 500)
    if (
      generation !== historyGeneration
      || fingerprint !== selectionFingerprint()
    ) {
      return
    }
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
    const latestPendingCandle = currentPendingCandle()
    if (
      latestPendingCandle
      && latestPendingCandle.time >= lastTimestamp
    ) {
      candleSeries.value.update(candlePoint(latestPendingCandle))
      volumeSeries.value.update(volumePoint(latestPendingCandle))
      lastTimestamp = latestPendingCandle.time
      updateLegend(latestPendingCandle)
    }
    emit('history', props.sessionId, fingerprint, candles)
    chart.value?.timeScale().fitContent()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (generation === historyGeneration) {
      loading.value = false
    }
  }
}

function selectionFingerprint(): string {
  return [
    props.selection.provider,
    props.selection.market,
    props.selection.symbol,
    props.selection.interval,
  ].join(':')
}

function currentPendingCandle(): Candle | undefined {
  return pendingCandle
}

function displaySymbol(): string {
  return `${props.selection.baseAsset}/${props.selection.quoteAsset}`
}

function watermarkLines(palette: ChartThemePalette) {
  return [
    {
      text: displaySymbol(),
      color: palette.watermarkPrimary,
      fontSize: 46,
      lineHeight: 54,
      fontFamily: '"Inter Variable", Inter, sans-serif',
      fontStyle: '700',
    },
    {
      text: props.selection.interval.toUpperCase(),
      color: palette.watermarkSecondary,
      fontSize: 22,
      lineHeight: 30,
      fontFamily: '"JetBrains Mono Variable", monospace',
      fontStyle: '600',
    },
  ]
}

function applyChartTheme(theme: AppTheme): void {
  const palette = CHART_THEME[theme]
  chart.value?.applyOptions({
    layout: {
      background: { type: ColorType.Solid, color: palette.background },
      textColor: palette.text,
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid },
    },
    crosshair: {
      vertLine: {
        color: palette.crosshair,
        labelBackgroundColor: palette.crosshairLabel,
      },
      horzLine: {
        color: palette.crosshair,
        labelBackgroundColor: palette.crosshairLabel,
      },
    },
    rightPriceScale: { borderColor: palette.border },
    timeScale: { borderColor: palette.border },
  })
  watermark?.applyOptions({ lines: watermarkLines(palette) })
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

  const palette = CHART_THEME[appTheme.value]
  const chartApi = createChart(container.value, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: palette.background },
      textColor: palette.text,
      fontFamily: '"JetBrains Mono Variable", "SFMono-Regular", Consolas, monospace',
      fontSize: 12,
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: palette.crosshair,
        labelBackgroundColor: palette.crosshairLabel,
      },
      horzLine: {
        color: palette.crosshair,
        labelBackgroundColor: palette.crosshairLabel,
      },
    },
    rightPriceScale: {
      borderColor: palette.border,
      scaleMargins: { top: 0.08, bottom: 0.05 },
    },
    timeScale: {
      borderColor: palette.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
    },
    handleScale: {
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: { time: true, price: true },
      mouseWheel: true,
      pinch: true,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
  })

  const candles = chartApi.addCustomSeries(new RoundedCandleSeries(), {
    color: CANDLE_UP_COLOR,
    upColor: CANDLE_UP_COLOR,
    downColor: CANDLE_DOWN_COLOR,
    wickUpColor: CANDLE_UP_COLOR,
    wickDownColor: CANDLE_DOWN_COLOR,
    wickVisible: true,
    priceLineColor: '#21bfa0',
    lastValueVisible: true,
    radius: (barSpacing: number) => barSpacing < 4
      ? 0
      : Math.min(4, barSpacing / 3),
  }, 0)

  const volume = chartApi.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: false,
    priceLineVisible: false,
  }, 1)
  chartApi.panes()[1]?.setHeight(94)

  const mainPane = chartApi.panes()[0]
  if (mainPane) {
    watermark = createTextWatermark(mainPane, {
      visible: true,
      horzAlign: 'center',
      vertAlign: 'center',
      lines: watermarkLines(palette),
    })

    const paneElement = mainPane.getHTMLElement()
    if (paneElement) {
      const enablePricePan = (event: PointerEvent) => {
        if (
          !event.isPrimary
          || event.button !== 0
          || event.clientX >= (
            paneElement.getBoundingClientRect().right
            - candles.priceScale().width()
          )
        ) {
          return
        }

        // Lightweight Charts only pans the Y axis after auto scale is off.
        // Switching modes before its native drag handler lets one gesture move
        // time and price without a second renderer or per-frame Vue updates.
        candles.priceScale().setAutoScale(false)
      }
      paneElement.addEventListener('pointerdown', enablePricePan, {
        capture: true,
        passive: true,
      })
      releaseVerticalPricePan = () => {
        paneElement.removeEventListener('pointerdown', enablePricePan, true)
      }
    }
  }

  chart.value = chartApi
  candleSeries.value = candles
  volumeSeries.value = volume

  unsubscribeCandle = onCandle(props.sessionId, (candle) => {
    if (!isCurrentSelection(candle)) {
      return
    }
    if (loading.value) {
      if (!pendingCandle || candle.time >= pendingCandle.time) {
        pendingCandle = candle
      }
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

  // The chart owns its initial load. This avoids a parent-ref race while
  // Vue replaces keyed chart instances during tab and interval changes.
  void loadHistory()
})

onBeforeUnmount(() => {
  historyGeneration += 1
  releaseVerticalPricePan?.()
  releaseVerticalPricePan = undefined
  unsubscribeCandle?.()
  candleSeries.value = null
  volumeSeries.value = null
  watermark = undefined
  chart.value?.remove()
  chart.value = null
})

watch(appTheme, applyChartTheme, { flush: 'sync' })

</script>

<template>
  <section class="chart-panel">
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
      <span class="tradingview-attribution">Charts by TradingView</span>
    </div>
  </section>
</template>
