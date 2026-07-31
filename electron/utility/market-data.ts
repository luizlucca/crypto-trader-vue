import type {
  MarketDataRequest,
  UtilityMessage,
  UtilityRequest,
} from '@shared/contracts/desktop'
import { isMarketDataRequest } from '@shared/contracts/desktop'
import { ProviderRegistry } from './market-data/provider'
import { BinanceProvider } from './market-data/providers/binance/provider'
import { MarketSessionPool } from './market-data/session'

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('Market data utility process started without a parent port')
}

function send(message: UtilityMessage): void {
  parentPort.postMessage(message)
}

const registry = new ProviderRegistry([new BinanceProvider()])
const sessions = new MarketSessionPool((sessionId, event) => {
  send({ type: 'event', event: { sessionId, ...event } })
})

async function execute(request: MarketDataRequest): Promise<unknown> {
  switch (request.kind) {
    case 'catalog':
      return registry.get(request.provider).getCatalog({
        market: request.market,
        quoteAsset: request.quoteAsset,
        forceRefresh: request.forceRefresh,
      })
    case 'symbols':
      return registry
        .get(request.provider)
        .getSymbols(request.market, request.quoteAsset)
    case 'candles':
      return registry
        .get(request.selection.provider)
        .getCandles(request.selection, {
          limit: request.limit,
          before: request.before,
        })
    case 'start-stream':
      sessions.start(
        request.sessionId,
        registry.get(request.selection.provider),
        request.selection,
        request.visible,
        request.aggregationStep,
      )
      return undefined
    case 'update-candle-stream':
      sessions.updateCandles(
        request.sessionId,
        registry.get(request.selection.provider),
        request.selection,
        request.visible,
      )
      return undefined
    case 'stop-stream':
      sessions.stop(request.sessionId)
      return undefined
    case 'set-stream-visibility':
      sessions.setVisible(request.sessionId, request.visible)
      return undefined
    case 'set-order-book-aggregation':
      sessions.setOrderBookAggregation(request.sessionId, request.step)
      return undefined
  }
}

async function handleMessage(message: unknown): Promise<void> {
  if (!message || typeof message !== 'object') {
    return
  }
  const command = message as Partial<UtilityRequest>
  if (
    command.type !== 'request'
    || typeof command.requestId !== 'string'
    || !isMarketDataRequest(command.request)
  ) {
    return
  }

  try {
    const result = await execute(command.request)
    send({
      type: 'response',
      requestId: command.requestId,
      ok: true,
      result,
    })
  } catch (error) {
    send({
      type: 'response',
      requestId: command.requestId,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

parentPort.on('message', (event: { data: unknown }) => {
  void handleMessage(event.data)
})

send({ type: 'ready' })
