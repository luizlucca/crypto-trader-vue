import { describe, expect, it, vi } from 'vitest'
import type {
  IndicatorPlotPatch,
  IndicatorRequest,
  IndicatorResponse,
} from '@/domain/indicatorProtocol'
import { createIndicatorClient } from './indicators'

const bars = {
  time: [1, 2, 3],
  open: [10, 11, 12],
  high: [11, 12, 13],
  low: [9, 10, 11],
  close: [10.5, 11.5, 12.5],
  volume: [100, 110, 120],
}

const patch: IndicatorPlotPatch = {
  plotId: 'plot0',
  full: true,
  from: 0,
  time: Float64Array.from([1, 2, 3]),
  value: Float64Array.from([40, 50, 60]),
}

class FakeWorker {
  onmessage: ((event: MessageEvent<IndicatorResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  readonly requests: IndicatorRequest[] = []
  terminated = false

  postMessage(message: IndicatorRequest): void {
    this.requests.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  emit(message: IndicatorResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<IndicatorResponse>)
  }

  crash(message: string): void {
    this.onerror?.({
      error: new Error(message),
      message,
      preventDefault: vi.fn(),
    } as unknown as ErrorEvent)
  }

  computes(): Extract<IndicatorRequest, { kind: 'compute' }>[] {
    return this.requests.filter(
      (request): request is Extract<IndicatorRequest, { kind: 'compute' }> => (
        request.kind === 'compute'
      ),
    )
  }

  attaches(): Extract<IndicatorRequest, { kind: 'attach' }>[] {
    return this.requests.filter(
      (request): request is Extract<IndicatorRequest, { kind: 'attach' }> => (
        request.kind === 'attach'
      ),
    )
  }
}

function workerFactory(workers: FakeWorker[]) {
  return () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker as unknown as Worker
  }
}

function result(
  round: Extract<IndicatorRequest, { kind: 'compute' }>,
  revision: number,
  instanceId = 'indicator-one',
): IndicatorResponse {
  return {
    kind: 'result',
    generation: round.generation,
    roundId: round.roundId,
    instanceId,
    instanceRevision: revision,
    patches: [patch],
  }
}

function computed(
  round: Extract<IndicatorRequest, { kind: 'compute' }>,
): IndicatorResponse {
  return {
    kind: 'computed',
    generation: round.generation,
    roundId: round.roundId,
  }
}

describe('indicator worker client', () => {
  it('discards an old instance revision and computes the newest one in full', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))

    client.attach('indicator-one', 'mfi-rsi-bb', { rsiLength: 14 })
    client.compute(true)
    const worker = workers[0]
    const firstRound = worker.computes()[0]

    client.reconfigure('indicator-one', 'mfi-rsi-bb', { rsiLength: 21 })
    client.compute(true)
    expect(worker.computes()).toHaveLength(1)

    worker.emit(result(firstRound, 1))
    expect(apply).not.toHaveBeenCalled()
    worker.emit(computed(firstRound))

    const secondRound = worker.computes()[1]
    expect(secondRound.full).toBe(true)
    expect(secondRound.roundId).toBeGreaterThan(firstRound.roundId)
    worker.emit(result(secondRound, 2))
    worker.emit(computed(secondRound))

    expect(apply).toHaveBeenCalledOnce()
    client.dispose()
  })

  it('does not let a stale completion settle a newer round', () => {
    const workers: FakeWorker[] = []
    const client = createIndicatorClient(
      vi.fn(),
      () => bars,
      workerFactory(workers),
    )
    client.attach('indicator-one', 'sma', { length: 20 })
    client.compute(false)
    const worker = workers[0]
    const firstRound = worker.computes()[0]
    worker.emit(computed(firstRound))

    client.compute(false)
    const secondRound = worker.computes()[1]
    client.compute(false)
    worker.emit(computed(firstRound))
    expect(worker.computes()).toHaveLength(2)

    worker.emit(computed(secondRound))
    expect(worker.computes()).toHaveLength(3)
    client.dispose()
  })

  it('requests one complete retry when applying a result to the chart fails', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('series was recycled')
      })
    const errors: string[] = []
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))
    client.setErrorHandler((message) => errors.push(message))
    client.attach('indicator-one', 'mfi-rsi-bb', {})
    client.compute(true)

    const worker = workers[0]
    const firstRound = worker.computes()[0]
    worker.emit(result(firstRound, 1))
    worker.emit(computed(firstRound))

    const retryRound = worker.computes()[1]
    expect(retryRound.full).toBe(true)
    worker.emit(result(retryRound, 1))
    worker.emit(computed(retryRound))

    expect(apply).toHaveBeenCalledTimes(2)
    expect(errors).toContain('series was recycled')
    client.dispose()
  })

  it('rehydrates bars and indicators after a worker failure', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))
    client.attach('indicator-one', 'mfi-rsi-bb', {})
    client.compute(true)

    workers[0].crash('worker stopped')

    expect(workers).toHaveLength(2)
    expect(workers[0].terminated).toBe(true)
    expect(workers[1].requests[0]).toMatchObject({ kind: 'bars-replace' })
    expect(workers[1].attaches()).toEqual([
      expect.objectContaining({
        instanceId: 'indicator-one',
        instanceRevision: 1,
      }),
    ])
    expect(workers[1].computes()).toEqual([
      expect.objectContaining({ full: true, generation: 1 }),
    ])
    client.dispose()
  })

  it('rebuilds an instance after a calculation error instead of leaving it blank', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
    const errors: string[] = []
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))
    client.setErrorHandler((message) => errors.push(message))
    client.attach('indicator-one', 'mfi-rsi-bb', {})
    client.compute(true)

    const worker = workers[0]
    const failedRound = worker.computes()[0]
    worker.emit({
      kind: 'error',
      generation: failedRound.generation,
      roundId: failedRound.roundId,
      instanceId: 'indicator-one',
      instanceRevision: 1,
      message: 'transient calculation failure',
    })
    worker.emit(computed(failedRound))

    expect(worker.requests.filter((request) => request.kind === 'bars-replace'))
      .toHaveLength(2)
    expect(worker.attaches().at(-1)).toMatchObject({
      instanceId: 'indicator-one',
      instanceRevision: 2,
    })
    const retryRound = worker.computes().at(-1)!
    expect(retryRound.full).toBe(true)

    worker.emit(result(retryRound, 2))
    worker.emit(computed(retryRound))
    expect(apply).toHaveBeenCalledOnce()
    expect(errors).toContain('transient calculation failure')
    client.dispose()
  })

  it('repairs an instance when a full round completes without its result', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))
    client.attach('indicator-one', 'mfi-rsi-bb', {})
    client.compute(true)

    const worker = workers[0]
    worker.emit(computed(worker.computes()[0]))

    expect(worker.attaches().at(-1)).toMatchObject({
      instanceId: 'indicator-one',
      instanceRevision: 2,
    })
    const retryRound = worker.computes().at(-1)!
    expect(retryRound.full).toBe(true)
    worker.emit(result(retryRound, 2))
    worker.emit(computed(retryRound))

    expect(apply).toHaveBeenCalledOnce()
    client.dispose()
  })

  it('keeps a base indicator alive through repeated oscillator cycles', () => {
    const workers: FakeWorker[] = []
    const apply = vi.fn()
    const client = createIndicatorClient(apply, () => bars, workerFactory(workers))
    client.attach('sma-base', 'sma', { length: 20 })
    client.compute(true)
    const worker = workers[0]
    const baseRound = worker.computes()[0]
    worker.emit(result(baseRound, 1, 'sma-base'))
    worker.emit(computed(baseRound))
    apply.mockClear()

    for (let cycle = 0; cycle < 100; cycle += 1) {
      const instanceId = `mfi-${cycle}`
      client.attach(instanceId, 'mfi-rsi-bb', { rsiLength: 14 })
      client.compute(true)
      const round = worker.computes().at(-1)!
      worker.emit(result(round, 1, 'sma-base'))
      worker.emit(result(round, 1, instanceId))
      worker.emit(computed(round))
      client.detach(instanceId)
    }

    expect(workers).toHaveLength(1)
    expect(worker.terminated).toBe(false)
    expect(
      apply.mock.calls.filter(([instanceId]) => instanceId.startsWith('mfi-')),
    ).toHaveLength(100)
    client.dispose()
  })

  it('reports an undrawable output without trying to repair it', () => {
    const workers: FakeWorker[] = []
    const unsupported = vi.fn()
    const client = createIndicatorClient(vi.fn(), () => bars, workerFactory(workers))
    client.setNoOutputHandler(unsupported)

    client.attach('cvd-one', 'cvd', {})
    client.compute(true)
    const worker = workers[0]
    const round = worker.computes()[0]
    const attachesBefore = worker.attaches().length

    worker.emit({
      kind: 'no-output',
      generation: round.generation,
      roundId: round.roundId,
      instanceId: 'cvd-one',
      instanceRevision: 1,
      outputs: ['plotCandles'],
    })
    worker.emit(computed(round))

    expect(unsupported).toHaveBeenCalledWith('cvd-one', ['plotCandles'])
    // Recalculating cannot change an unsupported output kind: no repair round,
    // no new revision, no compute loop.
    expect(worker.attaches()).toHaveLength(attachesBefore)
    expect(worker.computes()).toHaveLength(1)
    client.dispose()
  })

  it('recovers from an unreadable message like it does from a crash', () => {
    const workers: FakeWorker[] = []
    const errors: string[] = []
    const client = createIndicatorClient(
      vi.fn(),
      () => bars,
      workerFactory(workers),
    )
    client.setErrorHandler((message) => errors.push(message))
    client.attach('indicator-one', 'sma', { length: 20 })
    client.compute(true)

    workers[0].onmessageerror?.()

    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)
    expect(workers[1].requests[0]).toMatchObject({ kind: 'bars-replace' })
    expect(workers[1].attaches()).toEqual([
      expect.objectContaining({
        instanceId: 'indicator-one',
        instanceRevision: 1,
      }),
    ])
    expect(errors.some((message) => message.includes('Mensagem inválida')))
      .toBe(true)
    client.dispose()
  })

  it('stops recreating the worker once the recovery limit is reached', () => {
    const workers: FakeWorker[] = []
    const errors: string[] = []
    const client = createIndicatorClient(
      vi.fn(),
      () => bars,
      workerFactory(workers),
    )
    client.setErrorHandler((message) => errors.push(message))
    client.attach('indicator-one', 'sma', { length: 20 })
    client.compute(true)

    workers[0].crash('primeira')
    workers[1].crash('segunda')
    workers[2].crash('terceira')

    // Bounded on purpose: a worker that dies on every start would otherwise
    // spin the recreation loop forever.
    expect(workers).toHaveLength(3)
    expect(errors.at(-1)).toContain('Não foi possível recuperar o Worker')
    client.dispose()
  })

  it('terminates the worker when the last indicator is removed', () => {
    const workers: FakeWorker[] = []
    const client = createIndicatorClient(
      vi.fn(),
      () => bars,
      workerFactory(workers),
    )
    client.attach('only-one', 'sma', { length: 20 })
    client.compute(true)
    expect(workers[0].terminated).toBe(false)

    client.detach('only-one')

    // A chart left without indicators pays nothing.
    expect(workers[0].terminated).toBe(true)
  })

  it('serves the catalog from cache instead of asking the worker again', async () => {
    const workers: FakeWorker[] = []
    const client = createIndicatorClient(vi.fn(), () => bars, workerFactory(workers))

    const first = client.catalog()
    const definitions = [{ id: 'sma' }] as never
    workers[0].emit({ kind: 'catalog', definitions })
    expect(await first).toBe(definitions)

    client.dispose()
    // A disposed client would have no worker to ask; the cache still answers.
    const later = createIndicatorClient(vi.fn(), () => bars, workerFactory(workers))
    expect(await later.catalog()).toBe(definitions)
    expect(workers).toHaveLength(1)
    later.dispose()
  })
})
