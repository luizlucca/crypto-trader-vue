import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketDataEvent,
  UtilityRequest,
} from '@shared/contracts/desktop'
import type { MarketSelection } from '@shared/types/market'

class FakeChild extends EventEmitter {
  static instances: FakeChild[] = []

  readonly posted: UtilityRequest[] = []
  killed = false

  constructor() {
    super()
    FakeChild.instances.push(this)
  }

  postMessage(message: UtilityRequest): void {
    this.posted.push(message)
  }

  kill(): boolean {
    this.killed = true
    return true
  }

  becomeReady(): void {
    this.emit('message', { type: 'ready' })
  }

  answer(request: UtilityRequest): void {
    this.emit('message', {
      type: 'response',
      requestId: request.requestId,
      ok: true,
      result: undefined,
    })
  }

  answerAll(): void {
    this.posted.forEach((request) => this.answer(request))
  }
}

vi.mock('electron', () => ({
  utilityProcess: { fork: () => new FakeChild() },
}))

const { MarketDataCoordinator } = await import('./coordinator')

const selection: MarketSelection = {
  provider: 'binance',
  market: 'spot',
  symbol: 'BTCUSDT',
  interval: '1m',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.01,
  pricePrecision: 2,
  quantityPrecision: 3,
}

function startStream(sessionId: string) {
  return { kind: 'start-stream', sessionId, selection, visible: true } as const
}

function kinds(child: FakeChild): string[] {
  return child.posted.map((message) => message.request.kind)
}

describe('MarketDataCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeChild.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores the streams a crashed process was carrying', async () => {
    const events: MarketDataEvent[] = []
    const coordinator = new MarketDataCoordinator((event) => events.push(event))
    coordinator.start()

    const first = FakeChild.instances[0]
    first.becomeReady()
    const started = coordinator.request(startStream('tab-one'))
    await vi.advanceTimersByTimeAsync(0)
    first.answerAll()
    await started

    first.emit('exit', 1)
    expect(events.at(-1)).toEqual(expect.objectContaining({
      sessionId: 'tab-one',
      kind: 'status',
      payload: expect.objectContaining({ state: 'error' }),
    }))

    await vi.advanceTimersByTimeAsync(1_000)
    const second = FakeChild.instances[1]
    second.becomeReady()
    await vi.advanceTimersByTimeAsync(0)

    expect(kinds(second)).toEqual(['start-stream'])
    coordinator.shutdown()
  })

  it('recycles a mute process and forgets stopped streams', async () => {
    const coordinator = new MarketDataCoordinator(() => {})
    coordinator.start()

    const first = FakeChild.instances[0]
    first.becomeReady()
    const started = coordinator.request(startStream('tab-one'))
    await vi.advanceTimersByTimeAsync(0)
    first.answerAll()
    await started

    // The renderer asks to stop and the process never answers.
    const stopped = coordinator
      .request({ kind: 'stop-stream', sessionId: 'tab-one' })
      .catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(stopped).resolves.toMatch(/Timeout/)
    expect(first.killed).toBe(true)

    await vi.advanceTimersByTimeAsync(1_000)
    const second = FakeChild.instances[1]
    second.becomeReady()
    await vi.advanceTimersByTimeAsync(0)

    // A session the renderer already released must not come back.
    expect(kinds(second)).toEqual([])
    coordinator.shutdown()
  })

  it('não restaura uma aba fechada enquanto o processo reinicia', async () => {
    const coordinator = new MarketDataCoordinator(() => {})
    coordinator.start()
    const first = FakeChild.instances[0]
    first.becomeReady()
    const started = coordinator.request(startStream('tab-one'))
    await vi.advanceTimersByTimeAsync(0)
    first.answerAll()
    await started

    first.emit('exit', 1)
    await vi.advanceTimersByTimeAsync(1_000)
    const second = FakeChild.instances[1]
    const stopped = coordinator.request({
      kind: 'stop-stream',
      sessionId: 'tab-one',
    })

    second.becomeReady()
    await vi.advanceTimersByTimeAsync(0)
    expect(kinds(second)).toEqual(['stop-stream'])
    second.answerAll()
    await stopped
    coordinator.shutdown()
  })

  it('restaura a sessão antes da atualização pendente', async () => {
    const coordinator = new MarketDataCoordinator(() => {})
    coordinator.start()
    const first = FakeChild.instances[0]
    first.becomeReady()
    const started = coordinator.request(startStream('tab-one'))
    await vi.advanceTimersByTimeAsync(0)
    first.answerAll()
    await started

    first.emit('exit', 1)
    await vi.advanceTimersByTimeAsync(1_000)
    const second = FakeChild.instances[1]
    const updated = coordinator.request({
      kind: 'update-candle-stream',
      sessionId: 'tab-one',
      selection: { ...selection, interval: '5m' },
      visible: true,
    })

    second.becomeReady()
    await vi.advanceTimersByTimeAsync(0)
    expect(kinds(second)).toEqual([
      'start-stream',
      'update-candle-stream',
    ])
    second.answerAll()
    await updated
    coordinator.shutdown()
  })

  it('keeps a slow process that still produces traffic', async () => {
    const coordinator = new MarketDataCoordinator(() => {})
    coordinator.start()

    const first = FakeChild.instances[0]
    first.becomeReady()
    const pending = coordinator
      .request({ kind: 'candles', selection, limit: 400 })
      .catch((error: Error) => error.message)
    await vi.advanceTimersByTimeAsync(10_000)
    first.emit('message', {
      type: 'event',
      event: { sessionId: 'tab-one', kind: 'status', payload: {} },
    })

    await vi.advanceTimersByTimeAsync(20_000)
    await expect(pending).resolves.toMatch(/Timeout/)
    expect(first.killed).toBe(false)

    coordinator.shutdown()
  })
})
