/// <reference lib="webworker" />

import {
  collectQuoteAssets,
  createSearchIndex,
  searchCatalog,
  type CatalogWorkerRequest,
  type CatalogWorkerResponse,
} from '@market/services/marketCatalogSearch'

const workerScope = self as unknown as DedicatedWorkerGlobalScope
let generation = 0
let searchIndex = createSearchIndex([])

function respond(response: CatalogWorkerResponse, transfer?: Transferable[]): void {
  workerScope.postMessage(response, transfer ?? [])
}

workerScope.onmessage = (event: MessageEvent<CatalogWorkerRequest>) => {
  const request = event.data
  try {
    if (request.type === 'init') {
      generation = request.generation
      searchIndex = createSearchIndex(request.items)
      respond({
        type: 'ready',
        generation,
        quoteAssets: collectQuoteAssets(searchIndex),
      })
      return
    }

    if (request.generation !== generation) {
      return
    }

    const indexes = searchCatalog(searchIndex, request.criteria)
    respond(
      {
        type: 'result',
        generation,
        requestId: request.requestId,
        indexes,
      },
      [indexes.buffer],
    )
  } catch (error) {
    respond({
      type: 'error',
      generation: request.generation,
      requestId: request.type === 'search' ? request.requestId : undefined,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
