import { contextBridge, ipcRenderer } from 'electron'
import {
  DESKTOP_CHANNELS,
  type CryptoProDesktopAPI,
  type MarketDataEvent,
  type MarketDataRequest,
  type SymbolSelectionResult,
  type SymbolSearchContext,
} from '@shared/contracts/desktop'
import type {
  Candle,
  Market,
  MarketEnvironment,
  MarketCatalog,
  MarketPair,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
  StreamStatus,
} from '@shared/types/market'
import type {
  SecurityRequest,
  SecuritySnapshot,
} from '@shared/contracts/security'

interface MarketPayloadMap {
  candle: Candle
  orderbook: OrderBookSnapshot
  status: StreamStatus
}

function marketRequest<T>(request: MarketDataRequest): Promise<T> {
  return ipcRenderer.invoke(DESKTOP_CHANNELS.marketRequest, request)
}

function securityRequest(request: SecurityRequest): Promise<SecuritySnapshot> {
  return ipcRenderer.invoke(DESKTOP_CHANNELS.securityRequest, request)
}

function onMarketEvent<T extends keyof MarketPayloadMap>(
  kind: T,
  callback: (sessionId: string, payload: MarketPayloadMap[T]) => void,
): () => void {
  const listener = (
    _event: Electron.IpcRendererEvent,
    event: MarketDataEvent,
  ) => {
    if (event.kind === kind) {
      callback(event.sessionId, event.payload as MarketPayloadMap[T])
    }
  }
  ipcRenderer.on(DESKTOP_CHANNELS.marketEvent, listener)
  return () => (
    ipcRenderer.removeListener(DESKTOP_CHANNELS.marketEvent, listener)
  )
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
      environment: MarketEnvironment,
      market: Market,
      quoteAsset = '',
      forceRefresh = false,
    ): Promise<MarketCatalog> {
      return marketRequest({
        kind: 'catalog',
        provider,
        environment,
        market,
        quoteAsset,
        forceRefresh,
      })
    },
    getSymbols(
      provider: string,
      environment: MarketEnvironment,
      market: Market,
      quoteAsset = 'USDT',
    ): Promise<MarketSymbol[]> {
      return marketRequest({
        kind: 'symbols',
        provider,
        environment,
        market,
        quoteAsset,
      })
    },
    getCandles(
      selection: MarketSelection,
      limit = 500,
      before?: number,
    ): Promise<Candle[]> {
      return marketRequest({
        kind: 'candles',
        selection,
        limit,
        ...(before === undefined ? {} : { before }),
      })
    },
    startStream(
      sessionId: string,
      selection: MarketSelection,
      visible = true,
      aggregationStep?: number,
    ): Promise<void> {
      return marketRequest({
        kind: 'start-stream',
        sessionId,
        selection,
        visible,
        ...(aggregationStep === undefined ? {} : { aggregationStep }),
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
    setOrderBookAggregation(sessionId: string, step: number): Promise<void> {
      return marketRequest({
        kind: 'set-order-book-aggregation',
        sessionId,
        step,
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
  security: {
    getSnapshot(): Promise<SecuritySnapshot> {
      return securityRequest({ kind: 'get-snapshot' })
    },
    request(request: SecurityRequest): Promise<SecuritySnapshot> {
      return securityRequest(request)
    },
    onState(callback: (snapshot: SecuritySnapshot) => void): () => void {
      return onWindowEvent(DESKTOP_CHANNELS.securityEvent, callback)
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
