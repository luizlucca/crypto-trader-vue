import { copyMarketSelection } from '@shared/contracts/desktop'
import type {
  Candle,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '@shared/types/market'

type SessionEventHandler<T> = (payload: T) => void
type SessionEventSubscriber<T> = (
  callback: (sessionId: string, payload: T) => void,
) => (() => void) | undefined

function createSessionEventRouter<T>(
  subscribe: SessionEventSubscriber<T>,
): (sessionId: string, callback: SessionEventHandler<T>) => () => void {
  const handlers = new Map<string, Set<SessionEventHandler<T>>>()
  let unsubscribeTransport: (() => void) | undefined

  return (sessionId, callback) => {
    let sessionHandlers = handlers.get(sessionId)
    if (!sessionHandlers) {
      sessionHandlers = new Set()
      handlers.set(sessionId, sessionHandlers)
    }
    sessionHandlers.add(callback)

    if (!unsubscribeTransport) {
      unsubscribeTransport = subscribe((eventSessionId, payload) => {
        handlers.get(eventSessionId)?.forEach((handler) => handler(payload))
      })
    }

    return () => {
      const currentHandlers = handlers.get(sessionId)
      currentHandlers?.delete(callback)
      if (currentHandlers?.size === 0) {
        handlers.delete(sessionId)
      }
      if (handlers.size === 0) {
        unsubscribeTransport?.()
        unsubscribeTransport = undefined
      }
    }
  }
}

const routeCandle = createSessionEventRouter<Candle>((callback) => (
  window.cryptoPro?.marketData.onCandle(callback)
))
const routeOrderBook = createSessionEventRouter<OrderBookSnapshot>(
  (callback) => window.cryptoPro?.marketData.onOrderBook(callback),
)

function desktopMarketData() {
  const api = window.cryptoPro?.marketData
  if (!api) {
    throw new Error(
      'API Electron indisponível. Inicie a aplicação com "npm run dev".',
    )
  }
  return api
}

export async function loadSymbols(
  provider: string,
  market: MarketSelection['market'],
  quoteAsset = 'USDT',
): Promise<MarketSymbol[]> {
  return desktopMarketData().getSymbols(provider, market, quoteAsset)
}

export async function loadMarketCatalog(
  provider: string,
  market: MarketSelection['market'],
  quoteAsset = '',
  forceRefresh = false,
): Promise<MarketCatalog> {
  return desktopMarketData().getCatalog(
    provider,
    market,
    quoteAsset,
    forceRefresh,
  )
}

export async function loadCandles(
  selection: MarketSelection,
  limit = 500,
  before?: number,
): Promise<Candle[]> {
  return desktopMarketData().getCandles(
    copyMarketSelection(selection),
    limit,
    before,
  )
}

export function startMarketStream(
  sessionId: string,
  selection: MarketSelection,
  visible = true,
  aggregationStep?: number,
): Promise<void> {
  return desktopMarketData().startStream(
    sessionId,
    copyMarketSelection(selection),
    visible,
    aggregationStep,
  )
}

export function setMarketOrderBookAggregation(
  sessionId: string,
  step: number,
): Promise<void> {
  return window.cryptoPro?.marketData.setOrderBookAggregation(sessionId, step)
    ?? Promise.resolve()
}

export function stopMarketStream(sessionId: string): Promise<void> {
  return window.cryptoPro?.marketData.stopStream(sessionId) ?? Promise.resolve()
}

export function updateMarketCandleStream(
  sessionId: string,
  selection: MarketSelection,
  visible = true,
): Promise<void> {
  return desktopMarketData().updateCandleStream(
    sessionId,
    copyMarketSelection(selection),
    visible,
  )
}

export function setMarketStreamVisibility(
  sessionId: string,
  visible: boolean,
): Promise<void> {
  return window.cryptoPro?.marketData.setStreamVisibility(sessionId, visible)
    ?? Promise.resolve()
}

export function onCandle(
  sessionId: string,
  callback: (candle: Candle) => void,
): () => void {
  return routeCandle(sessionId, callback)
}

export function onOrderBook(
  sessionId: string,
  callback: (snapshot: OrderBookSnapshot) => void,
): () => void {
  return routeOrderBook(sessionId, callback)
}

export function onStreamStatus(
  callback: (sessionId: string, status: StreamStatus) => void,
): () => void {
  return window.cryptoPro?.marketData.onStatus(callback) ?? (() => {})
}
