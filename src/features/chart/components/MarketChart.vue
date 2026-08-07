<script setup lang="ts">
import {
  nextTick,
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
  LineSeries,
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
  type WhitespaceData,
} from 'lightweight-charts'
import {
  RoundedCandleSeries,
  type RoundedCandleSeriesApi,
} from '@chart/plugins/rounded-candles/RoundedCandleSeries'
import { candlePoint } from '@chart/plugins/rounded-candles/data'
import type { Candle, MarketSelection } from '@shared/types/market'
import { uniqueSortedCandles } from '@chart/domain/candles'
import { marketSelectionFingerprint } from '@market/domain/marketSelection'
import { useChartIndicators } from '@indicators/composables/useChartIndicators'
import { useChartDrawings } from '@drawings/composables/useChartDrawings'
import { buildDrawingTimeline } from '@drawings/domain/drawingTimeline'
import { useIndicatorPanel } from '@indicators/composables/useIndicatorPanel'
import { useChartTheme, volumePoint } from '@chart/composables/useChartTheme'
import type {
  ChartDrawing,
  DrawingToolId,
} from '@drawings/domain/chartDrawings'
import { defaultDrawingText } from '@drawings/domain/chartDrawings'
import type { TextAppearance } from '@renderer-shared/domain/textAppearance'
import {
  DEFAULT_TEXT_APPEARANCE,
  normalizeTextAppearance,
  sameTextAppearance,
} from '@renderer-shared/domain/textAppearance'
import { readDrawings, writeDrawings } from '@drawings/services/drawingStore'
import type { IndicatorBars } from '@indicators/services/indicators'
import { loadCandles, onCandle } from '@desktop/marketData'
import { publishRealtimePrice } from '@market/services/realtimePrice'
import { appThemePalette } from '@settings/services/theme'
import ChartToolbar from './ChartToolbar.vue'
import DrawingStyleBar from '@drawings/components/DrawingStyleBar.vue'
import DrawingTextInlineEditor
  from '@drawings/components/DrawingTextInlineEditor.vue'
import DrawingToolbar from '@drawings/components/DrawingToolbar.vue'
import AppliedIndicators from '@indicators/components/AppliedIndicators.vue'
import IndicatorPicker from '@indicators/components/IndicatorPicker.vue'
import IndicatorSettings from '@indicators/components/IndicatorSettings.vue'

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
const chartStage = ref<HTMLElement | null>(null)
const drawingStyleBar = ref<{ openProperties: () => void } | null>(null)
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
const drawingAnchorSeries = shallowRef<ISeriesApi<'Line'> | null>(null)
let watermark: ITextWatermarkPluginApi<Time> | undefined
let unsubscribeCandle: (() => void) | undefined
let releaseVerticalPricePan: (() => void) | undefined
let lastTimestamp = 0
let historyGeneration = 0
let pendingCandle: Candle | undefined
let displayedCandles: Candle[] = []
let drawingTimeline: { time: number }[] = []
let drawingSupportTimes: number[] = []
let drawingTimelineFirstCandle = 0
let drawingTimelineLastCandle = 0
let drawingTimelineCandleCount = 0
let drawingTimelineLastCandleIndex = -1
let historyExhausted = false
/*
 * Set when a page failed, and read only by the prefetch.
 *
 * Without it a provider that is down is asked again on every pan: the range
 * handler fires per gesture, each attempt holds the interaction lock until the
 * IPC request times out, and the chart flashes the loading overlay for as long
 * as the operator keeps scrolling. Distinct from `historyExhausted`, which
 * means the asset has no more history — this one means the last try failed and
 * the manual button below the chart is what decides to try again.
 */
let historyRetryBlocked = false
let visibleLogicalRangeHandler: LogicalRangeChangeEventHandler | undefined
let crosshairHandler: MouseEventHandler<Time> | undefined
/*
 * Anchors are placed from the DOM, not from `subscribeClick`: the chart drops
 * any second click inside its 500 ms double-click window, which is exactly the
 * cadence of placing the two points of a trend line.
 *
 * The releaser closes over the element the listeners were bound to instead of
 * reading the template ref again at teardown, so the pair cannot survive an
 * unmount that clears the ref first.
 */
let releaseDrawingPointer: (() => void) | undefined

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

/*
 * Named at the top level so the template keeps unwrapping them. A ref reached
 * through an object is not unwrapped in a template, and writing `.value` in
 * markup would be the refactor leaking into the part of the file that had no
 * reason to change.
 */
const {
  applied: appliedIndicators,
  presented: presentedIndicators,
  hoveredId: hoveredIndicatorId,
  pickerOpen,
  configuringId,
  configuring,
  editing,
  configuringCalculated,
  configuringPopulatedPlots,
  editingCalculated,
  editingPopulatedPlots,
  catalog: loadIndicatorCatalog,
  openPicker: openIndicatorPicker,
  add: addIndicator,
  remove: removeIndicator,
  collapseEditing,
  removeEditing,
  closePicker,
  editingInputs,
  editingStyles,
  previewReadout: previewIndicatorReadout,
  applyInputs: applyIndicatorInputs,
  applyStyles: applyIndicatorStyles,
  restoreLayout: restoreIndicatorLayout,
} = useIndicatorPanel({
  indicators,
  sessionId: () => props.sessionId,
})

const chartTheme = useChartTheme({
  chart: () => chart.value,
  candleSeries: () => candleSeries.value,
  volumeSeries: () => volumeSeries.value,
  watermark: () => watermark,
  candles: () => displayedCandles,
  symbol: displaySymbol,
  interval: () => props.selection.interval,
  onRetheme: (palette) => indicators.retheme(palette.chartBackground),
})

/**
 * Drawings live on the candle series and are saved per asset: a trend line is
 * manual work, and losing it on restart would be losing the analysis.
 */
let scheduleDrawingRebuild = (): void => {}
const drawings = useChartDrawings({
  chart: () => chart.value,
  series: () => candleSeries.value,
  bars: () => drawingTimeline,
  supportsTime: (time) => time >= (
    drawingTimeline[0]?.time ?? Number.POSITIVE_INFINITY
  ) && time <= (
    drawingTimeline.at(-1)?.time ?? Number.NEGATIVE_INFINITY
  ),
  onChange: (list) => {
    writeDrawings(props.selection, list)
    if (refreshDrawingTimeline(list)) {
      scheduleDrawingRebuild()
    }
  },
})
scheduleDrawingRebuild = () => requestAnimationFrame(() => drawings.rebuild())

interface InlineTextEditor {
  drawingId: string
  originalText: string
  originalAppearance: TextAppearance
  left: number
  top: number
}

const inlineTextEditor = shallowRef<InlineTextEditor | null>(null)

function closeInlineTextEditor(): void {
  inlineTextEditor.value = null
}

function openInlineTextEditor(event: MouseEvent): boolean {
  const pane = candleSeries.value?.getPane().getHTMLElement()
  const stage = chartStage.value
  if (!pane || !stage) {
    return false
  }
  const paneBounds = pane.getBoundingClientRect()
  const drawing = drawings.selectTextAt(
    event.clientX - paneBounds.left,
    event.clientY - paneBounds.top,
  )
  if (!drawing) {
    return false
  }
  const bounds = stage.getBoundingClientRect()
  const editorWidth = Math.min(320, Math.max(220, bounds.width - 16))
  const editorHeight = 142
  const left = Math.max(8, Math.min(
    event.clientX - bounds.left + 10,
    bounds.width - editorWidth - 8,
  ))
  const top = Math.max(8, Math.min(
    event.clientY - bounds.top + 10,
    bounds.height - editorHeight - 8,
  ))
  inlineTextEditor.value = {
    drawingId: drawing.id,
    originalText: drawing.configuration?.text
      ?? defaultDrawingText(drawing.tool),
    originalAppearance: normalizeTextAppearance(
      drawing.configuration?.textAppearance ?? DEFAULT_TEXT_APPEARANCE,
    ),
    left,
    top,
  }
  return true
}

function saveInlineText(
  value: { text: string, appearance: TextAppearance },
  openSettings = false,
): void {
  const editor = inlineTextEditor.value
  if (!editor) {
    return
  }
  if (
    drawings.selected.value?.id === editor.drawingId
    && (
      value.text !== editor.originalText
      || !sameTextAppearance(value.appearance, editor.originalAppearance)
    )
  ) {
    drawings.configureSelected({
      text: value.text,
      textAppearance: value.appearance,
    })
  }
  closeInlineTextEditor()
  if (openSettings) {
    void nextTick(() => drawingStyleBar.value?.openProperties())
  }
}

watch(() => drawings.selected.value?.id, (selectedId) => {
  if (
    inlineTextEditor.value
    && inlineTextEditor.value.drawingId !== selectedId
  ) {
    closeInlineTextEditor()
  }
})

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

/**
 * Arming a tool takes the keyboard too: Esc is the universal way out of a
 * drawing mode, and leaving it armed after a mistaken click is a trap.
 */
function selectDrawingTool(tool: DrawingToolId | null): void {
  closeInlineTextEditor()
  drawings.select(tool)
}

/**
 * Esc leaves whatever drawing mode is on: an armed tool first, then a
 * selection. Delete removes the selected drawing — but never while the
 * operator is typing, or renaming a tab would delete a trend line.
 */
function cancelDrawingOnEscape(event: KeyboardEvent): void {
  const typing = event.target instanceof HTMLElement
    && (event.target.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName))
  if (typing) {
    return
  }
  if (event.key === 'Enter' && drawings.finishActive()) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  if (event.key === 'Escape' && drawings.activeTool.value) {
    event.preventDefault()
    drawings.select(null)
    return
  }
  if (event.key === 'Escape' && drawings.selected.value) {
    event.preventDefault()
    drawings.deselect()
    return
  }
  if (
    (event.key === 'Delete' || event.key === 'Backspace')
    && drawings.selected.value
  ) {
    event.preventDefault()
    drawings.removeSelected()
  }
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

/**
 * The volume bar for a candle, in the palette on screen right now.
 *
 * `volumePoint` takes the palette explicitly so the theme composable stays a
 * translation table; every caller here wants the current one.
 */
function volumeBar(candle: Candle): HistogramData<UTCTimestamp> {
  return volumePoint(candle, appThemePalette.value)
}

function rememberDisplayedCandle(
  candle: Candle,
  knownDrawings: readonly ChartDrawing[] = drawings.drawings(),
): boolean {
  const lastIndex = displayedCandles.length - 1
  const last = displayedCandles[lastIndex]
  if (last?.time === candle.time) {
    displayedCandles[lastIndex] = candle
    return false
  } else if (!last || candle.time > last.time) {
    displayedCandles.push(candle)
    const lastSupportTime = drawingSupportTimes.at(-1)
    const hasFutureDrawingAnchor = lastSupportTime !== undefined
      && lastSupportTime > (last?.time ?? Number.NEGATIVE_INFINITY)
    if (hasFutureDrawingAnchor) {
      refreshDrawingTimeline(knownDrawings)
      return true
    } else {
      drawingTimelineLastCandleIndex = drawingTimeline.length
      drawingTimeline.push({ time: candle.time })
      drawingTimelineLastCandle = candle.time
      drawingTimelineCandleCount = displayedCandles.length
      if (displayedCandles.length === 1) {
        drawingTimelineFirstCandle = candle.time
      }
    }
  }
  return false
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

function showInitialCandleWindow(lastCandleIndex: number): void {
  if (lastCandleIndex < 0) {
    return
  }
  chart.value?.timeScale().setVisibleLogicalRange({
    from: Math.max(0, lastCandleIndex - INITIAL_VISIBLE_BARS + 1),
    to: lastCandleIndex + INITIAL_RIGHT_SPACE_BARS,
  })
}

/**
 * Extends the chart's categorical time scale with drawing anchors outside the
 * loaded candle range.
 *
 * A drawing made on a wide period can predate the 500 bars loaded on a smaller
 * one. Extrapolating a negative logical index leaves it clipped at the first
 * pixel because Lightweight Charts cannot pan before its first time point.
 * Whitespace points make those instants real positions without downloading a
 * huge candle gap or feeding synthetic history into indicators. Future
 * anchors need the same treatment: otherwise a projection drawn in the right
 * margin can become pinned to the last pixel after an interval change.
 */
function refreshDrawingTimeline(
  storedDrawings: readonly ChartDrawing[],
): boolean {
  const firstCandle = displayedCandles[0]?.time ?? Number.POSITIVE_INFINITY
  const lastCandle = displayedCandles.at(-1)?.time ?? 0
  const nextTimeline = buildDrawingTimeline(
    displayedCandles,
    storedDrawings,
    drawingBarSpanSeconds(),
  )
  const nextSupportTimes = nextTimeline.supportTimes
  const anchorsChanged = nextSupportTimes.length !== drawingSupportTimes.length
    || nextSupportTimes.some((time, index) => (
      time !== drawingSupportTimes[index]
    ))
  const candlesChanged = displayedCandles.length !== drawingTimelineCandleCount
    || firstCandle !== drawingTimelineFirstCandle
    || lastCandle !== drawingTimelineLastCandle
  if (!anchorsChanged && !candlesChanged) {
    return false
  }
  drawingSupportTimes = nextSupportTimes
  if (anchorsChanged) {
    drawingAnchorSeries.value?.setData(nextSupportTimes.map((time) => ({
      time: time as UTCTimestamp,
    } satisfies WhitespaceData<UTCTimestamp>)))
  }
  drawingTimeline = nextTimeline.points
  drawingTimelineLastCandleIndex = nextTimeline.lastCandleIndex
  drawingTimelineFirstCandle = firstCandle
  drawingTimelineLastCandle = lastCandle
  drawingTimelineCandleCount = displayedCandles.length
  return true
}

function drawingBarSpanSeconds(): number {
  const match = /^(\d+)([mhd])$/.exec(props.selection.interval)
  if (match) {
    const unitSeconds = match[2] === 'd'
      ? 86_400
      : match[2] === 'h' ? 3_600 : 60
    return Number(match[1]) * unitSeconds
  }
  const first = displayedCandles[0]
  const second = displayedCandles[1]
  return first && second && second.time > first.time
    ? second.time - first.time
    : 60
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
  historyRetryBlocked = false
  lastTimestamp = 0
  pendingCandle = undefined
  displayedCandles = []
  drawingTimeline = []
  drawingSupportTimes = []
  drawingTimelineFirstCandle = 0
  drawingTimelineLastCandle = 0
  drawingTimelineCandleCount = 0
  drawingTimelineLastCandleIndex = -1
  const generation = ++historyGeneration
  const fingerprint = selectionFingerprint()
  const storedDrawings = readDrawings(props.selection)
  candleSeries.value.setData([])
  volumeSeries.value.setData([])
  drawingAnchorSeries.value?.setData([])
  try {
    const cachedHistory = props.initialHistory
    const hasCachedHistory = Boolean(cachedHistory?.length)
    const history = cachedHistory?.length
      ? cachedHistory
      : await loadCandles(props.selection, INITIAL_HISTORY_SIZE)
    if (!ownsChart(generation, fingerprint)) {
      return
    }
    const candles = uniqueSortedCandles(history)
    // Measured against the raw page, never the de-duplicated one: a single
    // repeated bar in a full page would otherwise latch the flag and the chart
    // would refuse to load history for the rest of the session.
    historyExhausted = !hasCachedHistory
      && history.length < INITIAL_HISTORY_SIZE
    displayedCandles = candles
    refreshDrawingTimeline(storedDrawings)
    candleSeries.value.setData(candles.map(candlePoint))
    volumeSeries.value.setData(candles.map(volumeBar))
    const lastCandle = candles.at(-1)
    if (lastCandle) {
      lastTimestamp = lastCandle.time
      updateLegend(lastCandle)
    }
    const latestPendingCandle = readPendingCandle()
    if (latestPendingCandle && latestPendingCandle.time >= lastTimestamp) {
      candleSeries.value.update(candlePoint(latestPendingCandle))
      volumeSeries.value.update(volumeBar(latestPendingCandle))
      lastTimestamp = latestPendingCandle.time
      rememberDisplayedCandle(latestPendingCandle, storedDrawings)
      updateLegend(latestPendingCandle)
    }
    emit('history', props.sessionId, fingerprint, candles)
    showInitialCandleWindow(drawingTimelineLastCandleIndex)
    indicators.invalidate()
  } catch (error) {
    if (ownsChart(generation, fingerprint)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : String(error)
    }
  } finally {
    /*
     * Restored on either path. The drawings of an asset do not depend on its
     * candles having loaded — they are the operator's own work, and a failed
     * request is no reason to lose sight of them. What they cannot do without
     * bars is resolve their instants into positions, so `useChartDrawings`
     * keeps the ones it cannot place and puts them up on the next rebuild.
     */
    if (ownsChart(generation, fingerprint)) {
      drawings.restore(storedDrawings)
    }
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
  // Cleared here rather than on success: this function is also the retry
  // button, and reaching it at all is the decision to try again.
  historyRetryBlocked = false
  setChartInteractionsLocked(true)

  try {
    const page = await loadCandles(
      props.selection,
      HISTORY_PAGE_SIZE,
      oldest.time,
    )
    if (!ownsChart(generation, fingerprint)) {
      return
    }

    const olderCandles = uniqueSortedCandles(page, oldest.time)

    if (olderCandles.length === 0) {
      /*
       * Two different situations answer with nothing usable, and only one of
       * them means the asset has no more history.
       *
       * An empty page is the provider saying there is nothing older, and
       * latching is right. A full page whose every candle was already on the
       * chart is an anomaly — a badly converted cursor, clock skew — and
       * latching there disables scrolling back for the rest of the session
       * over a transient. Removing the latch outright is not the answer
       * either: the cursor did not advance, so an automatic retry would loop
       * forever. Only the automatic prefetch is suspended; the button beside
       * the message is still the way back.
       */
      if (page.length === 0) {
        historyExhausted = true
      } else {
        historyRetryBlocked = true
        historyErrorMessage.value = 'Nenhum candle novo veio nesta página.'
      }
      return
    }

    // Replacing the full data set is the supported prepend operation in
    // Lightweight Charts. The renderer keeps processing live updates while
    // the REST request runs in Electron's utility process.
    const previousTimelineLength = drawingTimeline.length
    displayedCandles = [...olderCandles, ...displayedCandles]
    refreshDrawingTimeline(drawings.drawings())
    candles.setData(displayedCandles.map(candlePoint))
    volume.setData(displayedCandles.map(volumeBar))

    // Prepending shifts every previous logical index by the inserted count.
    // Restoring that shifted range keeps the same candles under the cursor.
    if (visibleRange) {
      const logicalShift = drawingTimeline.length - previousTimelineLength
      chartApi.timeScale().setVisibleLogicalRange({
        from: visibleRange.from + logicalShift,
        to: visibleRange.to + logicalShift,
      })
    }
    historyExhausted = page.length < HISTORY_PAGE_SIZE
    indicators.invalidate()
    // Prepending shifted every logical index; the drawings are anchored to
    // time and have to be placed again against the new indexing.
    drawings.rebuild()
  } catch (error) {
    if (ownsChart(generation, fingerprint)) {
      historyRetryBlocked = true
      historyErrorMessage.value = error instanceof Error
        ? error.message
        : String(error)
    }
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
    || historyRetryBlocked
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
 * Whether a request issued earlier still owns the chart it was issued for.
 *
 * Asked by the failure paths as well as the successful ones. A rejection that
 * lands after the chart moved on would otherwise paint an error over history
 * that loaded fine, and offer a retry button aimed at the wrong asset.
 *
 * The `finally` blocks deliberately test only the generation: `loading` and
 * the interaction lock have to be released even when the fingerprint moved on,
 * because nothing else is going to release them.
 */
function ownsChart(generation: number, fingerprint: string): boolean {
  return generation === historyGeneration
    && fingerprint === selectionFingerprint()
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
  // Held as a local for the whole mount: the listeners bound below must be
  // removed from this exact element, and the template ref is gone by then.
  const host = container.value
  if (!host) {
    return
  }

  const palette = appThemePalette.value
  const chartApi = createChart(host, {
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

  // Whitespace-only: it extends the horizontal domain for external drawing
  // anchors without entering candle or indicator calculations. The series
  // remains part of the time scale, but has no drawable line or price labels.
  const drawingAnchors = chartApi.addSeries(LineSeries, {
    lineVisible: false,
    priceScaleId: '',
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
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
      lines: chartTheme.watermarkLines(palette),
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
  drawingAnchorSeries.value = drawingAnchors
  volumeSeries.value = volume
  visibleLogicalRangeHandler = handleVisibleLogicalRangeChange
  chartApi.timeScale().subscribeVisibleLogicalRangeChange(
    visibleLogicalRangeHandler,
  )

  /*
   * The WeakMap inside `indicators` resolves the hovered series in O(1) and
   * writes its values directly to the readout node. Vue is touched only when
   * the pointer changes from one indicator to another, never per mouse pixel.
   */
  crosshairHandler = (param: Parameters<MouseEventHandler<Time>>[0]) => {
    const nextIndicatorId = indicators.readCursor(
      param.seriesData as unknown as Map<ISeriesApi<SeriesType>, unknown>,
      param.hoveredInfo?.series as ISeriesApi<SeriesType> | undefined,
    )
    if (hoveredIndicatorId.value !== nextIndicatorId) {
      hoveredIndicatorId.value = nextIndicatorId
    }
    drawings.handleMove(param)
  }
  chartApi.subscribeCrosshairMove(crosshairHandler)

  const onDrawingPointerDown = (event: MouseEvent) => {
    drawings.handlePointerDown(event)
  }
  const onDrawingPointerUp = (event: MouseEvent) => {
    drawings.handlePointerUp(event)
  }
  const onDrawingDoubleClick = (event: MouseEvent) => {
    if (drawings.finishActive(true)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!drawings.activeTool.value && openInlineTextEditor(event)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  host.addEventListener('mousedown', onDrawingPointerDown, true)
  host.addEventListener('dblclick', onDrawingDoubleClick, true)
  /*
   * The release listens on the document, not on the chart. A button let go
   * outside the plot — over the order book, over the drawing toolbar — never
   * reached a listener on the host, so the press that started inside stayed
   * pending: the next press anywhere would pair with that stale position, and
   * a movement under five pixels then read as a click, dropping a phantom
   * anchor or changing the selection. The handler already refuses anything
   * released outside the pane, so listening wider costs nothing.
   */
  document.addEventListener('mouseup', onDrawingPointerUp)
  releaseDrawingPointer = () => {
    host.removeEventListener('mousedown', onDrawingPointerDown, true)
    host.removeEventListener('dblclick', onDrawingDoubleClick, true)
    document.removeEventListener('mouseup', onDrawingPointerUp)
  }

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
    // The first bar to reach an empty chart is what lets a stored drawing be
    // placed at all: until there is something to measure against, its instants
    // resolve to nothing.
    const wasEmpty = displayedCandles.length === 0
    // Direct incremental writes bypass Vue rendering and preserve the viewport.
    candles.update(candlePoint(candle))
    volume.update(volumeBar(candle))
    lastTimestamp = candle.time
    const drawingsReindexed = rememberDisplayedCandle(candle)
    updateLegend(candle)
    indicators.refresh({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })
    if (wasEmpty) {
      refreshDrawingTimeline(drawings.drawings())
      drawings.rebuild()
    } else if (drawingsReindexed) {
      drawings.rebuild()
    }
  })

  // Capture wins over the workspace's bubble-phase bare-Enter shortcut. A
  // polyline must finish before the symbol picker can consider opening.
  document.addEventListener('keydown', cancelDrawingOnEscape, true)

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
  releaseDrawingPointer?.()
  releaseDrawingPointer = undefined
  drawings.dispose()
  document.removeEventListener('keydown', cancelDrawingOnEscape, true)
  releaseVerticalPricePan?.()
  releaseVerticalPricePan = undefined
  unsubscribeCandle?.()
  candleSeries.value = null
  drawingAnchorSeries.value = null
  volumeSeries.value = null
  displayedCandles = []
  drawingTimeline = []
  drawingSupportTimes = []
  drawingTimelineLastCandleIndex = -1
  watermark = undefined
  chart.value?.remove()
  chart.value = null
})

watch(appThemePalette, chartTheme.apply, { flush: 'sync' })

</script>

<template>
  <section class="chart-panel">
    <ChartToolbar
      :indicator-count="appliedIndicators.length"
      :interval="selection.interval"
      @indicators="openIndicatorPicker"
      @interval="emit('interval', $event)"
    />
    <div
      ref="chartStage"
      class="chart-stage"
      :class="{ 'drawing-mode-active': drawings.activeTool.value }"
    >
      <DrawingToolbar
        :active-tool="drawings.activeTool.value"
        :drawing-count="drawings.count()"
        :drawings-visible="drawings.visible.value"
        :drawings-locked="drawings.locked.value"
        @clear="drawings.clear()"
        @select="selectDrawingTool"
        @toggle-lock="drawings.toggleLock()"
        @toggle-visibility="drawings.toggleVisibility()"
      />
      <div ref="container" class="chart-container" />
      <DrawingStyleBar
        v-if="drawings.selected.value"
        ref="drawingStyleBar"
        :drawing="drawings.selected.value"
        @close="drawings.deselect()"
        @remove="drawings.removeSelected()"
        @restyle="drawings.restyleSelected($event)"
        @configure="drawings.configureSelected($event)"
      />
      <DrawingTextInlineEditor
        v-if="inlineTextEditor"
        :text="inlineTextEditor.originalText"
        :appearance="inlineTextEditor.originalAppearance"
        :style="{
          left: `${inlineTextEditor.left}px`,
          top: `${inlineTextEditor.top}px`,
        }"
        @cancel="closeInlineTextEditor"
        @save="saveInlineText"
        @settings="saveInlineText($event, true)"
      />
      <div ref="legend" class="chart-legend">
        <strong>{{ displaySymbol() }} · {{ selection.interval }}</strong>
        <span>O <b ref="legendOpen">—</b></span>
        <span>H <b ref="legendHigh">—</b></span>
        <span>L <b ref="legendLow">—</b></span>
        <span>C <b ref="legendClose">—</b></span>
        <i>LIVE</i>
      </div>
      <AppliedIndicators
        :active-instance-id="hoveredIndicatorId"
        :applied="presentedIndicators"
        @configure="configuringId = $event"
        @preview="previewIndicatorReadout"
        @remove="removeIndicator"
      />
      <div v-if="errorMessage" class="chart-message error">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="initializeChartData">
          Tentar novamente
        </button>
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
