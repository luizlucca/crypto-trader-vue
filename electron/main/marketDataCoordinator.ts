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

export class MarketDataCoordinator {
  private child: UtilityProcess | undefined
  private pending = new Map<string, PendingRequest>()
  private ready = false
  private readyWaiters: ReadyWaiter[] = []

  private shuttingDown = false
  private restartTimer: NodeJS.Timeout | undefined
  private activeSubscriptions = new Map<string, StartStreamRequest>()

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
    child.on('message', (message) => this.handleMessage(message))
    child.on('exit', (code) => this.handleExit(code))
    child.on('error', (_type, location) => {
      this.failPending(new Error(
        `Falha fatal no processo de market data: ${location}`,
      ))
    })
  }

  async request<T>(request: MarketDataRequest): Promise<T> {
    await this.waitUntilReady()
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
      const timeout = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error(`Timeout no comando de market data: ${request.kind}`))
      }, requestTimeoutMs)
      this.pending.set(requestId, { resolve, reject, timeout })
      child.postMessage(command)
    })

    const value = await result
    if (request.kind === 'start-stream') {
      this.activeSubscriptions.set(request.sessionId, request)
    } else if (request.kind === 'update-candle-stream') {
      const subscription = this.activeSubscriptions.get(request.sessionId)
      if (subscription) {
        this.activeSubscriptions.set(request.sessionId, {
          ...subscription,
          selection: request.selection,
        })
      } else {
        this.activeSubscriptions.set(request.sessionId, {
          kind: 'start-stream',
          sessionId: request.sessionId,
          selection: request.selection,
          visible: request.visible,
        })
      }
    } else if (request.kind === 'stop-stream') {
      this.activeSubscriptions.delete(request.sessionId)
    } else if (request.kind === 'set-stream-visibility') {
      const subscription = this.activeSubscriptions.get(request.sessionId)
      if (subscription) {
        this.activeSubscriptions.set(request.sessionId, {
          ...subscription,
          visible: request.visible,
        })
      }
    }
    return value as T
  }

  shutdown(): void {
    this.shuttingDown = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = undefined
    }
    this.failPending(new Error('Aplicação encerrando'))
    this.rejectReadyWaiters(new Error('Aplicação encerrando'))
    this.child?.kill()
    this.child = undefined
    this.ready = false
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
    const response = message as UtilityMessage
    if (response.type === 'ready') {
      this.ready = true
      const waiters = this.readyWaiters.splice(0)
      waiters.forEach((waiter) => waiter.resolve())
      this.restoreSubscriptions()
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

  private handleExit(code: number): void {
    this.child = undefined
    this.ready = false
    const error = new Error(`Processo de market data encerrado com código ${code}`)
    this.failPending(error)
    this.rejectReadyWaiters(error)
    this.emitProcessError(error)

    if (!this.shuttingDown) {
      this.restartTimer = setTimeout(() => {
        this.restartTimer = undefined
        this.start()
      }, 1_000)
    }
  }

  private emitProcessError(error: unknown): void {
    this.activeSubscriptions.forEach((subscription, sessionId) => {
      const selection = subscription.selection
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
    })
  }

  private restoreSubscriptions(): void {
    const subscriptions = [...this.activeSubscriptions.values()]
    subscriptions.forEach((subscription) => {
      void this.request(subscription).catch((error) => {
        this.emitSessionError(subscription, error)
      })
    })
  }

  private emitSessionError(
    subscription: StartStreamRequest,
    error: unknown,
  ): void {
    const selection = subscription.selection
    this.onEvent({
      sessionId: subscription.sessionId,
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
