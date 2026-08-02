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
import IndicatorsWorker from '@/workers/indicators.worker?worker'

export interface IndicatorPatchHandler {
  (
    instanceId: string,
    patches: IndicatorPlotPatch[],
    markers?: IndicatorMarker[],
    candles?: IndicatorCandlePatch[],
  ): void
}

export interface IndicatorBars {
  time: number[]
  open: number[]
  high: number[]
  low: number[]
  close: number[]
  volume: number[]
}

export type IndicatorWorkerFactory = () => Worker

interface RegisteredIndicator {
  definitionId: string
  inputs: IndicatorInputs
  revision: number
}

interface ActiveRound {
  generation: number
  roundId: number
  full: boolean
  /** Registry snapshot at dispatch time; later attaches belong to the next round. */
  expected?: Map<string, number>
  /** Instances whose result was successfully committed to the chart. */
  received?: Set<string>
  /** Instances already handled by an explicit worker/application error. */
  failed?: Set<string>
}

interface CatalogWaiter {
  resolve: (definitions: IndicatorDefinition[]) => void
  reject: (error: Error) => void
}

const MAX_WORKER_RECOVERIES = 2
const MAX_INSTANCE_RECOVERIES = 2

/**
 * The catalog is static library data — 457 definitions that cannot change while
 * the process runs. Holding it here means opening the picker costs no worker
 * round trip and no structured clone of the whole registry, and that a chart
 * with no indicators applied never spins a worker just to list them.
 *
 * Module scope on purpose: every chart and every tab reads the same catalog.
 */
let catalogCache: IndicatorDefinition[] | undefined
let catalogInFlight: Promise<IndicatorDefinition[]> | undefined

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
  createWorker: IndicatorWorkerFactory = () => new IndicatorsWorker(),
) {
  let worker: Worker | undefined
  /**
   * Registered indicators, retained so a worker created later can be brought
   * up to the same state. Sending only the bars was not enough: a worker is
   * terminated when the last indicator is removed, and the next one has to be
   * told what to calculate as well as what to calculate it on.
   */
  const registered = new Map<string, RegisteredIndicator>()
  let generation = 0
  let roundSequence = 0
  /** Only this exact round is allowed to settle or mutate chart series. */
  let activeRound: ActiveRound | undefined
  let pending: { full: boolean } | undefined
  let onError: ((message: string) => void) | undefined
  let onNoOutput: ((instanceId: string, outputs: string[]) => void) | undefined
  let catalogWaiters: CatalogWaiter[] = []
  let workerRecoveries = 0
  let disposed = false
  /** One automatic full retry per instance after a chart application failure. */
  const applicationRetries = new Map<string, number>()
  /** Bounded repair attempts for calculation errors or a missing full result. */
  const instanceRecoveries = new Map<string, number>()

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

  function matchesActiveRound(
    message: { generation: number, roundId: number },
  ): boolean {
    return message.generation === generation
      && message.generation === activeRound?.generation
      && message.roundId === activeRound.roundId
  }

  /**
   * Rebuilds one worker-side indicator without replacing its chart objects.
   *
   * This is deliberately an error-path operation: a fresh bar snapshot and a
   * new instance revision make a transient library failure recoverable while
   * the ordinary realtime path remains one tail message plus one compute.
   */
  function recoverInstance(instanceId: string, reason: string): void {
    const current = registered.get(instanceId)
    const target = worker
    if (!current || !target || disposed) {
      return
    }
    const recoveries = instanceRecoveries.get(instanceId) ?? 0
    if (recoveries >= MAX_INSTANCE_RECOVERIES) {
      activeRound?.failed?.add(instanceId)
      onError?.(
        `${reason}. O indicador não pôde ser recuperado após ${recoveries} tentativas`,
      )
      return
    }

    instanceRecoveries.set(instanceId, recoveries + 1)
    const repaired: RegisteredIndicator = {
      ...current,
      revision: current.revision + 1,
    }
    registered.set(instanceId, repaired)
    activeRound?.failed?.add(instanceId)
    applicationRetries.delete(instanceId)

    // Refreshing the retained bars also eliminates a partially-updated input
    // snapshot as the cause of the calculation failure. This allocation only
    // exists on recovery, never on an ordinary market tick.
    sendBars(target, getBars())
    target.postMessage({
      kind: 'attach',
      instanceId,
      instanceRevision: repaired.revision,
      definitionId: repaired.definitionId,
      inputs: repaired.inputs,
    } satisfies IndicatorRequest)
    pending = { full: true }
  }

  function handleWorkerFailure(failed: Worker, reason: unknown): void {
    if (worker !== failed || disposed) {
      return
    }
    const message = reason instanceof Error ? reason.message : String(reason)
    onError?.(`Worker de indicadores interrompido: ${message}`)
    failed.onmessage = null
    failed.onerror = null
    failed.onmessageerror = null
    failed.terminate()
    worker = undefined
    generation += 1
    activeRound = undefined
    pending = undefined

    if (workerRecoveries >= MAX_WORKER_RECOVERIES) {
      const error = new Error(
        'Não foi possível recuperar o Worker de indicadores automaticamente',
      )
      const waiters = catalogWaiters
      catalogWaiters = []
      waiters.forEach((waiter) => waiter.reject(error))
      onError?.(error.message)
      return
    }
    workerRecoveries += 1

    try {
      const restored = ensureWorker()
      if (catalogWaiters.length > 0) {
        restored.postMessage({ kind: 'catalog' } satisfies IndicatorRequest)
      }
      if (registered.size > 0) {
        compute(true)
      }
    } catch (error) {
      const current = worker
      if (current) {
        handleWorkerFailure(current, error)
      } else {
        const failure = error instanceof Error ? error : new Error(String(error))
        const waiters = catalogWaiters
        catalogWaiters = []
        waiters.forEach((waiter) => waiter.reject(failure))
        onError?.(failure.message)
      }
    }
  }

  function handleMessage(
    source: Worker,
    message: IndicatorResponse,
  ): void {
    if (source !== worker || disposed) {
      return
    }
    if (message.kind === 'catalog') {
      workerRecoveries = 0
      const waiters = catalogWaiters
      catalogWaiters = []
      waiters.forEach((waiter) => waiter.resolve(message.definitions))
      return
    }
    if (message.kind === 'computed') {
      settle(message.generation, message.roundId)
      return
    }
    if (message.kind === 'no-output') {
      if (matchesActiveRound(message)) {
        // Accounted for as handled: the round did complete for this instance,
        // and repeating it would produce the same empty result.
        activeRound?.failed?.add(message.instanceId)
        onNoOutput?.(message.instanceId, message.outputs)
      }
      return
    }
    if (message.kind === 'error') {
      if (matchesActiveRound(message)) {
        onError?.(message.message)
        if (message.instanceId) {
          const current = registered.get(message.instanceId)
          if (
            current
            && message.instanceRevision === current.revision
          ) {
            recoverInstance(
              message.instanceId,
              `Falha ao calcular ${current.definitionId}: ${message.message}`,
            )
          }
        }
      }
      return
    }
    if (!matchesActiveRound(message)) {
      return
    }
    const round = activeRound
    if (!round) {
      return
    }
    const current = registered.get(message.instanceId)
    if (
      !current
      || current.revision !== message.instanceRevision
      || (
        round.expected
        && round.expected.get(message.instanceId) !== message.instanceRevision
      )
    ) {
      return
    }
    try {
      onPatch(
        message.instanceId,
        message.patches,
        message.markers,
        message.candles,
      )
      round.received?.add(message.instanceId)
      applicationRetries.delete(message.instanceId)
      instanceRecoveries.delete(message.instanceId)
    } catch (error) {
      round.failed?.add(message.instanceId)
      onError?.(error instanceof Error ? error.message : String(error))
      const retries = applicationRetries.get(message.instanceId) ?? 0
      if (retries < 1) {
        applicationRetries.set(message.instanceId, retries + 1)
        pending = { full: true }
      }
    }
  }

  function ensureWorker(): Worker {
    if (worker) {
      return worker
    }
    if (disposed) {
      throw new Error('Cliente de indicadores já foi descartado')
    }
    const created = createWorker()
    worker = created
    created.onmessage = (event: MessageEvent<IndicatorResponse>) => {
      handleMessage(created, event.data)
    }
    created.onerror = (event) => {
      event.preventDefault()
      handleWorkerFailure(created, event.error ?? event.message)
    }
    created.onmessageerror = () => {
      handleWorkerFailure(created, new Error('Mensagem inválida recebida do Worker'))
    }
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
        instanceRevision: entry.revision,
        definitionId: entry.definitionId,
        inputs: entry.inputs,
      })
    })
    return created
  }

  function settle(resultGeneration: number, resultRoundId: number): void {
    const completedRound = activeRound
    if (!completedRound || !matchesActiveRound({
      generation: resultGeneration,
      roundId: resultRoundId,
    })) {
      return
    }

    // A full compute must acknowledge every instance that existed when the
    // round was dispatched. Without this check a dropped/failed result leaves
    // an empty pane forever while the round itself appears to have completed.
    if (completedRound.full) {
      completedRound.expected?.forEach((revision, instanceId) => {
        const current = registered.get(instanceId)
        if (
          current?.revision === revision
          && !completedRound.received?.has(instanceId)
          && !completedRound.failed?.has(instanceId)
        ) {
          recoverInstance(
            instanceId,
            `O Worker concluiu sem devolver dados para ${current.definitionId}`,
          )
        }
      })
    }
    activeRound = undefined
    workerRecoveries = 0
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
    if (activeRound) {
      // Only the newest request survives: a tick that arrives while the worker
      // is busy replaces the one waiting rather than adding to a queue.
      pending = { full: full || (pending?.full ?? false) }
      return
    }
    const round: ActiveRound = {
      generation,
      roundId: ++roundSequence,
      full,
      ...(full
        ? {
            expected: new Map(
              [...registered].map(([instanceId, entry]) => [
                instanceId,
                entry.revision,
              ]),
            ),
            received: new Set<string>(),
            failed: new Set<string>(),
          }
        : {}),
    }
    activeRound = round
    send({
      kind: 'compute',
      generation: round.generation,
      roundId: round.roundId,
      full,
    })
  }

  function dispose(): void {
    if (disposed) {
      return
    }
    disposed = true
    const current = worker
    worker = undefined
    if (current) {
      current.onmessage = null
      current.onerror = null
      current.onmessageerror = null
      current.terminate()
    }
    activeRound = undefined
    pending = undefined
    applicationRetries.clear()
    instanceRecoveries.clear()
    registered.clear()
    const error = new Error('Cliente de indicadores descartado')
    const waiters = catalogWaiters
    catalogWaiters = []
    waiters.forEach((waiter) => waiter.reject(error))
  }

  return {
    catalog(): Promise<IndicatorDefinition[]> {
      if (catalogCache) {
        return Promise.resolve(catalogCache)
      }
      if (catalogInFlight) {
        return catalogInFlight
      }
      const request = new Promise<IndicatorDefinition[]>((resolve, reject) => {
        catalogWaiters.push({ resolve, reject })
        send({ kind: 'catalog' })
      }).then(
        (definitions) => {
          catalogCache = definitions
          catalogInFlight = undefined
          return definitions
        },
        (error: unknown) => {
          // A failed fetch must not be cached: the next open tries again.
          catalogInFlight = undefined
          throw error
        },
      )
      catalogInFlight = request
      return request
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
      const currentWorker = worker
      const revision = (registered.get(instanceId)?.revision ?? 0) + 1
      registered.set(instanceId, { definitionId, inputs, revision })
      applicationRetries.delete(instanceId)
      instanceRecoveries.delete(instanceId)
      if (currentWorker) {
        currentWorker.postMessage({
          kind: 'attach',
          instanceId,
          instanceRevision: revision,
          definitionId,
          inputs,
        } satisfies IndicatorRequest)
      } else {
        // `ensureWorker` hydrates the complete registry, including this entry.
        ensureWorker()
      }
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
      const current = registered.get(instanceId)
      const revision = (current?.revision ?? 0) + 1
      registered.set(instanceId, { definitionId, inputs, revision })
      applicationRetries.delete(instanceId)
      instanceRecoveries.delete(instanceId)
      send({
        kind: 'attach',
        instanceId,
        instanceRevision: revision,
        definitionId,
        inputs,
      })
    },

    detach(instanceId: string): void {
      const current = registered.get(instanceId)
      if (!current) {
        return
      }
      registered.delete(instanceId)
      applicationRetries.delete(instanceId)
      instanceRecoveries.delete(instanceId)
      worker?.postMessage({
        kind: 'detach',
        instanceId,
        instanceRevision: current.revision,
      } satisfies IndicatorRequest)
      if (registered.size === 0) {
        dispose()
      }
    },

    /** Invalidates in-flight work; the next compute replaces every series. */
    invalidate(): void {
      generation += 1
      activeRound = undefined
      pending = undefined
    },

    compute,

    setErrorHandler(handler: (message: string) => void): void {
      onError = handler
    },

    /** Reports a complete calculation that produced nothing to draw. */
    setNoOutputHandler(
      handler: (instanceId: string, outputs: string[]) => void,
    ): void {
      onNoOutput = handler
    },

    dispose,
  }
}

export type IndicatorClient = ReturnType<typeof createIndicatorClient>
