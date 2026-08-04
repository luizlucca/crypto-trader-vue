import { indicatorRegistry } from 'lightweight-charts-indicators'
import type {
  IndicatorBand,
  IndicatorBox,
  IndicatorDrawings,
  IndicatorLabel,
  IndicatorLine,
} from '@/domain/indicatorDrawings'
import { EMPTY_DRAWINGS } from '@/domain/indicatorDrawings'
import {
  BAR_COLOR_PLOT,
  type IndicatorBar,
  type IndicatorCandlePatch,
  type IndicatorMarker,
  type IndicatorBarsPayload,
  type IndicatorPlotPatch,
  type IndicatorRequest,
  type IndicatorResponse,
} from '@/domain/indicatorProtocol'
import type {
  IndicatorDefinition,
  IndicatorInputs,
} from '@/domain/indicators'

/**
 * The only module in the application that imports the indicator library.
 *
 * Everything else speaks the protocol in `domain/indicatorProtocol.ts`, so
 * swapping the library means rewriting this file alone. Running here also keeps
 * the O(n) recalculation off the thread that draws candles and commits the
 * order book.
 */

interface RegistryEntry {
  id: string
  group?: string
  name?: string
  shortName?: string
  description?: string
  category?: string
  overlay?: boolean
  inputConfig?: unknown[]
  plotConfig?: unknown[]
  hlineConfig?: unknown[]
  defaultInputs?: Record<string, unknown>
  calculate: (bars: unknown[], inputs: unknown) => {
    plots?: Record<string, { time: number, value: number }[]>
    plotCandles?: Record<string, LibraryCandle[]>
    markers?: unknown[]
    lines?: unknown[]
    boxes?: unknown[]
    labels?: unknown[]
    bgColors?: unknown[]
    barColors?: unknown[]
  }
}

const registry = indicatorRegistry as unknown as RegistryEntry[]
const byId = new Map<string, RegistryEntry>()
for (const entry of registry) {
  byId.set(entry.id, entry)
}

/** A candle output of the indicator, as the library hands it over. */
interface LibraryCandle {
  time: number
  open: number
  high: number
  low: number
  close: number
  color?: string
  borderColor?: string
  wickColor?: string
}

const EMPTY_LIBRARY_CANDLES: LibraryCandle[] = []

/** Retained per instance so a tick can be answered with a diff. */
interface AttachedIndicator {
  definitionId: string
  instanceRevision: number
  inputs: IndicatorInputs
  previous: Map<string, { time: Float64Array, value: Float64Array }>
  /** Same role as `previous`, for indicators that draw their own candles. */
  previousCandles: Map<string, LibraryCandle[]>
  /** Previous markers, compared structurally instead of serialised per tick. */
  previousMarkers: IndicatorMarker[]
  /** Same idea for the free-form shapes, which are recomputed whole. */
  previousDrawings: IndicatorDrawings
}

interface IndicatorCalculation {
  patches: IndicatorPlotPatch[]
  candles: IndicatorCandlePatch[]
  drawings?: IndicatorDrawings
  markers?: IndicatorMarker[]
  /** Present when a complete round drew nothing; may be an empty list. */
  undrawn?: string[]
}

type AttachRequest = Extract<IndicatorRequest, { kind: 'attach' }>
type ComputeRequest = Extract<IndicatorRequest, { kind: 'compute' }>
type ResultResponse = Extract<IndicatorResponse, { kind: 'result' }>

const attached = new Map<string, AttachedIndicator>()
const EMPTY_MARKERS: IndicatorMarker[] = []
const EMPTY_COLOR_INDEX = new Uint8Array(0)

/**
 * The bar array the library consumes, retained across calculations.
 *
 * Rebuilding it per compute allocated one object per bar on every tick. Keeping
 * it here means a tick costs a single push or a single field write.
 */
let bars: IndicatorBar[] = []

function toDefinition(entry: RegistryEntry): IndicatorDefinition {
  const group = entry.group === 'standard' || entry.group === 'candlestick'
    ? entry.group
    : 'community'
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    shortName: entry.shortName ?? entry.id.toUpperCase(),
    description: entry.description ?? '',
    category: entry.category ?? 'Outros',
    overlay: entry.overlay !== false,
    group,
    inputs: (entry.inputConfig ?? []) as IndicatorDefinition['inputs'],
    plots: (entry.plotConfig ?? []) as IndicatorDefinition['plots'],
    hlines: (entry.hlineConfig ?? []) as IndicatorDefinition['hlines'],
    defaults: (entry.defaultInputs ?? {}) as IndicatorDefinition['defaults'],
  }
}

function replaceBars(payload: IndicatorBarsPayload): void {
  const next = new Array<IndicatorBar>(payload.time.length)
  for (let i = 0; i < payload.time.length; i += 1) {
    next[i] = {
      time: payload.time[i],
      open: payload.open[i],
      high: payload.high[i],
      low: payload.low[i],
      close: payload.close[i],
      volume: payload.volume[i],
    }
  }
  bars = next
}

/** Appends the bar, or overwrites the last one while it is still forming. */
function writeTailBar(bar: IndicatorBar): void {
  const last = bars[bars.length - 1]
  if (last && last.time === bar.time) {
    bars[bars.length - 1] = bar
  } else if (!last || bar.time > last.time) {
    bars.push(bar)
  }
}

/**
 * Finds the first index whose time or value differs from the previous result.
 * On an ordinary tick only the last points move, so the chart receives a
 * handful of `update()` calls instead of a full `setData()`.
 */
function firstDifference(
  previous: { time: Float64Array, value: Float64Array } | undefined,
  time: Float64Array,
  value: Float64Array,
): number {
  if (!previous || previous.time.length === 0) {
    return 0
  }
  // A shorter series means points were dropped: nothing can be reused.
  if (previous.time.length > time.length) {
    return 0
  }
  for (let i = 0; i < previous.time.length; i += 1) {
    if (previous.time[i] !== time[i] || previous.value[i] !== value[i]) {
      return i
    }
  }
  return previous.time.length
}

/**
 * Lightweight Charts requires unique, strictly ascending times. Most library
 * indicators already satisfy that contract, so the normal path stays O(n)
 * without object allocation. Sorting and de-duplicating is a rare fallback for
 * a malformed community port, preventing one bad plot from poisoning a pane.
 */
function normalizePlotPoints(
  points: { time: number, value: number }[],
): { time: Float64Array, value: Float64Array } {
  let count = 0
  let ordered = true
  let lastTime = Number.NEGATIVE_INFINITY
  const time = new Float64Array(points.length)
  const value = new Float64Array(points.length)

  for (const point of points) {
    if (!Number.isFinite(point?.value) || !Number.isFinite(point?.time)) {
      continue
    }
    if (point.time <= lastTime) {
      ordered = false
    }
    time[count] = point.time
    value[count] = point.value
    lastTime = point.time
    count += 1
  }

  if (ordered) {
    return {
      time: time.subarray(0, count),
      value: value.subarray(0, count),
    }
  }

  const sorted = Array.from({ length: count }, (_, index) => ({
    time: time[index],
    value: value[index],
  })).sort((left, right) => left.time - right.time)
  let uniqueCount = 0
  for (const point of sorted) {
    if (uniqueCount > 0 && time[uniqueCount - 1] === point.time) {
      // A repeated timestamp replaces the earlier value deterministically.
      value[uniqueCount - 1] = point.value
      continue
    }
    time[uniqueCount] = point.time
    value[uniqueCount] = point.value
    uniqueCount += 1
  }
  return {
    time: time.subarray(0, uniqueCount),
    value: value.subarray(0, uniqueCount),
  }
}

/** True when the two candles would draw identically. */
function sameCandle(left: LibraryCandle, right: LibraryCandle): boolean {
  return left.time === right.time
    && left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
    && left.color === right.color
    && left.borderColor === right.borderColor
    && left.wickColor === right.wickColor
}

function validCandle(candle: LibraryCandle): boolean {
  return Number.isFinite(candle?.time)
    && Number.isFinite(candle?.open)
    && Number.isFinite(candle?.high)
    && Number.isFinite(candle?.low)
    && Number.isFinite(candle?.close)
}

/** Keeps the original array on the normal path; allocates only if invalid. */
function normalizeCandles(raw: LibraryCandle[]): LibraryCandle[] {
  let firstInvalid = -1
  for (let index = 0; index < raw.length; index += 1) {
    if (!validCandle(raw[index])) {
      firstInvalid = index
      break
    }
  }
  if (firstInvalid < 0) {
    return raw
  }

  const valid = raw.slice(0, firstInvalid)
  for (let index = firstInvalid + 1; index < raw.length; index += 1) {
    if (validCandle(raw[index])) {
      valid.push(raw[index])
    }
  }
  return valid
}

/**
 * Builds the candle patch for one output, on the same terms as the plot patch:
 * only the tail travels on an ordinary tick, and anything that moved earlier
 * forces a complete replacement because `update()` refuses to go back in time.
 */
function candlePatch(
  plotId: string,
  points: LibraryCandle[],
  previous: LibraryCandle[] | undefined,
  forceFull: boolean,
): IndicatorCandlePatch | undefined {
  if (points.length === 0) {
    return undefined
  }

  let from = 0
  if (
    !forceFull
    && previous
    && previous.length > 0
    && previous.length <= points.length
  ) {
    while (from < previous.length && sameCandle(previous[from], points[from])) {
      from += 1
    }
  }
  const tailOnly = !forceFull
    && from >= (previous?.length ?? 0) - 1
    && from > 0
  if (!forceFull && tailOnly && from >= points.length) {
    return undefined // Nothing moved.
  }
  const start = tailOnly ? from : 0
  const count = points.length - start

  const time = new Float64Array(count)
  const open = new Float64Array(count)
  const high = new Float64Array(count)
  const low = new Float64Array(count)
  const close = new Float64Array(count)
  let colorIndex: Uint8Array | undefined
  const palette: IndicatorCandlePatch['palette'] = []
  const paletteIndex = new Map<string, number>()

  for (let i = 0; i < count; i += 1) {
    const candle = points[start + i]
    time[i] = candle.time
    open[i] = candle.open
    high[i] = candle.high
    low[i] = candle.low
    close[i] = candle.close
    if (candle.color === undefined) {
      continue
    }
    colorIndex ??= new Uint8Array(count)
    const key = `${candle.color}|${candle.borderColor ?? ''}|${
      candle.wickColor ?? ''
    }`
    let index = paletteIndex.get(key)
    if (index === undefined) {
      // 255 distinct colours in one indicator would mean a per-bar gradient,
      // which no catalog entry does; the surplus reuses the first colour.
      index = palette.length < 256 ? palette.length : 0
      paletteIndex.set(key, index)
      palette[index] = {
        color: candle.color,
        borderColor: candle.borderColor ?? candle.color,
        wickColor: candle.wickColor ?? candle.color,
      }
    }
    colorIndex[i] = index
  }

  return {
    plotId,
    full: !tailOnly,
    from: start,
    time,
    open,
    high,
    low,
    close,
    colorIndex: colorIndex ?? EMPTY_COLOR_INDEX,
    palette,
  }
}

const DRAWING_STYLES = new Set(['solid', 'dashed', 'dotted'])
const LABEL_STYLES = new Set([
  'label_up', 'label_down', 'label_left', 'label_right', 'label_center',
])

function lineStyle(value: unknown): IndicatorLine['style'] {
  return DRAWING_STYLES.has(String(value))
    ? value as IndicatorLine['style']
    : 'solid'
}

function hasFinitePair(first: unknown, second: unknown): boolean {
  return Number.isFinite(first) && Number.isFinite(second)
}

function hasFiniteAnchors(
  time1: unknown,
  price1: unknown,
  time2: unknown,
  price2: unknown,
): boolean {
  return hasFinitePair(time1, price1) && hasFinitePair(time2, price2)
}

/**
 * Walks the retained bars alongside an ascending list of per-bar entries.
 *
 * Both the catalog and the chart are ordered by time, so a single moving cursor
 * resolves every entry without building a lookup table per calculation.
 */
function eachBar<T extends { time?: number }>(
  entries: readonly unknown[] | undefined,
  visit: (bar: IndicatorBar, index: number, entry: T) => void,
): void {
  if (!entries) {
    return
  }
  let cursor = 0
  for (const raw of entries) {
    const entry = raw as T
    if (!Number.isFinite(entry?.time)) {
      continue
    }
    while (cursor < bars.length && bars[cursor].time < (entry.time as number)) {
      cursor += 1
    }
    const bar = bars[cursor]
    if (bar && bar.time === entry.time) {
      visit(bar, cursor, entry)
    }
  }
}

/**
 * Merges per-bar colours into runs. Adjacency is decided by bar index, not by
 * colour alone: two separate sessions painted the same colour must stay two
 * bands, or the gap between them would be filled in.
 */
function normalizeBands(raw: unknown[] | undefined): IndicatorBand[] {
  const bands: IndicatorBand[] = []
  let current: IndicatorBand | undefined
  let lastIndex = -2
  eachBar<{ time?: number, color?: string }>(raw, (bar, index, entry) => {
    if (typeof entry.color !== 'string') {
      return
    }
    if (current && current.color === entry.color && index === lastIndex + 1) {
      current.time2 = bar.time
    } else {
      current = { time1: bar.time, time2: bar.time, color: entry.color }
      bands.push(current)
    }
    lastIndex = index
  })
  return bands
}

/**
 * The market's own bars, wearing the colours the indicator assigned. Only the
 * bars it actually painted are included, so the untouched ones keep showing the
 * chart's candles underneath.
 */
function repaintedBars(raw: unknown[] | undefined): LibraryCandle[] {
  if (!raw || raw.length === 0) {
    return EMPTY_LIBRARY_CANDLES
  }
  const painted: LibraryCandle[] = []
  eachBar<{ time?: number, color?: string }>(raw, (bar, _index, entry) => {
    if (typeof entry.color !== 'string') {
      return
    }
    painted.push({
      time: bar.time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      color: entry.color,
      borderColor: entry.color,
      wickColor: entry.color,
    })
  })
  return painted
}

/**
 * Keeps only the shapes the renderer can place. A shape without a finite time
 * or price has no position on the chart, and drawing it would be inventing one.
 */
function normalizeDrawings(result: {
  lines?: unknown[]
  boxes?: unknown[]
  labels?: unknown[]
  bgColors?: unknown[]
}): IndicatorDrawings {
  const lines: IndicatorLine[] = []
  for (const raw of result.lines ?? []) {
    const line = raw as Partial<IndicatorLine>
    if (!hasFiniteAnchors(line.time1, line.price1, line.time2, line.price2)) {
      continue
    }
    const normalized: IndicatorLine = {
      time1: line.time1 as number,
      price1: line.price1 as number,
      time2: line.time2 as number,
      price2: line.price2 as number,
      color: typeof line.color === 'string' ? line.color : '#787B86',
      width: Number.isFinite(line.width) ? line.width as number : 1,
      style: lineStyle(line.style),
    }
    if (line.extend !== undefined) {
      normalized.extend = line.extend
    }
    lines.push(normalized)
  }

  const boxes: IndicatorBox[] = []
  for (const raw of result.boxes ?? []) {
    const box = raw as Partial<IndicatorBox>
    if (!hasFiniteAnchors(box.time1, box.price1, box.time2, box.price2)) {
      continue
    }
    const normalized: IndicatorBox = {
      time1: box.time1 as number,
      price1: box.price1 as number,
      time2: box.time2 as number,
      price2: box.price2 as number,
      bgColor: typeof box.bgColor === 'string'
        ? box.bgColor
        : 'rgba(120,123,134,0.30)',
    }
    if (box.borderColor !== undefined) {
      normalized.borderColor = box.borderColor
    }
    if (box.borderWidth !== undefined) {
      normalized.borderWidth = box.borderWidth
    }
    if (box.borderStyle !== undefined) {
      normalized.borderStyle = lineStyle(box.borderStyle)
    }
    if (box.text !== undefined) {
      normalized.text = String(box.text)
    }
    if (box.textColor !== undefined) {
      normalized.textColor = box.textColor
    }
    boxes.push(normalized)
  }

  const labels: IndicatorLabel[] = []
  for (const raw of result.labels ?? []) {
    const label = raw as Partial<IndicatorLabel>
    if (!hasFinitePair(label.time, label.price) || label.text === undefined) {
      continue
    }
    const normalized: IndicatorLabel = {
      time: label.time as number,
      price: label.price as number,
      text: String(label.text),
      textColor: typeof label.textColor === 'string'
        ? label.textColor
        : '#FFFFFF',
      style: LABEL_STYLES.has(String(label.style))
        ? label.style as IndicatorLabel['style']
        : 'label_up',
    }
    if (label.color !== undefined) {
      normalized.color = label.color
    }
    if (label.size !== undefined) {
      normalized.size = label.size
    }
    labels.push(normalized)
  }

  return { lines, boxes, labels, bands: normalizeBands(result.bgColors) }
}

const MARKER_POSITIONS = new Set(['aboveBar', 'belowBar', 'inBar'])
const MARKER_SHAPES = new Set(['circle', 'square', 'arrowUp', 'arrowDown'])

/** Keeps only markers the chart can render; the rest would be dropped. */
function normalizeMarkers(raw: unknown[] | undefined): IndicatorMarker[] {
  const markers: IndicatorMarker[] = []
  for (const entry of raw ?? []) {
    const marker = entry as Partial<IndicatorMarker>
    if (
      !Number.isFinite(marker.time)
      || !MARKER_POSITIONS.has(String(marker.position))
      || typeof marker.color !== 'string'
    ) {
      continue
    }
    const normalized: IndicatorMarker = {
      time: marker.time as number,
      position: marker.position as IndicatorMarker['position'],
      // The catalog uses triangleUp/triangleDown, which the chart lacks.
      shape: normalizeMarkerShape(marker.shape),
      color: marker.color,
    }
    if (marker.size !== undefined) {
      normalized.size = marker.size
    }
    if (marker.text !== undefined) {
      normalized.text = marker.text
    }
    markers.push(normalized)
  }
  // The chart requires markers in ascending time order.
  return markers.sort((left, right) => left.time - right.time)
}

function normalizeMarkerShape(value: unknown): IndicatorMarker['shape'] {
  const shape = String(value)
  if (MARKER_SHAPES.has(shape)) {
    return shape as IndicatorMarker['shape']
  }
  return shape.toLowerCase().includes('down') ? 'arrowDown' : 'arrowUp'
}

function sameArray<T>(
  current: readonly T[],
  previous: readonly T[],
  sameItem: (left: T, right: T) => boolean,
): boolean {
  if (current.length !== previous.length) {
    return false
  }
  for (let index = 0; index < current.length; index += 1) {
    if (!sameItem(current[index], previous[index])) {
      return false
    }
  }
  return true
}

function sameMarker(left: IndicatorMarker, right: IndicatorMarker): boolean {
  return left.time === right.time
    && left.position === right.position
    && left.shape === right.shape
    && left.color === right.color
    && left.size === right.size
    && left.text === right.text
}

function sameLine(left: IndicatorLine, right: IndicatorLine): boolean {
  return left.time1 === right.time1
    && left.price1 === right.price1
    && left.time2 === right.time2
    && left.price2 === right.price2
    && left.color === right.color
    && left.width === right.width
    && left.style === right.style
    && left.extend === right.extend
}

function sameBox(left: IndicatorBox, right: IndicatorBox): boolean {
  return left.time1 === right.time1
    && left.price1 === right.price1
    && left.time2 === right.time2
    && left.price2 === right.price2
    && left.bgColor === right.bgColor
    && left.borderColor === right.borderColor
    && left.borderWidth === right.borderWidth
    && left.borderStyle === right.borderStyle
    && left.text === right.text
    && left.textColor === right.textColor
}

function sameLabel(left: IndicatorLabel, right: IndicatorLabel): boolean {
  return left.time === right.time
    && left.price === right.price
    && left.text === right.text
    && left.color === right.color
    && left.textColor === right.textColor
    && left.style === right.style
    && left.size === right.size
}

function sameBand(left: IndicatorBand, right: IndicatorBand): boolean {
  return left.time1 === right.time1
    && left.time2 === right.time2
    && left.color === right.color
}

function sameDrawings(
  current: IndicatorDrawings,
  previous: IndicatorDrawings,
): boolean {
  return sameArray(current.lines, previous.lines, sameLine)
    && sameArray(current.boxes, previous.boxes, sameBox)
    && sameArray(current.labels, previous.labels, sameLabel)
    && sameArray(current.bands, previous.bands, sameBand)
}

/**
 * Output kinds the chart pipeline cannot draw. Only raw pivot metadata remains,
 * and no catalog entry expresses itself through it alone. Detecting it is what
 * separates "still warming up" from "this one will never draw anything here" —
 * the difference between waiting and removing the indicator.
 */
const UNSUPPORTED_OUTPUTS = [
  'pivots',
] as const

function unsupportedOutputs(result: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const key of UNSUPPORTED_OUTPUTS) {
    if (hasContent(result[key])) {
      found.push(key)
    }
  }
  return found
}

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }
  return typeof value === 'object'
    && value !== null
    && Object.keys(value).length > 0
}

function computeInstance(
  indicator: AttachedIndicator,
  forceFull: boolean,
): IndicatorCalculation {
  const entry = byId.get(indicator.definitionId)
  if (!entry) {
    throw new Error(`Indicador desconhecido: ${indicator.definitionId}`)
  }

  const result = entry.calculate(bars, indicator.inputs)
  const patches: IndicatorPlotPatch[] = []

  const plots = result.plots
  if (plots) {
    for (const plotId in plots) {
      const points = plots[plotId]
      // Non-finite values are warm-up gaps and must not reach setData().
      const normalized = normalizePlotPoints(points)
      const trimmedTime = normalized.time
      const trimmedValue = normalized.value
      const count = trimmedTime.length

      const previous = indicator.previous.get(plotId)
      const from = forceFull
        ? 0
        : firstDifference(previous, trimmedTime, trimmedValue)

      // These arrays are private worker allocations. The patch below transfers
      // slices, so retaining them needs no second full-history copy.
      indicator.previous.set(plotId, {
        time: trimmedTime,
        value: trimmedValue,
      })

      if (!forceFull && from >= count) {
        continue // Nothing changed for this plot.
      }

      /*
       * `series.update()` only accepts a time at or after the series' last
       * point. A recalculation can move a value in the middle of the series —
       * a smoothing window reaching further back, for instance — and feeding
       * that to `update()` throws. Only the tail can travel as a diff; anything
       * earlier has to replace the whole series.
       */
      const previousLength = previous?.time.length ?? 0
      const tailOnly = !forceFull && from >= previousLength - 1 && from > 0
      const start = tailOnly ? from : 0

      patches.push({
        plotId,
        full: !tailOnly,
        from: start,
        time: trimmedTime.slice(start),
        value: trimmedValue.slice(start),
      })
    }
  }

  const candles: IndicatorCandlePatch[] = []
  const candlePlots = result.plotCandles
  if (candlePlots) {
    for (const plotId in candlePlots) {
      const points = normalizeCandles(candlePlots[plotId])
      const patch = candlePatch(
        plotId,
        points,
        indicator.previousCandles.get(plotId),
        forceFull,
      )
      indicator.previousCandles.set(plotId, points)
      if (patch) {
        candles.push(patch)
      }
    }
  }

  const repainted = repaintedBars(result.barColors)
  if (repainted.length > 0) {
    const patch = candlePatch(
      BAR_COLOR_PLOT,
      repainted,
      indicator.previousCandles.get(BAR_COLOR_PLOT),
      forceFull,
    )
    indicator.previousCandles.set(BAR_COLOR_PLOT, repainted)
    if (patch) {
      candles.push(patch)
    }
  }

  const hasRawDrawings = Boolean(
    result.lines?.length
    || result.boxes?.length
    || result.labels?.length
    || result.bgColors?.length,
  )
  const shapes = hasRawDrawings ? normalizeDrawings(result) : EMPTY_DRAWINGS
  const shapeCount = shapes.lines.length + shapes.boxes.length
    + shapes.labels.length + shapes.bands.length
  const shapesChanged = !sameDrawings(shapes, indicator.previousDrawings)
  indicator.previousDrawings = shapes
  const drawings = shapesChanged || (forceFull && shapeCount > 0)
    ? shapes
    : undefined

  const markers = result.markers?.length
    ? normalizeMarkers(result.markers)
    : EMPTY_MARKERS

  /*
   * Only a complete round can conclude anything: on a diff round an untouched
   * plot is legitimately absent from `patches`, so "nothing here" would be a
   * false alarm every tick.
   */
  if (
    forceFull
    && markers.length === 0
    && candles.length === 0
    && shapeCount === 0
    && !patches.some((patch) => patch.time.length > 0)
  ) {
    return {
      patches: [],
      candles: [],
      undrawn: unsupportedOutputs(result as unknown as Record<string, unknown>),
    }
  }

  const markersChanged = !sameArray(
    markers,
    indicator.previousMarkers,
    sameMarker,
  )
  if (!markersChanged && !forceFull) {
    return { patches, candles, drawings }
  }
  indicator.previousMarkers = markers
  return { patches, candles, drawings, markers }
}

function post(message: IndicatorResponse, transfer?: Transferable[]): void {
  const target = self as unknown as Worker
  if (transfer) {
    target.postMessage(message, transfer)
  } else {
    target.postMessage(message)
  }
}

function createAttachedIndicator(request: AttachRequest): AttachedIndicator {
  return {
    definitionId: request.definitionId,
    instanceRevision: request.instanceRevision,
    inputs: request.inputs,
    previous: new Map(),
    previousCandles: new Map(),
    previousMarkers: EMPTY_MARKERS,
    previousDrawings: EMPTY_DRAWINGS,
  }
}

function collectTransferables(result: IndicatorCalculation): Transferable[] {
  const transfer: Transferable[] = []
  for (const patch of result.patches) {
    transfer.push(patch.time.buffer, patch.value.buffer)
  }
  for (const patch of result.candles) {
    transfer.push(
      patch.time.buffer,
      patch.open.buffer,
      patch.high.buffer,
      patch.low.buffer,
      patch.close.buffer,
    )
    if (patch.colorIndex.byteLength > 0) {
      transfer.push(patch.colorIndex.buffer)
    }
  }
  return transfer
}

function hasDrawableResult(result: IndicatorCalculation): boolean {
  return result.patches.length > 0
    || result.candles.length > 0
    || result.markers !== undefined
    || result.drawings !== undefined
}

function postResult(
  request: ComputeRequest,
  instanceId: string,
  indicator: AttachedIndicator,
  result: IndicatorCalculation,
): void {
  const response: ResultResponse = {
    kind: 'result',
    generation: request.generation,
    roundId: request.roundId,
    instanceId,
    instanceRevision: indicator.instanceRevision,
    patches: result.patches,
  }
  if (result.candles.length > 0) {
    response.candles = result.candles
  }
  if (result.drawings !== undefined) {
    response.drawings = result.drawings
  }
  if (result.markers !== undefined) {
    response.markers = result.markers
  }
  post(response, collectTransferables(result))
}

function postComputed(request: ComputeRequest): void {
  post({
    kind: 'computed',
    generation: request.generation,
    roundId: request.roundId,
  })
}

function computeAttachedIndicators(request: ComputeRequest): void {
  if (attached.size === 0 || bars.length === 0) {
    postComputed(request)
    return
  }

  for (const [instanceId, indicator] of attached) {
    try {
      const result = computeInstance(
        indicator,
        request.full,
      )
      if (result.undrawn) {
        post({
          kind: 'no-output',
          generation: request.generation,
          roundId: request.roundId,
          instanceId,
          instanceRevision: indicator.instanceRevision,
          outputs: result.undrawn,
        })
        continue
      }
      if (!hasDrawableResult(result)) {
        continue
      }
      postResult(request, instanceId, indicator, result)
    } catch (error) {
      post({
        kind: 'error',
        generation: request.generation,
        roundId: request.roundId,
        instanceId,
        instanceRevision: indicator.instanceRevision,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  postComputed(request)
}

function handleRequest(request: IndicatorRequest): void {
  switch (request.kind) {
    case 'catalog':
      post({ kind: 'catalog', definitions: registry.map(toDefinition) })
      return
    case 'attach': {
      const current = attached.get(request.instanceId)
      if (!current || current.instanceRevision <= request.instanceRevision) {
        attached.set(request.instanceId, createAttachedIndicator(request))
      }
      return
    }
    case 'detach': {
      const current = attached.get(request.instanceId)
      if (current?.instanceRevision === request.instanceRevision) {
        attached.delete(request.instanceId)
      }
      return
    }
    case 'bars-replace':
      replaceBars(request.bars)
      return
    case 'bars-tail':
      writeTailBar(request.bar)
      return
    case 'compute':
      computeAttachedIndicators(request)
  }
}

self.onmessage = (event: MessageEvent<IndicatorRequest>) => {
  handleRequest(event.data)
}
