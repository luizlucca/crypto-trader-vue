import { indicatorRegistry } from 'lightweight-charts-indicators'
import type {
  IndicatorBar,
  IndicatorCandlePatch,
  IndicatorMarker,
  IndicatorBarsPayload,
  IndicatorPlotPatch,
  IndicatorRequest,
  IndicatorResponse,
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
  }
}

const registry = indicatorRegistry as unknown as RegistryEntry[]
const byId = new Map(registry.map((entry) => [entry.id, entry]))

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

/** Retained per instance so a tick can be answered with a diff. */
interface AttachedIndicator {
  definitionId: string
  instanceRevision: number
  inputs: IndicatorInputs
  previous: Map<string, { time: Float64Array, value: Float64Array }>
  /** Same role as `previous`, for indicators that draw their own candles. */
  previousCandles: Map<string, LibraryCandle[]>
  /** Serialised marker set, to send only when it actually changes. */
  previousMarkers: string
}

const attached = new Map<string, AttachedIndicator>()

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
}

/**
 * Builds the candle patch for one output, on the same terms as the plot patch:
 * only the tail travels on an ordinary tick, and anything that moved earlier
 * forces a complete replacement because `update()` refuses to go back in time.
 */
function candlePatch(
  plotId: string,
  raw: LibraryCandle[],
  previous: LibraryCandle[] | undefined,
  forceFull: boolean,
): IndicatorCandlePatch | undefined {
  const points = raw.filter((candle) => (
    Number.isFinite(candle?.time)
    && Number.isFinite(candle?.open)
    && Number.isFinite(candle?.high)
    && Number.isFinite(candle?.low)
    && Number.isFinite(candle?.close)
  ))
  if (points.length === 0) {
    return undefined
  }

  let from = 0
  if (!forceFull && previous && previous.length > 0 && previous.length <= points.length) {
    while (from < previous.length && sameCandle(previous[from], points[from])) {
      from += 1
    }
  }
  const tailOnly = !forceFull && from >= (previous?.length ?? 0) - 1 && from > 0
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
  const colorIndex = new Uint8Array(count)
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
    const key = `${candle.color}|${candle.borderColor ?? ''}|${candle.wickColor ?? ''}`
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
    colorIndex: palette.length > 0 ? colorIndex : new Uint8Array(0),
    palette,
  }
}

const MARKER_POSITIONS = new Set(['aboveBar', 'belowBar', 'inBar'])
const MARKER_SHAPES = new Set(['circle', 'square', 'arrowUp', 'arrowDown'])

/** Keeps only markers the chart can render; the rest would be dropped anyway. */
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
    markers.push({
      time: marker.time as number,
      position: marker.position as IndicatorMarker['position'],
      // The catalog uses triangleUp/triangleDown, which the chart lacks.
      shape: MARKER_SHAPES.has(String(marker.shape))
        ? marker.shape as IndicatorMarker['shape']
        : String(marker.shape).toLowerCase().includes('down')
          ? 'arrowDown'
          : 'arrowUp',
      color: marker.color,
      ...(marker.size === undefined ? {} : { size: marker.size }),
      ...(marker.text === undefined ? {} : { text: marker.text }),
    })
  }
  // The chart requires markers in ascending time order.
  return markers.sort((left, right) => left.time - right.time)
}

/**
 * Output kinds the chart pipeline cannot draw. The library expresses part of
 * its catalog as boxes, free lines, labels or background bands, none of which
 * map onto the series/marker protocol. Detecting them is what separates "still
 * warming up" from "this one will never draw anything here" — the difference
 * between waiting and removing the indicator.
 */
const UNSUPPORTED_OUTPUTS = [
  'lines',
  'boxes',
  'labels',
  'bgColors',
  'barColors',
  'pivots',
] as const

function unsupportedOutputs(result: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const key of UNSUPPORTED_OUTPUTS) {
    const value = result[key]
    const filled = Array.isArray(value)
      ? value.length > 0
      : typeof value === 'object' && value !== null
        && Object.keys(value).length > 0
    if (filled) {
      found.push(key)
    }
  }
  return found
}

function computeInstance(
  indicator: AttachedIndicator,
  forceFull: boolean,
): {
  patches: IndicatorPlotPatch[]
  candles: IndicatorCandlePatch[]
  markers?: IndicatorMarker[]
  /** Present when a complete round drew nothing; may be an empty list. */
  undrawn?: string[]
} {
  const entry = byId.get(indicator.definitionId)
  if (!entry) {
    throw new Error(`Indicador desconhecido: ${indicator.definitionId}`)
  }

  const result = entry.calculate(bars, indicator.inputs)
  const patches: IndicatorPlotPatch[] = []

  for (const [plotId, points] of Object.entries(result.plots ?? {})) {
    // Non-finite values are warm-up gaps and must not reach setData().
    const normalized = normalizePlotPoints(points)
    const trimmedTime = normalized.time
    const trimmedValue = normalized.value
    const count = trimmedTime.length

    const previous = indicator.previous.get(plotId)
    const from = forceFull
      ? 0
      : firstDifference(previous, trimmedTime, trimmedValue)

    indicator.previous.set(plotId, {
      time: trimmedTime.slice(),
      value: trimmedValue.slice(),
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

  const candles: IndicatorCandlePatch[] = []
  for (const [plotId, points] of Object.entries(result.plotCandles ?? {})) {
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

  const markers = normalizeMarkers(result.markers)

  /*
   * Only a complete round can conclude anything: on a diff round an untouched
   * plot is legitimately absent from `patches`, so "nothing here" would be a
   * false alarm every tick.
   */
  if (
    forceFull
    && markers.length === 0
    && candles.length === 0
    && !patches.some((patch) => patch.time.length > 0)
  ) {
    return {
      patches: [],
      candles: [],
      undrawn: unsupportedOutputs(result as unknown as Record<string, unknown>),
    }
  }

  const encoded = markers.length > 0 ? JSON.stringify(markers) : ''
  if (encoded === indicator.previousMarkers && !forceFull) {
    return { patches, candles }
  }
  indicator.previousMarkers = encoded
  return { patches, candles, markers }
}

function post(message: IndicatorResponse, transfer: Transferable[] = []): void {
  ;(self as unknown as Worker).postMessage(message, transfer)
}

self.onmessage = (event: MessageEvent<IndicatorRequest>) => {
  const request = event.data

  if (request.kind === 'catalog') {
    post({ kind: 'catalog', definitions: registry.map(toDefinition) })
    return
  }

  if (request.kind === 'attach') {
    const current = attached.get(request.instanceId)
    if (current && current.instanceRevision > request.instanceRevision) {
      return
    }
    attached.set(request.instanceId, {
      definitionId: request.definitionId,
      instanceRevision: request.instanceRevision,
      inputs: request.inputs,
      previous: new Map(),
      previousCandles: new Map(),
      previousMarkers: '',
    })
    return
  }

  if (request.kind === 'detach') {
    const current = attached.get(request.instanceId)
    if (current?.instanceRevision === request.instanceRevision) {
      attached.delete(request.instanceId)
    }
    return
  }

  if (request.kind === 'bars-replace') {
    replaceBars(request.bars)
    return
  }

  if (request.kind === 'bars-tail') {
    writeTailBar(request.bar)
    return
  }

  if (attached.size === 0 || bars.length === 0) {
    post({
      kind: 'computed',
      generation: request.generation,
      roundId: request.roundId,
    })
    return
  }

  for (const [instanceId, indicator] of attached) {
    try {
      const { patches, candles, markers, undrawn } = computeInstance(
        indicator,
        request.full,
      )
      if (undrawn) {
        post({
          kind: 'no-output',
          generation: request.generation,
          roundId: request.roundId,
          instanceId,
          instanceRevision: indicator.instanceRevision,
          outputs: undrawn,
        })
        continue
      }
      if (patches.length === 0 && candles.length === 0 && markers === undefined) {
        continue
      }
      const transfer: Transferable[] = []
      for (const patch of patches) {
        transfer.push(patch.time.buffer, patch.value.buffer)
      }
      for (const patch of candles) {
        transfer.push(
          patch.time.buffer,
          patch.open.buffer,
          patch.high.buffer,
          patch.low.buffer,
          patch.close.buffer,
          patch.colorIndex.buffer,
        )
      }
      post(
        {
          kind: 'result',
          generation: request.generation,
          roundId: request.roundId,
          instanceId,
          instanceRevision: indicator.instanceRevision,
          patches,
          ...(candles.length === 0 ? {} : { candles }),
          ...(markers === undefined ? {} : { markers }),
        },
        transfer,
      )
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

  post({
    kind: 'computed',
    generation: request.generation,
    roundId: request.roundId,
  })
}
