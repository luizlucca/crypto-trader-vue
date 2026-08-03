<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import {
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createTextWatermark,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LogicalRangeChangeEventHandler,
  type ITextWatermarkPluginApi,
  type MouseEventHandler,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  RoundedCandleSeries,
  type RoundedCandleSeriesApi,
} from '@/plugins/roundedCandles/RoundedCandleSeries'
import type { RoundedCandleData } from '@/plugins/roundedCandles/data'
import type { Candle, MarketSelection } from '@shared/types/market'
import { marketSelectionFingerprint } from '@/domain/marketSelection'
import { useChartIndicators } from '@/composables/useChartIndicators'
import type { IndicatorBars } from '@/services/indicators'
import {
  readIndicatorLayout,
  writeIndicatorLayout,
} from '@/services/indicatorLayout'
import { loadCandles, onCandle } from '@/services/marketData'
import { publishRealtimePrice } from '@/services/realtimePrice'
import { appThemePalette } from '@/services/theme'
import type { ThemePalette } from '@/services/themeCatalog'
import type {
  IndicatorDefinition,
  IndicatorInputs,
  IndicatorPlotStyle,
  AppliedIndicator,
} from '@/domain/indicators'
import ChartToolbar from './ChartToolbar.vue'
import DrawingToolbar from './DrawingToolbar.vue'
import AppliedIndicators from './indicators/AppliedIndicators.vue'
import IndicatorPicker from './indicators/IndicatorPicker.vue'
import IndicatorSettings from './indicators/IndicatorSettings.vue'

const props = defineProps<{
  sessionId: string
  selection: MarketSelection
  initialHistory?: Candle[]
}>()

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
const historyLoading = ref(false)
const errorMessage = ref('')
const historyErrorMessage = ref('')
const indicatorErrorMessage = ref('')
const chart = shallowRef<IChartApi | null>(null)
const candleSeries = shallowRef<RoundedCandleSeriesApi | null>(null)
const volumeSeries = shallowRef<ISeriesApi<'Histogram'> | null>(null)
let watermark: ITextWatermarkPluginApi<Time> | undefined
let unsubscribeCandle: (() => void) | undefined
let releaseVerticalPricePan: (() => void) | undefined
let lastTimestamp = 0
let historyGeneration = 0
let pendingCandle: Candle | undefined
let displayedCandles: Candle[] = []
let historyExhausted = false
let visibleLogicalRangeHandler: LogicalRangeChangeEventHandler | undefined
let crosshairHandler: MouseEventHandler<Time> | undefined

function currentIndicatorBars(): IndicatorBars {
  const count = displayedCandles.length
  const bars: IndicatorBars = {
    time: new Array<number>(count),
    open: new Array<number>(count),
    high: new Array<number>(count),
    low: new Array<number>(count),
    close: new Array<number>(count),
    volume: new Array<number>(count),
  }
  for (let i = 0; i < count; i += 1) {
    const candle = displayedCandles[i]
    bars.time[i] = candle.time
    bars.open[i] = candle.open
    bars.high[i] = candle.high
    bars.low[i] = candle.low
    bars.close[i] = candle.close
    bars.volume[i] = candle.volume
  }
  return bars
}

function showIndicatorError(message: string): void {
  indicatorErrorMessage.value = message
}

/**
 * Indicators read the same candles the chart holds. The arrays are rebuilt per
 * request rather than kept in sync, because a compute happens at most once per
 * in-flight round trip, not once per tick.
 */
const indicators = useChartIndicators({
  chart: () => chart.value,
  candleSeries: () => candleSeries.value,
  bars: currentIndicatorBars,
  onError: showIndicatorError,
})

/**
 * Mirror of the applied indicators for the template only. The indicator data
 * path never touches it: the list changes when the user adds or removes one,
 * not when values update.
 */
const appliedIndicators = shallowRef<AppliedIndicator[]>([])
const pickerOpen = ref(false)
const configuringId = ref<string | null>(null)
/**
 * The instance whose settings are expanded inside the picker.
 *
 * It is already on the chart: choosing an indicator applies it. Collapsing the
 * accordion or closing the panel keeps it, because the chart has been showing
 * it since the click — and a gesture as ordinary as closing a panel must never
 * be what destroys it.
 */
const editingId = ref<string | null>(null)
const diagnostics = import.meta.env.DEV
  ? {
      ind: indicators,
      panes: () => chart.value?.panes().map((p, i) => ({
        i, h: Math.round(p.getHeight()), series: p.getSeries().length,
      })) ?? [],
      series: () => chart.value?.panes().map((p, i) => ({
        i,
        h: Math.round(p.getHeight()),
        s: p.getSeries().map((s) => ({
          n: s.data().length,
          v: (s.options() as { visible?: boolean }).visible !== false,
        })),
      })) ?? [],
    }
  : undefined
if (diagnostics) {
  ;(window as unknown as Record<string, unknown>).__diag = diagnostics
}

function findApplied(instanceId: string | null): AppliedIndicator | undefined {
  if (!instanceId) {
    return undefined
  }
  return appliedIndicators.value.find(
    (entry) => entry.instance.instanceId === instanceId,
  )
}

const configuring = computed(() => findApplied(configuringId.value))
const editing = computed(() => findApplied(editingId.value) ?? null)
const configuringCalculated = computed(() => configuring.value
  ? indicators.hasCalculated(configuring.value.instance.instanceId)
  : false)
const configuringPopulatedPlots = computed(() => configuring.value
  ? indicators.populatedPlots(configuring.value.instance.instanceId)
  : [])
const editingCalculated = computed(() => editing.value
  ? indicators.hasCalculated(editing.value.instance.instanceId)
  : false)
const editingPopulatedPlots = computed(() => editing.value
  ? indicators.populatedPlots(editing.value.instance.instanceId)
  : [])

function loadIndicatorCatalog(): Promise<IndicatorDefinition[]> {
  return indicators.catalog()
}

function openIndicatorPicker(): void {
  pickerOpen.value = true
}

function syncAppliedIndicators(): void {
  appliedIndicators.value = indicators.applied()
  writeIndicatorLayout(
    props.sessionId,
    appliedIndicators.value.map((entry) => entry.instance),
  )
}

/**
 * Reapplies what the tab had before the chart was rebuilt. Changing pair or
 * interval replaces this component, and without this the indicators would be
 * silently dropped along with it.
 */
async function restoreIndicatorLayout(): Promise<void> {
  const saved = readIndicatorLayout(props.sessionId)
  if (saved.length === 0) {
    return
  }
  const catalog = await indicators.catalog()
  const byId = new Map<string, IndicatorDefinition>()
  for (const definition of catalog) {
    byId.set(definition.id, definition)
  }
  for (const instance of saved) {
    const definition = byId.get(instance.definitionId)
    if (definition) {
      indicators.add(definition, instance.inputs, instance)
    }
  }
  syncAppliedIndicators()
}

async function initializeChartData(): Promise<void> {
  await loadHistory()
  if (!chart.value || errorMessage.value) {
    return
  }
  try {
    await restoreIndicatorLayout()
  } catch (error) {
    showIndicatorError(
      error instanceof Error ? error.message : String(error),
    )
  }
}

/** Puts the indicator on the chart and expands its settings. */
function addIndicator(definition: IndicatorDefinition): void {
  const instance = indicators.add(definition)
  if (instance) {
    editingId.value = instance.instanceId
    syncAppliedIndicators()
  }
}

/** Collapses the settings. The indicator stays exactly as it is. */
function collapseEditing(): void {
  editingId.value = null
}

function removeEditing(): void {
  if (editingId.value) {
    removeIndicator(editingId.value)
  }
}

function closePicker(): void {
  editingId.value = null
  pickerOpen.value = false
}

function editingInputs(inputs: IndicatorInputs): void {
  if (editingId.value) {
    applyIndicatorInputs(editingId.value, inputs)
  }
}

function editingStyles(styles: Record<string, IndicatorPlotStyle>): void {
  if (editingId.value) {
    applyIndicatorStyles(editingId.value, styles)
  }
}

function removeIndicator(instanceId: string): void {
  indicators.remove(instanceId)
  if (configuringId.value === instanceId) {
    configuringId.value = null
  }
  if (editingId.value === instanceId) {
    editingId.value = null
  }
  syncAppliedIndicators()
}

function applyIndicatorInputs(
  instanceId: string,
  inputs: IndicatorInputs,
): void {
  indicators.updateInputs(instanceId, inputs)
  syncAppliedIndicators()
}

function applyIndicatorStyles(
  instanceId: string,
  styles: Record<string, IndicatorPlotStyle>,
): void {
  indicators.updateStyles(instanceId, styles)
  syncAppliedIndicators()
}

defineExpose({
  /** Ctrl/Cmd+I, forwarded from the workspace shortcut handler. */
  openIndicatorPicker,
})

const INITIAL_HISTORY_SIZE = 500
const HISTORY_PAGE_SIZE = 400
const HISTORY_PREFETCH_THRESHOLD = 8
const INITIAL_VISIBLE_BARS = 100
const INITIAL_RIGHT_SPACE_BARS = 4

const enabledScaleInteractions = {
  axisPressedMouseMove: { time: true, price: true },
  axisDoubleClickReset: { time: true, price: true },
  mouseWheel: true,
  pinch: true,
} as const

const enabledScrollInteractions = {
  mouseWheel: true,
  pressedMouseMove: true,
  horzTouchDrag: true,
  vertTouchDrag: true,
} as const

function candlePoint(candle: Candle): RoundedCandleData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

function volumePoint(
  candle: Candle,
  palette = appThemePalette.value,
): HistogramData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open
      ? palette.volumeUp
      : palette.volumeDown,
  }
}

function rememberDisplayedCandle(candle: Candle): void {
  const lastIndex = displayedCandles.length - 1
  const last = displayedCandles[lastIndex]
  if (last?.time === candle.time) {
    displayedCandles[lastIndex] = candle
  } else if (!last || candle.time > last.time) {
    displayedCandles.push(candle)
  }
}

/** De-duplicates exchange pages and restores the chart's required order. */
function uniqueSortedCandles(
  source: readonly Candle[],
  beforeTime = Number.POSITIVE_INFINITY,
): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const candle of source) {
    if (candle.time < beforeTime) {
      byTime.set(candle.time, candle)
    }
  }
  const unique = Array.from(byTime.values())
  unique.sort((left, right) => left.time - right.time)
  return unique
}

function setChartInteractionsLocked(locked: boolean): void {
  chart.value?.applyOptions({
    handleScale: locked
      ? {
          axisPressedMouseMove: false,
          axisDoubleClickReset: false,
          mouseWheel: false,
          pinch: false,
        }
      : enabledScaleInteractions,
    handleScroll: locked
      ? {
          mouseWheel: false,
          pressedMouseMove: false,
          horzTouchDrag: false,
          vertTouchDrag: false,
        }
      : enabledScrollInteractions,
  })
}

function showInitialCandleWindow(candleCount: number): void {
  if (candleCount < 1) {
    return
  }
  chart.value?.timeScale().setVisibleLogicalRange({
    from: Math.max(0, candleCount - INITIAL_VISIBLE_BARS),
    to: candleCount - 1 + INITIAL_RIGHT_SPACE_BARS,
  })
}

async function loadHistory(): Promise<void> {
  if (!candleSeries.value || !volumeSeries.value) {
    return
  }

  loading.value = true
  historyLoading.value = false
  errorMessage.value = ''
  historyErrorMessage.value = ''
  indicatorErrorMessage.value = ''
  historyExhausted = false
  lastTimestamp = 0
  pendingCandle = undefined
  displayedCandles = []
  const generation = ++historyGeneration
  const fingerprint = selectionFingerprint()
  candleSeries.value.setData([])
  volumeSeries.value.setData([])
  try {
    const cachedHistory = props.initialHistory
    const hasCachedHistory = Boolean(cachedHistory?.length)
    const history = cachedHistory?.length
      ? cachedHistory
      : await loadCandles(props.selection, INITIAL_HISTORY_SIZE)
    if (
      generation !== historyGeneration
      || fingerprint !== selectionFingerprint()
    ) {
      return
    }
    const candles = uniqueSortedCandles(history)
    historyExhausted = !hasCachedHistory
      && candles.length < INITIAL_HISTORY_SIZE
    displayedCandles = candles
    candleSeries.value.setData(candles.map(candlePoint))
    volumeSeries.value.setData(candles.map((candle) => volumePoint(candle)))
    const lastCandle = candles.at(-1)
    if (lastCandle) {
      lastTimestamp = lastCandle.time
      updateLegend(lastCandle)
    }
    const latestPendingCandle = readPendingCandle()
    if (latestPendingCandle && latestPendingCandle.time >= lastTimestamp) {
      candleSeries.value.update(candlePoint(latestPendingCandle))
      volumeSeries.value.update(volumePoint(latestPendingCandle))
      lastTimestamp = latestPendingCandle.time
      rememberDisplayedCandle(latestPendingCandle)
      updateLegend(latestPendingCandle)
    }
    emit('history', props.sessionId, fingerprint, candles)
    showInitialCandleWindow(displayedCandles.length)
    indicators.invalidate()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (generation === historyGeneration) {
      loading.value = false
    }
  }
}

async function loadOlderHistory(): Promise<void> {
  const candles = candleSeries.value
  const volume = volumeSeries.value
  const chartApi = chart.value
  const oldest = displayedCandles[0]
  if (
    !candles
    || !volume
    || !chartApi
    || !oldest
    || loading.value
    || historyLoading.value
    || historyExhausted
  ) {
    return
  }

  const generation = historyGeneration
  const fingerprint = selectionFingerprint()
  const visibleRange = chartApi.timeScale().getVisibleLogicalRange()
  historyLoading.value = true
  historyErrorMessage.value = ''
  setChartInteractionsLocked(true)

  try {
    const page = await loadCandles(
      props.selection,
      HISTORY_PAGE_SIZE,
      oldest.time,
    )
    if (
      generation !== historyGeneration
      || fingerprint !== selectionFingerprint()
    ) {
      return
    }

    const olderCandles = uniqueSortedCandles(page, oldest.time)

    if (olderCandles.length === 0) {
      historyExhausted = true
      return
    }

    // Replacing the full data set is the supported prepend operation in
    // Lightweight Charts. The renderer keeps processing live updates while
    // the REST request runs in Electron's utility process.
    displayedCandles = [...olderCandles, ...displayedCandles]
    candles.setData(displayedCandles.map(candlePoint))
    volume.setData(displayedCandles.map((candle) => volumePoint(candle)))

    // Prepending shifts every previous logical index by the inserted count.
    // Restoring that shifted range keeps the same candles under the cursor.
    if (visibleRange) {
      chartApi.timeScale().setVisibleLogicalRange({
        from: visibleRange.from + olderCandles.length,
        to: visibleRange.to + olderCandles.length,
      })
    }
    historyExhausted = page.length < HISTORY_PAGE_SIZE
    indicators.invalidate()
  } catch (error) {
    historyErrorMessage.value = error instanceof Error
      ? error.message
      : String(error)
  } finally {
    if (generation === historyGeneration) {
      historyLoading.value = false
      setChartInteractionsLocked(false)
    }
  }
}

function handleVisibleLogicalRangeChange(
  range: Parameters<LogicalRangeChangeEventHandler>[0],
): void {
  if (
    !range
    || loading.value
    || historyLoading.value
    || historyExhausted
  ) {
    return
  }
  const bars = candleSeries.value?.barsInLogicalRange(range)
  if (bars && bars.barsBefore <= HISTORY_PREFETCH_THRESHOLD) {
    void loadOlderHistory()
  }
}

function selectionFingerprint(): string {
  return marketSelectionFingerprint(props.selection)
}

/**
 * `loadHistory` clears `pendingCandle` before awaiting, so control-flow
 * analysis narrows it to `undefined` for the rest of that function and cannot
 * see the realtime callback that reassigns it. Reading through a call defeats
 * the narrowing without widening the variable's declared type.
 */
function readPendingCandle(): Candle | undefined {
  return pendingCandle
}

function displaySymbol(): string {
  return `${props.selection.baseAsset}/${props.selection.quoteAsset}`
}

function watermarkLines(palette: ThemePalette) {
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

function applyChartTheme(palette: ThemePalette): void {
  chart.value?.applyOptions({
    layout: {
      background: {
        type: ColorType.Solid,
        color: palette.chartBackground,
      },
      textColor: palette.chartText,
    },
    grid: {
      vertLines: { color: palette.chartGrid },
      horzLines: { color: palette.chartGrid },
    },
    crosshair: {
      vertLine: {
        color: palette.chartCrosshair,
        labelBackgroundColor: palette.chartCrosshairLabel,
      },
      horzLine: {
        color: palette.chartCrosshair,
        labelBackgroundColor: palette.chartCrosshairLabel,
      },
    },
    rightPriceScale: { borderColor: palette.chartBorder },
    timeScale: { borderColor: palette.chartBorder },
  })
  candleSeries.value?.applyOptions({
    color: palette.candleUp,
    upColor: palette.candleUp,
    downColor: palette.candleDown,
    wickUpColor: palette.candleUp,
    wickDownColor: palette.candleDown,
    priceLineColor: palette.positive,
  })
  watermark?.applyOptions({ lines: watermarkLines(palette) })

  if (volumeSeries.value && displayedCandles.length > 0) {
    const visibleRange = chart.value?.timeScale().getVisibleLogicalRange()
    volumeSeries.value.setData(
      displayedCandles.map((candle) => volumePoint(candle, palette)),
    )
    if (visibleRange) {
      chart.value?.timeScale().setVisibleLogicalRange(visibleRange)
    }
  }

  // The catalog's own colours are resolved against the surface they land on,
  // so a new theme can turn a readable line into an invisible one.
  indicators.retheme()
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

  const palette = appThemePalette.value
  const chartApi = createChart(container.value, {
    autoSize: true,
    layout: {
      background: {
        type: ColorType.Solid,
        color: palette.chartBackground,
      },
      textColor: palette.chartText,
      fontFamily: '"JetBrains Mono Variable", "SFMono-Regular", '
        + 'Consolas, monospace',
      fontSize: 12,
    },
    grid: {
      vertLines: { color: palette.chartGrid },
      horzLines: { color: palette.chartGrid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: palette.chartCrosshair,
        labelBackgroundColor: palette.chartCrosshairLabel,
      },
      horzLine: {
        color: palette.chartCrosshair,
        labelBackgroundColor: palette.chartCrosshairLabel,
      },
    },
    rightPriceScale: {
      borderColor: palette.chartBorder,
      scaleMargins: { top: 0.08, bottom: 0.05 },
    },
    timeScale: {
      borderColor: palette.chartBorder,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 8,
      barSpacing: 8,
    },
    handleScale: enabledScaleInteractions,
    handleScroll: enabledScrollInteractions,
  })

  const candles = chartApi.addCustomSeries(new RoundedCandleSeries(), {
    color: palette.candleUp,
    upColor: palette.candleUp,
    downColor: palette.candleDown,
    wickUpColor: palette.candleUp,
    wickDownColor: palette.candleDown,
    wickVisible: true,
    priceLineColor: palette.positive,
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
  visibleLogicalRangeHandler = handleVisibleLogicalRangeChange
  chartApi.timeScale().subscribeVisibleLogicalRangeChange(
    visibleLogicalRangeHandler,
  )

  /*
   * Indicator values under the cursor. The handler fires on every pointer
   * move: it hands the series map straight to the indicators, which write the
   * formatted numbers into their own legend nodes. Nothing reactive is touched
   * on this path (ADR-0003).
   */
  crosshairHandler = (param: Parameters<MouseEventHandler<Time>>[0]) => {
    indicators.readCursor(
      param.seriesData as unknown as Map<ISeriesApi<SeriesType>, unknown>,
    )
  }
  chartApi.subscribeCrosshairMove(crosshairHandler)

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
    rememberDisplayedCandle(candle)
    updateLegend(candle)
    indicators.refresh({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })
  })

  // The chart owns its initial load. This avoids a parent-ref race while
  // Vue replaces keyed chart instances during tab and interval changes.
  void initializeChartData()
})

onBeforeUnmount(() => {
  const diagnosticTarget = window as unknown as Record<string, unknown>
  if (diagnostics && diagnosticTarget.__diag === diagnostics) {
    delete diagnosticTarget.__diag
  }
  indicators.dispose()
  historyGeneration += 1
  if (visibleLogicalRangeHandler) {
    chart.value?.timeScale().unsubscribeVisibleLogicalRangeChange(
      visibleLogicalRangeHandler,
    )
    visibleLogicalRangeHandler = undefined
  }
  if (crosshairHandler) {
    chart.value?.unsubscribeCrosshairMove(crosshairHandler)
    crosshairHandler = undefined
  }
  releaseVerticalPricePan?.()
  releaseVerticalPricePan = undefined
  unsubscribeCandle?.()
  candleSeries.value = null
  volumeSeries.value = null
  displayedCandles = []
  watermark = undefined
  chart.value?.remove()
  chart.value = null
})

watch(appThemePalette, applyChartTheme, { flush: 'sync' })

</script>

<template>
  <section class="chart-panel">
    <ChartToolbar
      :indicator-count="appliedIndicators.length"
      :interval="selection.interval"
      @indicators="openIndicatorPicker"
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
      <div v-if="errorMessage" class="chart-message error">
        {{ errorMessage }}
      </div>
      <div
        v-if="historyErrorMessage && !loading && !historyLoading"
        class="chart-history-error"
      >
        <span>Falha ao carregar candles anteriores.</span>
        <button type="button" @click="loadOlderHistory">
          Tentar novamente
        </button>
      </div>
      <div
        v-else-if="indicatorErrorMessage && !loading && !historyLoading"
        class="chart-history-error"
      >
        <span>{{ indicatorErrorMessage }}</span>
        <button type="button" @click="indicatorErrorMessage = ''">
          Dispensar
        </button>
      </div>
      <AppliedIndicators
        :applied="appliedIndicators"
        @configure="configuringId = $event"
        @remove="removeIndicator"
      />
      <IndicatorSettings
        v-if="configuring"
        :key="configuring.instance.instanceId"
        :definition="configuring.definition"
        :inputs="configuring.instance.inputs"
        :calculated="configuringCalculated"
        :populated-plots="configuringPopulatedPlots"
        :styles="configuring.instance.styles"
        @close="configuringId = null"
        @inputs="applyIndicatorInputs(configuring.instance.instanceId, $event)"
        @styles="applyIndicatorStyles(configuring.instance.instanceId, $event)"
      />
      <span class="tradingview-attribution">Charts by TradingView</span>
    </div>
    <div
      v-if="loading || historyLoading"
      class="chart-interaction-lock"
      role="status"
      aria-live="polite"
      aria-busy="true"
      @pointerdown.prevent
      @wheel.prevent
      @dblclick.prevent
      @contextmenu.prevent
    >
      <span class="chart-loading-spinner" aria-hidden="true" />
      <strong>
        {{ historyLoading
          ? `Carregando ${HISTORY_PAGE_SIZE} candles anteriores…`
          : 'Carregando candles…' }}
      </strong>
      <small>
        O gráfico será liberado assim que o histórico estiver pronto.
      </small>
    </div>
    <IndicatorPicker
      :applied="appliedIndicators"
      :load="loadIndicatorCatalog"
      :open="pickerOpen"
      :calculated="editingCalculated"
      :populated-plots="editingPopulatedPlots"
      :editing="editing"
      @apply="addIndicator"
      @close="closePicker"
      @collapse="collapseEditing"
      @inputs="editingInputs"
      @remove="removeEditing"
      @styles="editingStyles"
    />
  </section>
</template>
