import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type {
  MarketDataEvent,
  MarketDataRequest,
  StartStreamRequest,
  UtilityMessage,
  UtilityRequest,
} from '@shared/contracts/desktop'
import type { MarketSelection } from '@shared/types/market'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: NodeJS.Timeout
}

interface ReadyWaiter {
  resolve: () => void
  reject: (error: Error) => void
}

const requestTimeoutMs = 20_000
const restartBaseDelayMs = 1_000
const restartMaximumDelayMs = 15_000

export class MarketDataCoordinator {
  private child: UtilityProcess | undefined
  private pending = new Map<string, PendingRequest>()
  private ready = false
  private readyWaiters: ReadyWaiter[] = []

  private shuttingDown = false
  private restartTimer: NodeJS.Timeout | undefined
  private restartAttempt = 0
  private lastMessageAt = 0
  private activeSubscriptions = new Map<string, StartStreamRequest>()
  /** Starts already waiting for a fresh child and not needing restoration. */
  private waitingStarts = new Map<string, number>()

  constructor(
    private readonly onEvent: (event: MarketDataEvent) => void,
    private readonly serviceName = 'CryptoPro Market Data',
  ) {}

  start(): void {
    if (this.child || this.shuttingDown) {
      return
    }

    this.ready = false
    const child = utilityProcess.fork(
      join(__dirname, 'market-data.cjs'),
      [],
      {
        serviceName: this.serviceName,
        stdio: 'inherit',
      },
    )
    this.child = child
    // Every listener is bound to the child that installed it. A recycled
    // process can still deliver queued messages, and routing those into the
    // live state would broadcast events and schedule restarts twice.
    child.on('message', (message) => {
      if (this.child === child) {
        this.handleMessage(message)
      }
    })
    child.on('exit', (code) => this.handleExit(child, code))
    child.on('error', (_type, location) => {
      if (this.child === child) {
        this.failPending(new Error(
          `Falha fatal no processo de market data: ${location}`,
        ))
      }
    })
  }

  async request<T>(request: MarketDataRequest): Promise<T> {
    /*
     * Intent is known before process readiness. In particular, closing a tab
     * while the utility process restarts must remove it before `ready`
     * snapshots subscriptions for restoration.
    */
    this.trackIntent(request)
    const waitingStart = request.kind === 'start-stream'
      && (!this.ready || !this.child)
    if (waitingStart) {
      this.incrementWaitingStart(request.sessionId)
    }
    try {
      await this.waitUntilReady()
    } finally {
      if (waitingStart) {
        this.decrementWaitingStart(request.sessionId)
      }
    }
    const child = this.child
    if (!child) {
      throw new Error('Processo de market data indisponível')
    }

    const requestId = randomUUID()
    const command: UtilityRequest = {
      type: 'request',
      requestId,
      request,
    }
    const result = new Promise<unknown>((resolve, reject) => {
      const postedAt = Date.now()
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Timeout no comando de market data: ${request.kind}`))
        this.recycleIfUnresponsive(postedAt)
      }, requestTimeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      child.postMessage(command)
    })
    return await result as T
  }

  /** Releases every stream when the window that owns them is gone. */
  stopAllStreams(): void {
    const sessionIds = [...this.activeSubscriptions.keys()]
    this.activeSubscriptions.clear()
    if (!this.ready || !this.child) {
      return
    }
    sessionIds.forEach((sessionId) => {
      void this.request({ kind: 'stop-stream', sessionId })
        .catch(() => undefined)
    })
  }

  shutdown(): void {
    this.shuttingDown = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = undefined
    }
    const error = new Error('Aplicação encerrando')
    this.failPending(error)
    this.rejectReadyWaiters(error)
    this.activeSubscriptions.clear()
    this.child?.kill()
    this.child = undefined
    this.ready = false
  }

  /**
   * Mirrors the renderer's intent for the session so a restarted process can be
   * brought back to the same set of streams.
   */
  private trackIntent(request: MarketDataRequest): void {
    switch (request.kind) {
      case 'start-stream':
        this.activeSubscriptions.set(request.sessionId, request)
        return
      case 'update-candle-stream': {
        const current = this.activeSubscriptions.get(request.sessionId)
        this.activeSubscriptions.set(request.sessionId, current
          ? { ...current, selection: request.selection }
          : {
              kind: 'start-stream',
              sessionId: request.sessionId,
              selection: request.selection,
              visible: request.visible,
            })
        return
      }
      case 'set-stream-visibility':
        this.patchSubscription(request.sessionId, { visible: request.visible })
        return
      case 'set-order-book-aggregation':
        // Kept so a restored session comes back at the grouping the user chose
        // instead of falling back to the symbol's tick size.
        this.patchSubscription(request.sessionId, {
          aggregationStep: request.step,
        })
        return
      case 'stop-stream':
        this.activeSubscriptions.delete(request.sessionId)
        return
      default:
        // `catalog`, `symbols` and `candles` own no session state.
    }
  }

  private incrementWaitingStart(sessionId: string): void {
    const count = this.waitingStarts.get(sessionId) ?? 0
    this.waitingStarts.set(sessionId, count + 1)
  }

  private decrementWaitingStart(sessionId: string): void {
    const count = this.waitingStarts.get(sessionId) ?? 0
    if (count <= 1) {
      this.waitingStarts.delete(sessionId)
    } else {
      this.waitingStarts.set(sessionId, count - 1)
    }
  }

  private patchSubscription(
    sessionId: string,
    patch: Partial<StartStreamRequest>,
  ): void {
    const current = this.activeSubscriptions.get(sessionId)
    if (current) {
      this.activeSubscriptions.set(sessionId, { ...current, ...patch })
    }
  }

  private waitUntilReady(): Promise<void> {
    if (this.ready && this.child) {
      return Promise.resolve()
    }
    this.start()
    return new Promise<void>((resolve, reject) => {
      // The timer is cleared on every exit path. Leaving it armed kept a
      // pending timeout alive for the full window after each request issued
      // while the process was still starting.
      const timeout = setTimeout(() => {
        this.removeReadyWaiter(waiter)
        reject(new Error('Timeout ao iniciar processo de market data'))
      }, requestTimeoutMs)

      const waiter: ReadyWaiter = {
        resolve: () => {
          clearTimeout(timeout)
          resolve()
        },
        reject: (error: Error) => {
          clearTimeout(timeout)
          reject(error)
        },
      }
      this.readyWaiters.push(waiter)
    })
  }

  private removeReadyWaiter(waiter: ReadyWaiter): void {
    const index = this.readyWaiters.indexOf(waiter)
    if (index >= 0) {
      this.readyWaiters.splice(index, 1)
    }
  }

  private handleMessage(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return
    }
    // Any message is proof the process is still draining its loop.
    this.lastMessageAt = Date.now()
    const response = message as UtilityMessage
    if (response.type === 'ready') {
      this.ready = true
      this.restartAttempt = 0
      /*
       * Queue restoration before releasing requests that accumulated during
       * the restart. Updates and visibility changes require their session to
       * exist in the fresh process first. Pending starts are filtered below,
       * so they are still posted exactly once.
       */
      this.restoreSubscriptions()
      const waiters = this.readyWaiters.splice(0)
      waiters.forEach((waiter) => waiter.resolve())
      return
    }
    if (response.type === 'event') {
      this.onEvent(response.event)
      return
    }
    if (response.type !== 'response') {
      return
    }

    const pending = this.pending.get(response.requestId)
    if (!pending) {
      return
    }
    this.pending.delete(response.requestId)
    clearTimeout(pending.timeout)
    if (response.ok) {
      pending.resolve(response.result)
    } else {
      pending.reject(new Error(response.error))
    }
  }

  /**
   * A request times out either because one endpoint is slow — which the process
   * survives — or because it stopped answering at all, which it does not
   * recover from on its own. The difference is whether anything came back while
   * the request was outstanding, so only the second case forces a restart.
   */
  private recycleIfUnresponsive(postedAt: number): void {
    if (this.shuttingDown || !this.child || this.lastMessageAt > postedAt) {
      return
    }
    this.recycle(new Error(
      'Processo de market data parou de responder e será reiniciado',
    ))
  }

  private recycle(error: Error): void {
    const child = this.child
    if (!child) {
      return
    }
    this.child = undefined
    this.ready = false
    child.kill()
    this.abandonProcess(error)
  }

  private handleExit(child: UtilityProcess, code: number): void {
    if (this.child !== child) {
      // Already dropped by `recycle`, which scheduled its own restart.
      return
    }
    this.child = undefined
    this.ready = false
    this.abandonProcess(new Error(
      `Processo de market data encerrado com código ${code}`,
    ))
  }

  private abandonProcess(error: Error): void {
    this.failPending(error)
    this.rejectReadyWaiters(error)
    this.activeSubscriptions.forEach((subscription, sessionId) => {
      this.emitSessionError(sessionId, subscription.selection, error)
    })
    this.scheduleRestart()
  }

  /**
   * Backs off between attempts. A process that fails during startup used to be
   * forked once per second forever, each attempt emitting an error status to
   * every open session.
   */
  private scheduleRestart(): void {
    if (this.shuttingDown || this.restartTimer) {
      return
    }
    this.restartAttempt += 1
    const delay = Math.min(
      restartBaseDelayMs * (2 ** (this.restartAttempt - 1)),
      restartMaximumDelayMs,
    )
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined
      this.start()
    }, delay)
  }

  private restoreSubscriptions(): void {
    const subscriptions = [...this.activeSubscriptions.values()]
      .filter(({ sessionId }) => !this.waitingStarts.has(sessionId))
    subscriptions.forEach((subscription) => {
      void this.request(subscription).catch((error) => {
        this.emitSessionError(
          subscription.sessionId,
          subscription.selection,
          error,
        )
      })
    })
  }

  private emitSessionError(
    sessionId: string,
    selection: MarketSelection,
    error: unknown,
  ): void {
    this.onEvent({
      sessionId,
      kind: 'status',
      payload: {
        provider: selection.provider,
        market: selection.market,
        symbol: selection.symbol,
        state: 'error',
        candleState: 'error',
        orderBookState: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }

  private failPending(error: Error): void {
    this.pending.forEach((pending) => {
      clearTimeout(pending.timeout)
      pending.reject(error)
    })
    this.pending.clear()
  }

  private rejectReadyWaiters(error: Error): void {
    const waiters = this.readyWaiters.splice(0)
    waiters.forEach((waiter) => waiter.reject(error))
  }
}
