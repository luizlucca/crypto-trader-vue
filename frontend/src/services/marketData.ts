import { copyMarketSelection } from '../contracts/desktop'
import type {
  Candle,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '../types/market'

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
): Promise<Candle[]> {
  return desktopMarketData().getCandles(
    copyMarketSelection(selection),
    limit,
  )
}

export function startMarketStream(selection: MarketSelection): Promise<void> {
  return desktopMarketData().startStream(
    copyMarketSelection(selection),
  )
}

export function stopMarketStream(): Promise<void> {
  return window.cryptoPro?.marketData.stopStream() ?? Promise.resolve()
}

export function onCandle(callback: (candle: Candle) => void): () => void {
  return window.cryptoPro?.marketData.onCandle(callback) ?? (() => {})
}

export function onOrderBook(
  callback: (snapshot: OrderBookSnapshot) => void,
): () => void {
  return window.cryptoPro?.marketData.onOrderBook(callback) ?? (() => {})
}

export function onStreamStatus(
  callback: (status: StreamStatus) => void,
): () => void {
  return window.cryptoPro?.marketData.onStatus(callback) ?? (() => {})
}
