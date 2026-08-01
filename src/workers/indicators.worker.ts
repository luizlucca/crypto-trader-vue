import { indicatorRegistry } from 'lightweight-charts-indicators'
import type {
  IndicatorBar,
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
  }
}

const registry = indicatorRegistry as unknown as RegistryEntry[]
const byId = new Map(registry.map((entry) => [entry.id, entry]))

/** Retained per instance so a tick can be answered with a diff. */
interface AttachedIndicator {
  definitionId: string
  inputs: IndicatorInputs
  previous: Map<string, { time: Float64Array, value: Float64Array }>
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

function computeInstance(
  indicator: AttachedIndicator,
  forceFull: boolean,
): IndicatorPlotPatch[] {
  const entry = byId.get(indicator.definitionId)
  if (!entry) {
    throw new Error(`Indicador desconhecido: ${indicator.definitionId}`)
  }

  const result = entry.calculate(bars, indicator.inputs)
  const patches: IndicatorPlotPatch[] = []

  for (const [plotId, points] of Object.entries(result.plots ?? {})) {
    // Points whose value is not finite are gaps; the chart cannot plot them.
    let count = 0
    const time = new Float64Array(points.length)
    const value = new Float64Array(points.length)
    for (const point of points) {
      if (Number.isFinite(point?.value) && Number.isFinite(point?.time)) {
        time[count] = point.time
        value[count] = point.value
        count += 1
      }
    }
    const trimmedTime = time.subarray(0, count)
    const trimmedValue = value.subarray(0, count)

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

  return patches
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
    attached.set(request.instanceId, {
      definitionId: request.definitionId,
      inputs: request.inputs,
      previous: new Map(),
    })
    return
  }

  if (request.kind === 'detach') {
    attached.delete(request.instanceId)
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
    post({ kind: 'computed', generation: request.generation })
    return
  }

  for (const [instanceId, indicator] of attached) {
    try {
      const patches = computeInstance(indicator, request.full)
      if (patches.length === 0) {
        continue
      }
      const transfer: Transferable[] = []
      for (const patch of patches) {
        transfer.push(patch.time.buffer, patch.value.buffer)
      }
      post(
        {
          kind: 'result',
          generation: request.generation,
          instanceId,
          patches,
        },
        transfer,
      )
    } catch (error) {
      post({
        kind: 'error',
        generation: request.generation,
        instanceId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  post({ kind: 'computed', generation: request.generation })
}
