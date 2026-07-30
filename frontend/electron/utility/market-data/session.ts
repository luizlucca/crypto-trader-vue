import { auditTime, type Subscription } from 'rxjs'
import type {
  MarketDataEvent,
} from '../../../src/contracts/desktop'
import type {
  MarketSelection,
  StreamStatus,
} from '../../../src/types/market'
import type {
  ConnectionState,
  ConnectionStateName,
  MarketDataProvider,
} from './provider'

type StreamName = 'candles' | 'orderbook'

export class MarketSession {
  private subscriptions: Subscription[] = []
  private selection: MarketSelection | undefined
  private candleState: ConnectionStateName = 'connecting'
  private orderBookState: ConnectionStateName = 'connecting'
  private lastMessage = ''

  constructor(
    private readonly emit: (event: MarketDataEvent) => void,
  ) {}

  start(
    provider: MarketDataProvider,
    selection: MarketSelection,
  ): void {
    this.stop()
    this.selection = { ...selection }
    this.candleState = 'connecting'
    this.orderBookState = 'connecting'
    this.lastMessage = ''
    this.emitStatus()

    const candleSubscription = provider
      .streamCandles(selection, (state) => {
        this.updateState('candles', state)
      })
      .subscribe({
        next: (candle) => this.emit({ kind: 'candle', payload: candle }),
        error: (error) => this.handleFatal('candles', error),
      })

    // A renderer cannot display more than one state per animation frame.
    // Coalescing here prevents IPC queues from growing if a future provider
    // publishes depth updates faster than Binance's current 100 ms stream.
    const orderBookSubscription = provider
      .streamOrderBook(selection, (state) => {
        this.updateState('orderbook', state)
      })
      .pipe(auditTime(16))
      .subscribe({
        next: (snapshot) => {
          this.emit({ kind: 'orderbook', payload: snapshot })
        },
        error: (error) => this.handleFatal('orderbook', error),
      })

    this.subscriptions = [candleSubscription, orderBookSubscription]
  }

  stop(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe())
    this.subscriptions = []
    this.selection = undefined
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
