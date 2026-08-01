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
import IndicatorsWorker from '@/workers/indicators.worker?worker'

export interface IndicatorPatchHandler {
  (instanceId: string, patches: IndicatorPlotPatch[]): void
}

export interface IndicatorBars {
  time: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

/**
 * Client for the indicator worker.
 *
 * Created on demand and terminated when the last indicator is removed, so a
 * chart without indicators pays nothing. One client serves one chart.
 */
/**
 * @param onPatch  applies a calculation result to the chart.
 * @param getBars  reads the current history. The client calls it whenever it
 *                 has to create a worker, so a worker can never start empty.
 */
export function createIndicatorClient(
  onPatch: IndicatorPatchHandler,
  getBars: () => IndicatorBars,
) {
  let worker: Worker | undefined
  /**
   * Registered indicators, retained so a worker created later can be brought
   * up to the same state. Sending only the bars was not enough: a worker is
   * terminated when the last indicator is removed, and the next one has to be
   * told what to calculate as well as what to calculate it on.
   */
  const registered = new Map<string, {
    definitionId: string
    inputs: IndicatorInputs
  }>()
  let generation = 0
  /** A compute is in flight; a newer request waits here instead of queueing. */
  let inFlight = false
  let pending: { full: boolean } | undefined
  let onError: ((message: string) => void) | undefined
  let catalogWaiters: ((definitions: IndicatorDefinition[]) => void)[] = []

  function sendBars(target: Worker, bars: IndicatorBars): void {
    const payload: IndicatorBarsPayload = {
      time: Float64Array.from(bars.time),
      open: Float64Array.from(bars.open),
      high: Float64Array.from(bars.high),
      low: Float64Array.from(bars.low),
      close: Float64Array.from(bars.close),
      volume: Float64Array.from(bars.volume),
    }
    target.postMessage({ kind: 'bars-replace', bars: payload }, [
      payload.time.buffer,
      payload.open.buffer,
      payload.high.buffer,
      payload.low.buffer,
      payload.close.buffer,
      payload.volume.buffer,
    ])
  }

  function ensureWorker(): Worker {
    if (worker) {
      return worker
    }
    const created = new IndicatorsWorker()
    created.onmessage = (event: MessageEvent<IndicatorResponse>) => {
      const message = event.data
      if (message.kind === 'catalog') {
        const waiters = catalogWaiters
        catalogWaiters = []
        waiters.forEach((resolve) => resolve(message.definitions))
        return
      }
      if (message.kind === 'computed') {
        settle(message.generation)
        return
      }
      if (message.kind === 'error') {
        onError?.(message.message)
        return
      }
      try {
        // A result for a superseded generation describes bars that no longer
        // exist on the chart; applying it would draw the past over the present.
        if (message.generation === generation) {
          onPatch(message.instanceId, message.patches)
        }
      } catch (error) {
        // A failure applying one indicator must not stop the others, nor the
        // completion message that releases the next calculation.
        onError?.(error instanceof Error ? error.message : String(error))
      }
    }
    worker = created
    /*
     * A worker is created here on first use and again after the previous one
     * was terminated — which happens whenever the last indicator is removed.
     * Seeding it immediately removes the possibility of a worker calculating
     * against an empty history, which showed up as an indicator added after a
     * removal drawing nothing.
     */
    sendBars(created, getBars())
    registered.forEach((entry, instanceId) => {
      created.postMessage({
        kind: 'attach',
        instanceId,
        definitionId: entry.definitionId,
        inputs: entry.inputs,
      })
    })
    return created
  }

  function settle(resultGeneration: number): void {
    if (resultGeneration !== generation) {
      return
    }
    inFlight = false
    const next = pending
    pending = undefined
    if (next) {
      compute(next.full)
    }
  }

  function send(request: IndicatorRequest, transfer: Transferable[] = []): void {
    ensureWorker().postMessage(request, transfer)
  }

  function compute(full = false): void {
    if (registered.size === 0) {
      return
    }
    if (inFlight) {
      // Only the newest request survives: a tick that arrives while the worker
      // is busy replaces the one waiting rather than adding to a queue.
      pending = { full: full || (pending?.full ?? false) }
      return
    }
    inFlight = true
    send({ kind: 'compute', generation, full })
  }

  return {
    catalog(): Promise<IndicatorDefinition[]> {
      return new Promise((resolve) => {
        catalogWaiters.push(resolve)
        send({ kind: 'catalog' })
      })
    },

    /** Resends the full history after it changed underneath the worker. */
    replaceBars(bars: IndicatorBars): void {
      sendBars(ensureWorker(), bars)
    },

    /**
     * One bar per tick. Six numbers, no array and no typed-array allocation on
     * the thread that draws the chart.
     */
    appendBar(bar: IndicatorBar): void {
      if (registered.size === 0) {
        return
      }
      send({ kind: 'bars-tail', bar })
    },

    /**
     * Registers an indicator. Counted, because the worker is terminated once
     * the last one is removed.
     */
    attach(
      instanceId: string,
      definitionId: string,
      inputs: IndicatorInputs,
    ): void {
      registered.set(instanceId, { definitionId, inputs })
      send({ kind: 'attach', instanceId, definitionId, inputs })
    },

    /**
     * Replaces the parameters of an indicator already registered. Separate
     * from `attach` on purpose: reusing it here inflated the count, and the
     * worker then outlived the last indicator instead of being terminated.
     */
    reconfigure(
      instanceId: string,
      definitionId: string,
      inputs: IndicatorInputs,
    ): void {
      registered.set(instanceId, { definitionId, inputs })
      send({ kind: 'attach', instanceId, definitionId, inputs })
    },

    detach(instanceId: string): void {
      if (!registered.delete(instanceId)) {
        return
      }
      send({ kind: 'detach', instanceId })
      if (registered.size === 0) {
        this.dispose()
      }
    },

    /** Invalidates in-flight work; the next compute replaces every series. */
    invalidate(): void {
      generation += 1
      inFlight = false
      pending = undefined
    },

    compute,

    setErrorHandler(handler: (message: string) => void): void {
      onError = handler
    },

    dispose(): void {
      worker?.terminate()
      worker = undefined
      inFlight = false
      pending = undefined
      catalogWaiters = []
      registered.clear()
    },
  }
}

export type IndicatorClient = ReturnType<typeof createIndicatorClient>
