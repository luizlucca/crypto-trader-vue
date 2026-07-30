import { contextBridge, ipcRenderer } from 'electron'
import {
  DESKTOP_CHANNELS,
  type CryptoProDesktopAPI,
  type MarketDataEvent,
  type MarketDataRequest,
  type SymbolSelectionResult,
  type SymbolSearchContext,
} from '../../src/contracts/desktop'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '../../src/types/market'

interface MarketPayloadMap {
  candle: Candle
  orderbook: OrderBookSnapshot
  status: StreamStatus
}

function marketRequest<T>(request: MarketDataRequest): Promise<T> {
  return ipcRenderer.invoke(DESKTOP_CHANNELS.marketRequest, request)
}

function onMarketEvent<T extends keyof MarketPayloadMap>(
  kind: T,
  callback: (sessionId: string, payload: MarketPayloadMap[T]) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, event: MarketDataEvent) => {
    if (event.kind === kind) {
      callback(event.sessionId, event.payload as MarketPayloadMap[T])
    }
  }
  ipcRenderer.on(DESKTOP_CHANNELS.marketEvent, listener)
  return () => ipcRenderer.removeListener(DESKTOP_CHANNELS.marketEvent, listener)
}

function onWindowEvent<T>(
  channel: string,
  callback: (value: T) => void,
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: T) => {
    callback(value)
  }
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: CryptoProDesktopAPI = {
  platform: process.platform,
  marketData: {
    getCatalog(
      provider: string,
      market: Market,
      quoteAsset = '',
      forceRefresh = false,
    ): Promise<MarketCatalog> {
      return marketRequest({
        kind: 'catalog',
        provider,
        market,
        quoteAsset,
        forceRefresh,
      })
    },
    getSymbols(
      provider: string,
      market: Market,
      quoteAsset = 'USDT',
    ): Promise<MarketSymbol[]> {
      return marketRequest({
        kind: 'symbols',
        provider,
        market,
        quoteAsset,
      })
    },
    getCandles(
      selection: MarketSelection,
      limit = 500,
    ): Promise<Candle[]> {
      return marketRequest({ kind: 'candles', selection, limit })
    },
    startStream(
      sessionId: string,
      selection: MarketSelection,
      visible = true,
    ): Promise<void> {
      return marketRequest({
        kind: 'start-stream',
        sessionId,
        selection,
        visible,
      })
    },
    updateCandleStream(
      sessionId: string,
      selection: MarketSelection,
      visible = true,
    ): Promise<void> {
      return marketRequest({
        kind: 'update-candle-stream',
        sessionId,
        selection,
        visible,
      })
    },
    stopStream(sessionId: string): Promise<void> {
      return marketRequest({ kind: 'stop-stream', sessionId })
    },
    setStreamVisibility(sessionId: string, visible: boolean): Promise<void> {
      return marketRequest({
        kind: 'set-stream-visibility',
        sessionId,
        visible,
      })
    },
    onCandle(
      callback: (sessionId: string, candle: Candle) => void,
    ): () => void {
      return onMarketEvent('candle', callback)
    },
    onOrderBook(
      callback: (sessionId: string, snapshot: OrderBookSnapshot) => void,
    ): () => void {
      return onMarketEvent('orderbook', callback)
    },
    onStatus(
      callback: (sessionId: string, status: StreamStatus) => void,
    ): () => void {
      return onMarketEvent('status', callback)
    },
  },
  windows: {
    openSymbolSearch(context: SymbolSearchContext): Promise<void> {
      return ipcRenderer.invoke(DESKTOP_CHANNELS.openSymbolSearch, context)
    },
    closeSymbolSearch(): Promise<void> {
      return ipcRenderer.invoke(DESKTOP_CHANNELS.closeSymbolSearch)
    },
    getSearchContext(): Promise<SymbolSearchContext | null> {
      return ipcRenderer.invoke(DESKTOP_CHANNELS.getSearchContext)
    },
    selectSymbol(item: MarketPair): Promise<void> {
      return ipcRenderer.invoke(DESKTOP_CHANNELS.symbolSelected, item)
    },
    syncFavorites(keys: string[]): void {
      ipcRenderer.send(DESKTOP_CHANNELS.favoritesChanged, keys)
    },
    onSearchContext(
      callback: (context: SymbolSearchContext) => void,
    ): () => void {
      return onWindowEvent(DESKTOP_CHANNELS.searchContext, callback)
    },
    onSymbolSelected(
      callback: (result: SymbolSelectionResult) => void,
    ): () => void {
      return onWindowEvent(DESKTOP_CHANNELS.symbolSelected, callback)
    },
    onFavoritesChanged(callback: (keys: string[]) => void): () => void {
      return onWindowEvent(DESKTOP_CHANNELS.favoritesChanged, callback)
    },
  },
}

contextBridge.exposeInMainWorld('cryptoPro', api)
