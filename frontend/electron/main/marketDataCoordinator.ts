import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type {
  MarketDataEvent,
  MarketDataRequest,
  StartStreamRequest,
  UtilityMessage,
  UtilityRequest,
} from '../../src/contracts/desktop'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timeout: NodeJS.Timeout
}

const requestTimeoutMs = 20_000

export class MarketDataCoordinator {
  private child: UtilityProcess | undefined
  private pending = new Map<string, PendingRequest>()
  private ready = false
  private readyWaiters: Array<{
    resolve: () => void
    reject: (error: Error) => void
  }> = []
  private shuttingDown = false
  private restartTimer: NodeJS.Timeout | undefined
  private activeSubscription: StartStreamRequest | undefined

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
      this.activeSubscription = request
    } else if (request.kind === 'stop-stream') {
      this.activeSubscription = undefined
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
      this.readyWaiters.push({ resolve, reject })
      setTimeout(() => {
        const index = this.readyWaiters.findIndex(
          (waiter) => waiter.resolve === resolve,
        )
        if (index >= 0) {
          this.readyWaiters.splice(index, 1)
          reject(new Error('Timeout ao iniciar processo de market data'))
        }
      }, requestTimeoutMs)
    })
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
      if (this.activeSubscription) {
        void this.request(this.activeSubscription).catch((error) => {
          this.emitProcessError(error)
        })
      }
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
    const subscription = this.activeSubscription?.selection
    if (!subscription) {
      return
    }
    this.onEvent({
      kind: 'status',
      payload: {
        provider: subscription.provider,
        market: subscription.market,
        symbol: subscription.symbol,
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
