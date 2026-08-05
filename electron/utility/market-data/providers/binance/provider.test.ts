import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  MarketSelection,
  OrderBookSnapshot,
} from '@shared/types/market'
import type {
  ConnectionState,
  ConnectionStateHandler,
} from '../../provider'
import {
  BinanceProvider,
  MAX_ORDER_BOOK_DEPTH,
  orderBookDepthFor,
  retryAfterMs,
  worthRetrying,
} from './provider'

interface WebSocketHarness {
  state?: ConnectionStateHandler
  next?: (value: unknown) => void
}

interface OrderBookObserver {
  states: ConnectionState[]
  books: OrderBookSnapshot[]
  stop: () => void
}

const websocketHarness = vi.hoisted<WebSocketHarness>(() => ({}))

vi.mock('./websocket', async () => {
  const { Observable } = await import('rxjs')
  return {
    websocketJSON$: vi.fn((
      _url: string,
      onState: ConnectionStateHandler,
    ) => new Observable<unknown>((subscriber) => {
      websocketHarness.state = onState
      websocketHarness.next = (value) => subscriber.next(value)
      return () => {
        websocketHarness.state = undefined
        websocketHarness.next = undefined
      }
    })),
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const futuresSelection: MarketSelection = {
  provider: 'binance',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1m',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.1,
  pricePrecision: 1,
  quantityPrecision: 3,
}

function depthResponse(lastUpdateId = 100): Response {
  return new Response(JSON.stringify({
    lastUpdateId,
    bids: [['64000.0', '1.5']],
    asks: [['64000.1', '2.0']],
  }), { status: 200 })
}

function depthUpdate(
  firstUpdateId = 100,
  finalUpdateId = 101,
): unknown {
  return {
    E: Date.now(),
    U: firstUpdateId,
    u: finalUpdateId,
    pu: firstUpdateId - 1,
    b: [['64000.0', '1.75']],
    a: [['64000.1', '2.25']],
  }
}

function observeOrderBook(): OrderBookObserver {
  const states: ConnectionState[] = []
  const books: OrderBookSnapshot[] = []
  const subscription = new BinanceProvider().streamOrderBook(
    futuresSelection,
    (state) => states.push(state),
    {
      aggregationStep: () => 0.1,
      rowsPerSide: () => 10,
    },
  ).subscribe((snapshot) => books.push(snapshot))
  return {
    states,
    books,
    stop: () => subscription.unsubscribe(),
  }
}

describe('BinanceProvider catalog cache', () => {
  it('shares concurrent refreshes, honors TTL and supports forced refresh', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const payload = url.includes('/exchangeInfo')
        ? {
            symbols: [{
              symbol: 'BTCUSDT',
              status: 'TRADING',
              contractType: 'PERPETUAL',
              baseAsset: 'BTC',
              quoteAsset: 'USDT',
              filters: [],
            }],
          }
        : [{
            symbol: 'BTCUSDT',
            lastPrice: '64000',
            quoteVolume: '1000000',
          }]
      return new Response(JSON.stringify(payload), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new BinanceProvider()
    const request = {
      market: 'futures' as const,
      quoteAsset: '',
      forceRefresh: false,
    }
    const [first, concurrent] = await Promise.all([
      provider.getCatalog(request),
      provider.getCatalog(request),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(first.items).toHaveLength(1)
    expect(concurrent.items[0].lastPrice).toBe(64000)

    const cached = await provider.getCatalog(request)
    expect(cached.cached).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const refreshed = await provider.getCatalog({
      ...request,
      forceRefresh: true,
    })
    expect(refreshed.cached).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

describe('BinanceProvider candle history', () => {
  it('uses an exclusive endTime cursor on the market-specific endpoint', async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify([
      [
        1_722_394_800_000,
        '64000',
        '64100',
        '63900',
        '64050',
        '10',
        1_722_398_399_999,
        '640500',
      ],
    ]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new BinanceProvider()
    const baseSelection: Omit<MarketSelection, 'market'> = {
      provider: 'binance',
      symbol: 'BTCUSDT',
      interval: '1h',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      priceTickSize: 0.01,
      pricePrecision: 2,
      quantityPrecision: 3,
    }

    await provider.getCandles(
      { ...baseSelection, market: 'futures' },
      { limit: 400, before: 1_722_398_400 },
    )
    await provider.getCandles(
      { ...baseSelection, market: 'spot' },
      { limit: 400, before: 1_722_398_400 },
    )

    const futuresURL = new URL(String(fetchMock.mock.calls[0][0]))
    const spotURL = new URL(String(fetchMock.mock.calls[1][0]))
    expect(`${futuresURL.origin}${futuresURL.pathname}`).toBe(
      'https://fapi.binance.com/fapi/v1/klines',
    )
    expect(`${spotURL.origin}${spotURL.pathname}`).toBe(
      'https://api.binance.com/api/v3/klines',
    )
    expect(futuresURL.searchParams.get('limit')).toBe('400')
    expect(futuresURL.searchParams.get('endTime')).toBe('1722398399999')
    expect(spotURL.searchParams.get('endTime')).toBe('1722398399999')
  })
})

describe('BinanceProvider order-book bootstrap', () => {
  it('recovers before reporting the book as connected', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Falha REST transitória'))
      .mockResolvedValueOnce(depthResponse())
    vi.stubGlobal('fetch', fetchMock)
    const { states, books, stop } = observeOrderBook()

    websocketHarness.state?.({ state: 'connecting' })
    websocketHarness.state?.({ state: 'connected' })
    await vi.advanceTimersByTimeAsync(0)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toMatchObject({
      state: 'reconnecting',
      message: 'Falha REST transitória',
    })
    expect(states.some((state) => state.state === 'connected')).toBe(false)
    expect(books).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    websocketHarness.next?.(depthUpdate())

    expect(states.at(-1)?.state).toBe('connected')
    expect(books).toHaveLength(1)
    expect(books[0]).toMatchObject({
      lastUpdateId: 101,
      bids: [{ price: 64000, quantity: 1.75 }],
      asks: [{ price: 64000.1, quantity: 2.25 }],
    })
    stop()
  })

  it('gets a new snapshot after socket reconnect', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(depthResponse(100))
      .mockResolvedValueOnce(depthResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const { states, books, stop } = observeOrderBook()

    websocketHarness.state?.({ state: 'connecting' })
    websocketHarness.state?.({ state: 'connected' })
    await vi.advanceTimersByTimeAsync(0)
    websocketHarness.next?.(depthUpdate(100, 101))
    expect(books).toHaveLength(1)

    websocketHarness.state?.({
      state: 'reconnecting',
      message: 'Socket interrompido',
    })
    websocketHarness.next?.(depthUpdate(101, 102))
    expect(books).toHaveLength(1)
    expect(states.at(-1)?.state).toBe('reconnecting')

    websocketHarness.state?.({ state: 'connected' })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(states.at(-1)?.state).toBe('reconnecting')

    websocketHarness.next?.(depthUpdate(200, 201))
    expect(books).toHaveLength(2)
    expect(books[1].lastUpdateId).toBe(201)
    expect(states.at(-1)?.state).toBe('connected')
    stop()
  })

  it('cancels snapshot retry when the subscription stops', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValue(new Error('Binance offline'))
    vi.stubGlobal('fetch', fetchMock)
    const { stop } = observeOrderBook()

    websocketHarness.state?.({ state: 'connecting' })
    websocketHarness.state?.({ state: 'connected' })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('restarts a snapshot interrupted by socket reconnect', async () => {
    vi.useFakeTimers()
    let resolveFirstSnapshot: ((response: Response) => void) | undefined
    const firstSnapshot = new Promise<Response>((resolve) => {
      resolveFirstSnapshot = resolve
    })
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstSnapshot)
      .mockResolvedValueOnce(depthResponse(200))
    vi.stubGlobal('fetch', fetchMock)
    const { states, books, stop } = observeOrderBook()

    websocketHarness.state?.({ state: 'connecting' })
    websocketHarness.state?.({ state: 'connected' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    websocketHarness.state?.({ state: 'reconnecting' })
    websocketHarness.state?.({ state: 'connected' })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFirstSnapshot?.(depthResponse(100))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    websocketHarness.next?.(depthUpdate(200, 201))
    expect(books).toHaveLength(1)
    expect(books[0].lastUpdateId).toBe(201)
    expect(states.at(-1)?.state).toBe('connected')
    stop()
  })
})

describe('profundidade lida do livro', () => {
  const rows = 20
  const tick = 0.1

  it('na agregação padrão lê um múltiplo pequeno das linhas', () => {
    // Antes eram sempre 4000 níveis ordenados dez vezes por segundo para
    // mostrar vinte linhas: 19,2% de um núcleo por aba, 1,8% depois disso.
    expect(orderBookDepthFor(rows, tick, tick)).toBe(80)
  })

  it('cresce com o quanto a agregação alarga o balde', () => {
    expect(orderBookDepthFor(rows, 1, tick)).toBe(400)
    expect(orderBookDepthFor(rows, 5, tick)).toBe(2000)
  })

  it('respeita o teto na agregação mais larga', () => {
    expect(orderBookDepthFor(rows, 10, tick)).toBe(MAX_ORDER_BOOK_DEPTH)
    expect(orderBookDepthFor(rows, 100, tick)).toBe(MAX_ORDER_BOOK_DEPTH)
  })

  it('não divide por zero quando o catálogo não traz o tick', () => {
    expect(orderBookDepthFor(rows, 10, 0)).toBe(80)
    expect(Number.isFinite(orderBookDepthFor(rows, 10, Number.NaN))).toBe(true)
  })
})

describe('retentativa de requisição', () => {
  it('só repete o que vale a pena repetir', () => {
    // 429 é alcançável: rolar o histórico para trás martela /klines. 5xx é a
    // corretora passando mal. Um 4xx que não seja 429 é pedido errado deste
    // código, e repetir só gasta o orçamento.
    expect(worthRetrying(429)).toBe(true)
    expect(worthRetrying(500)).toBe(true)
    expect(worthRetrying(503)).toBe(true)
    expect(worthRetrying(undefined)).toBe(true)
    expect(worthRetrying(400)).toBe(false)
    expect(worthRetrying(404)).toBe(false)
    expect(worthRetrying(418)).toBe(false)
  })

  it('honra o Retry-After sem deixar um cabeçalho ruim nos estacionar', () => {
    expect(retryAfterMs('2')).toBe(2_000)
    expect(retryAfterMs('600')).toBe(10_000)
    expect(retryAfterMs('abacaxi')).toBeUndefined()
    expect(retryAfterMs('-1')).toBeUndefined()
    expect(retryAfterMs(null)).toBeUndefined()
  })
})
