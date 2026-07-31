import { auditTime, type Subscription } from 'rxjs'
import type {
  MarketSessionEvent,
} from '@shared/contracts/desktop'
import type {
  MarketSelection,
  OrderBookSnapshot,
  StreamStatus,
} from '@shared/types/market'
import type {
  ConnectionState,
  ConnectionStateName,
  MarketDataProvider,
} from './provider'

type StreamName = 'candles' | 'orderbook'

/** Rows the interface shows per side; the provider fills exactly this many. */
const ORDER_BOOK_ROWS_PER_SIDE = 10

export class MarketSession {
  private candleSubscription: Subscription | undefined
  private orderBookSubscription: Subscription | undefined
  private selection: MarketSelection | undefined
  private candleState: ConnectionStateName = 'connecting'
  private orderBookState: ConnectionStateName = 'connecting'
  private lastMessage = ''
  private visible = true
  private latestOrderBook: OrderBookSnapshot | undefined
  private orderBookAggregation = 0

  constructor(
    private readonly emit: (event: MarketSessionEvent) => void,
  ) {}

  start(
    provider: MarketDataProvider,
    selection: MarketSelection,
    visible = true,
    aggregationStep = selection.priceTickSize,
  ): void {
    this.stop()
    this.selection = { ...selection }
    this.visible = visible
    this.orderBookAggregation = aggregationStep > 0
      ? aggregationStep
      : selection.priceTickSize
    this.latestOrderBook = undefined
    this.candleState = 'connecting'
    this.orderBookState = 'connecting'
    this.lastMessage = ''
    this.emitStatus()

    this.candleSubscription = provider
      .streamCandles(selection, (state) => {
        this.updateState('candles', state)
      })
      .subscribe({
        next: (candle) => {
          this.confirmStreamData('candles')
          this.emit({ kind: 'candle', payload: candle })
        },
        error: (error) => this.handleFatal('candles', error),
      })

    // A renderer cannot display more than one state per animation frame.
    // Coalescing here prevents IPC queues from growing if a future provider
    // publishes depth updates faster than Binance's current 100 ms stream.
    this.orderBookSubscription = provider
      .streamOrderBook(
        selection,
        (state) => this.updateState('orderbook', state),
        {
          // Read per emission, so changing the grouping never resubscribes.
          aggregationStep: () => this.orderBookAggregation,
          rowsPerSide: () => ORDER_BOOK_ROWS_PER_SIDE,
        },
      )
      .pipe(auditTime(16))
      .subscribe({
        next: (snapshot) => {
          this.confirmStreamData('orderbook')
          this.latestOrderBook = snapshot
          if (this.visible) {
            this.emit({ kind: 'orderbook', payload: snapshot })
          }
        },
        error: (error) => this.handleFatal('orderbook', error),
      })
  }

  updateCandles(
    provider: MarketDataProvider,
    selection: MarketSelection,
  ): void {
    const current = this.selection
    if (!current) {
      throw new Error('Sessão de mercado não iniciada')
    }
    if (
      current.provider !== selection.provider
      || current.market !== selection.market
      || current.symbol !== selection.symbol
    ) {
      throw new Error(
        'A atualização isolada de candles permite alterar apenas o período',
      )
    }

    this.candleSubscription?.unsubscribe()
    this.candleSubscription = undefined
    this.selection = { ...selection }
    this.candleState = 'connecting'
    this.lastMessage = ''
    this.emitStatus()

    this.candleSubscription = provider
      .streamCandles(selection, (state) => {
        this.updateState('candles', state)
      })
      .subscribe({
        next: (candle) => this.emit({ kind: 'candle', payload: candle }),
        error: (error) => this.handleFatal('candles', error),
      })
  }

  /**
   * Changes the price grouping without touching the socket or the local book:
   * the provider re-reads the step on the next emission.
   */
  setOrderBookAggregation(step: number): void {
    if (!Number.isFinite(step) || step <= 0) {
      return
    }
    this.orderBookAggregation = step
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) {
      return
    }
    this.visible = visible
    if (visible && this.latestOrderBook) {
      this.emit({ kind: 'orderbook', payload: this.latestOrderBook })
    }
  }

  stop(): void {
    this.candleSubscription?.unsubscribe()
    this.orderBookSubscription?.unsubscribe()
    this.candleSubscription = undefined
    this.orderBookSubscription = undefined
    this.selection = undefined
    this.latestOrderBook = undefined
  }

  private updateState(
    stream: StreamName,
    state: ConnectionState,
  ): void {
    if (stream === 'candles') {
      this.candleState = state.state
    } else {
      this.orderBookState = state.state
    }
    this.lastMessage = state.message ?? ''
    this.emitStatus()
  }

  private handleFatal(stream: StreamName, error: unknown): void {
    this.updateState(stream, {
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  private confirmStreamData(stream: StreamName): void {
    const currentState = stream === 'candles'
      ? this.candleState
      : this.orderBookState
    if (currentState !== 'connected') {
      this.updateState(stream, { state: 'connected' })
    }
  }

  private emitStatus(): void {
    const selection = this.selection
    if (!selection) {
      return
    }

    let state: StreamStatus['state'] = 'connecting'
    if (
      this.candleState === 'error'
      || this.orderBookState === 'error'
    ) {
      state = 'error'
    } else if (
      this.candleState === 'reconnecting'
      || this.orderBookState === 'reconnecting'
    ) {
      state = 'reconnecting'
    } else if (
      this.candleState === 'connected'
      && this.orderBookState === 'connected'
    ) {
      state = 'connected'
    }

    this.emit({
      kind: 'status',
      payload: {
        provider: selection.provider,
        market: selection.market,
        symbol: selection.symbol,
        state,
        candleState: this.candleState,
        orderBookState: this.orderBookState,
        message: this.lastMessage || undefined,
      },
    })
  }
}

export class MarketSessionPool {
  private readonly sessions = new Map<string, MarketSession>()

  constructor(
    private readonly emit: (
      sessionId: string,
      event: MarketSessionEvent,
    ) => void,
  ) {}

  start(
    sessionId: string,
    provider: MarketDataProvider,
    selection: MarketSelection,
    visible: boolean,
    aggregationStep?: number,
  ): void {
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = new MarketSession((event) => this.emit(sessionId, event))
      this.sessions.set(sessionId, session)
    }
    session.start(provider, selection, visible, aggregationStep)
  }

  setOrderBookAggregation(sessionId: string, step: number): void {
    this.sessions.get(sessionId)?.setOrderBookAggregation(step)
  }

  setVisible(sessionId: string, visible: boolean): void {
    this.sessions.get(sessionId)?.setVisible(visible)
  }

  updateCandles(
    sessionId: string,
    provider: MarketDataProvider,
    selection: MarketSelection,
    visible: boolean,
  ): void {
    let session = this.sessions.get(sessionId)
    if (!session) {
      session = new MarketSession((event) => this.emit(sessionId, event))
      this.sessions.set(sessionId, session)
      session.start(provider, selection, visible)
      return
    }
    session.updateCandles(provider, selection)
  }

  stop(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return
    }
    session.stop()
    this.sessions.delete(sessionId)
  }

  stopAll(): void {
    this.sessions.forEach((session) => session.stop())
    this.sessions.clear()
  }

  get size(): number {
    return this.sessions.size
  }
}
