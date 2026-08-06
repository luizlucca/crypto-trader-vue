import type { MarketPair } from '@shared/types/market'
import {
  collectQuoteAssets,
  createSearchIndex,
  searchCatalog,
  type CatalogSearchCriteria,
  type SearchableMarketPair,
  type CatalogWorkerRequest,
  type CatalogWorkerResponse,
} from './marketCatalogSearch'

interface CatalogSearchCallbacks {
  onReady: (quoteAssets: string[]) => void
  onResult: (indexes: Uint32Array) => void
  onFallback?: (reason: string) => void
}

export class MarketCatalogSearchEngine {
  private worker: Worker | undefined
  private items: MarketPair[] = []
  private fallbackIndex: SearchableMarketPair[] = []
  private generation = 0
  private requestId = 0
  private latestCriteria: CatalogSearchCriteria | undefined

  constructor(private readonly callbacks: CatalogSearchCallbacks) {
    try {
      this.worker = new Worker(
        new URL('../workers/marketCatalog.worker.ts', import.meta.url),
        { type: 'module', name: 'market-catalog-search' },
      )
      this.worker.onmessage = (
        event: MessageEvent<CatalogWorkerResponse>,
      ) => {
        this.handleWorkerResponse(event.data)
      }
      this.worker.onerror = (event) => {
        this.activateFallback(event.message || 'Falha no Web Worker')
      }
    } catch (error) {
      this.activateFallback(
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  replaceItems(items: MarketPair[]): void {
    this.items = items
    this.generation += 1
    const request: CatalogWorkerRequest = {
      type: 'init',
      generation: this.generation,
      items,
    }

    if (this.worker) {
      this.worker.postMessage(request)
      return
    }

    const generation = this.generation
    queueMicrotask(() => {
      if (generation !== this.generation) {
        return
      }
      this.fallbackIndex = createSearchIndex(this.items)
      this.callbacks.onReady(collectQuoteAssets(this.fallbackIndex))
    })
  }

  search(criteria: CatalogSearchCriteria): void {
    this.latestCriteria = criteria
    this.requestId += 1
    const requestId = this.requestId
    const generation = this.generation

    if (this.worker) {
      const request: CatalogWorkerRequest = {
        type: 'search',
        generation,
        requestId,
        criteria,
      }
      this.worker.postMessage(request)
      return
    }

    queueMicrotask(() => {
      if (
        generation !== this.generation
        || requestId !== this.requestId
      ) {
        return
      }
      const indexes = searchCatalog(this.fallbackIndex, criteria)
      this.callbacks.onResult(indexes)
    })
  }

  terminate(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.latestCriteria = undefined
  }

  private handleWorkerResponse(response: CatalogWorkerResponse): void {
    if (response.generation !== this.generation) {
      return
    }
    if (response.type === 'ready') {
      this.callbacks.onReady(response.quoteAssets)
      return
    }
    if (response.type === 'result') {
      if (response.requestId === this.requestId) {
        this.callbacks.onResult(response.indexes)
      }
      return
    }
    this.activateFallback(response.message)
  }

  private activateFallback(reason: string): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = undefined
    }
    this.callbacks.onFallback?.(reason)
    this.fallbackIndex = createSearchIndex(this.items)
    this.callbacks.onReady(collectQuoteAssets(this.fallbackIndex))
    if (this.latestCriteria) {
      this.search(this.latestCriteria)
    }
  }
}
