import type {
  MarketDataRequest,
  UtilityMessage,
  UtilityRequest,
} from '../../src/contracts/desktop'
import { isMarketDataRequest } from '../../src/contracts/desktop'
import { ProviderRegistry } from './market-data/provider'
import { BinanceProvider } from './market-data/providers/binance/provider'
import { MarketSession } from './market-data/session'

const parentPort = process.parentPort
if (!parentPort) {
  throw new Error('Market data utility process started without a parent port')
}

function send(message: UtilityMessage): void {
  parentPort.postMessage(message)
}

const registry = new ProviderRegistry([new BinanceProvider()])
const session = new MarketSession((event) => {
  send({ type: 'event', event })
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
        .getCandles(request.selection, request.limit)
    case 'start-stream':
      session.start(
        registry.get(request.selection.provider),
        request.selection,
      )
      return undefined
    case 'stop-stream':
      session.stop()
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
