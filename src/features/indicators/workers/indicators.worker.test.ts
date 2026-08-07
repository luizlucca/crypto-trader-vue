import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IndicatorBarsPayload,
  IndicatorRequest,
  IndicatorResponse,
} from '@indicators/domain/indicatorProtocol'

interface WorkerHarness {
  onmessage: ((event: MessageEvent<IndicatorRequest>) => void) | null
  postMessage: ReturnType<typeof vi.fn>
}

function history(size: number): IndicatorBarsPayload {
  const time = new Float64Array(size)
  const open = new Float64Array(size)
  const high = new Float64Array(size)
  const low = new Float64Array(size)
  const close = new Float64Array(size)
  const volume = new Float64Array(size)
  for (let index = 0; index < size; index += 1) {
    const price = 100 + index
    time[index] = 1_700_000_000 + (index * 60)
    open[index] = price - 1
    high[index] = price + 2
    low[index] = price - 2
    close[index] = price
    volume[index] = 1_000 + index
  }
  return { time, open, high, low, close, volume }
}

describe('indicator worker protocol', () => {
  let worker: WorkerHarness

  beforeEach(async () => {
    vi.resetModules()
    worker = {
      onmessage: null,
      postMessage: vi.fn(),
    }
    vi.stubGlobal('self', worker)
    await import('./indicators.worker')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function dispatch(request: IndicatorRequest): void {
    worker.onmessage?.({ data: request } as MessageEvent<IndicatorRequest>)
  }

  function responses(): IndicatorResponse[] {
    return worker.postMessage.mock.calls.map(([message]) => message)
  }

  function attachSma(): void {
    dispatch({ kind: 'bars-replace', bars: history(80) })
    dispatch({
      kind: 'attach',
      instanceId: 'sma-one',
      instanceRevision: 1,
      definitionId: 'sma',
      inputs: {
        length: 20,
        source: 'close',
        offset: 0,
        maType: 'None',
        maLength: 14,
        bbMult: 2,
      },
    })
  }

  it('sends a full snapshot once and only the changed tail afterwards', () => {
    attachSma()
    dispatch({ kind: 'compute', generation: 0, roundId: 1, full: true })

    const initial = responses().find((message) => message.kind === 'result')
    expect(initial?.kind).toBe('result')
    if (initial?.kind !== 'result') {
      return
    }
    const fullPlot = initial.patches.find((patch) => patch.plotId === 'plot0')
    expect(fullPlot?.full).toBe(true)
    expect(fullPlot?.time.length).toBeGreaterThan(50)

    worker.postMessage.mockClear()
    dispatch({
      kind: 'bars-tail',
      bar: {
        time: 1_700_000_000 + (79 * 60),
        open: 178,
        high: 183,
        low: 177,
        close: 181,
        volume: 1_100,
      },
    })
    dispatch({ kind: 'compute', generation: 0, roundId: 2, full: false })

    const updated = responses().find((message) => message.kind === 'result')
    expect(updated?.kind).toBe('result')
    if (updated?.kind !== 'result') {
      return
    }
    const tail = updated.patches.find((patch) => patch.plotId === 'plot0')
    expect(tail?.full).toBe(false)
    expect(tail?.time).toHaveLength(1)
  })

  it('isolates a failing instance without withholding the round', () => {
    attachSma()
    dispatch({
      kind: 'attach',
      instanceId: 'broken-one',
      instanceRevision: 1,
      definitionId: 'indicador-que-nao-existe',
      inputs: {},
    })
    dispatch({ kind: 'compute', generation: 0, roundId: 1, full: true })

    const messages = responses()
    expect(messages.find((message) => message.kind === 'error'))
      .toMatchObject({ instanceId: 'broken-one', instanceRevision: 1 })
    // The healthy sibling still draws...
    expect(messages.some((message) => (
      message.kind === 'result' && message.instanceId === 'sma-one'
    ))).toBe(true)
    // ...and the round is still released, or the client waits forever.
    expect(messages.at(-1))
      .toEqual({ kind: 'computed', generation: 0, roundId: 1 })
  })

  it('completes a round even when there is nothing to calculate', () => {
    dispatch({ kind: 'bars-replace', bars: history(10) })
    dispatch({ kind: 'compute', generation: 3, roundId: 7, full: true })

    expect(responses())
      .toEqual([{ kind: 'computed', generation: 3, roundId: 7 }])
  })

  it('ignores a tail bar older than the history it already holds', () => {
    attachSma()
    dispatch({ kind: 'compute', generation: 0, roundId: 1, full: true })
    worker.postMessage.mockClear()

    dispatch({
      kind: 'bars-tail',
      bar: {
        time: 1_700_000_000,
        open: 1,
        high: 2,
        low: 0,
        close: 1,
        volume: 1,
      },
    })
    dispatch({ kind: 'compute', generation: 0, roundId: 2, full: false })

    // A late duplicate of an old bar must not rewrite the series behind it.
    expect(responses())
      .toEqual([{ kind: 'computed', generation: 0, roundId: 2 }])
  })

  it('emits only the round completion when no output changed', () => {
    attachSma()
    dispatch({ kind: 'compute', generation: 0, roundId: 1, full: true })
    worker.postMessage.mockClear()

    dispatch({ kind: 'compute', generation: 0, roundId: 2, full: false })

    expect(responses()).toEqual([{
      kind: 'computed',
      generation: 0,
      roundId: 2,
    }])
  })
})
