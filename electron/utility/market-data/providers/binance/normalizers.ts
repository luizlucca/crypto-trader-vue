import type {
  Candle,
  Market,
  MarketPair,
  MarketSymbol,
  OrderBookLevel,
  OrderBookSnapshot,
} from '@shared/types/market'
import type { DepthSnapshot, DepthUpdate } from './orderBookSync'

const provider = 'binance'

export interface BinanceExchangeFilter {
  filterType?: string
  tickSize?: string
  stepSize?: string
}

export interface BinanceExchangeSymbol {
  symbol?: string
  status?: string
  baseAsset?: string
  quoteAsset?: string
  contractType?: string
  pricePrecision?: number
  quantityPrecision?: number
  filters?: BinanceExchangeFilter[]
}

export interface BinanceTicker24h {
  symbol?: string
  lastPrice?: string
  priceChange?: string
  priceChangePercent?: string
  weightedAvgPrice?: string
  openPrice?: string
  highPrice?: string
  lowPrice?: string
  volume?: string
  quoteVolume?: string
  count?: number | string
}

interface BinanceKlineEvent {
  E?: number
  s?: string
  k?: {
    t?: number
    T?: number
    i?: string
    o?: string
    c?: string
    h?: string
    l?: string
    v?: string
    q?: string
    x?: boolean
  }
}

interface BinanceDepthEvent {
  E?: number
  s?: string
  lastUpdateId?: number
  U?: number
  u?: number
  pu?: number
  bids?: string[][]
  asks?: string[][]
  b?: string[][]
  a?: string[][]
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function requiredNumber(value: unknown, field: string): number {
  const parsed = finiteNumber(value, Number.NaN)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Campo numérico inválido da Binance: ${field}`)
  }
  return parsed
}

export function precisionFromIncrement(increment: string | undefined): number {
  if (!increment) {
    return -1
  }
  const normalized = increment.trim().replace(/0+$/, '')
  const dot = normalized.indexOf('.')
  return dot < 0 ? 0 : normalized.length - dot - 1
}

export function normalizeExchangeSymbols(
  market: Market,
  rawSymbols: BinanceExchangeSymbol[],
): MarketSymbol[] {
  const symbols: MarketSymbol[] = []
  for (const item of rawSymbols) {
    if (
      item.status !== 'TRADING'
      || !item.symbol
      || !item.baseAsset
      || !item.quoteAsset
    ) {
      continue
    }
    if (market === 'futures' && item.contractType !== 'PERPETUAL') {
      continue
    }

    let pricePrecision = Math.max(0, item.pricePrecision ?? 0)
    let priceTickSize = 10 ** -pricePrecision
    let quantityPrecision = Math.max(0, item.quantityPrecision ?? 0)
    for (const filter of item.filters ?? []) {
      if (filter.filterType === 'PRICE_FILTER') {
        const precision = precisionFromIncrement(filter.tickSize)
        const tickSize = finiteNumber(filter.tickSize)
        if (tickSize > 0) {
          priceTickSize = tickSize
        }
        if (precision >= 0) {
          pricePrecision = precision
        }
      } else if (filter.filterType === 'LOT_SIZE') {
        const precision = precisionFromIncrement(filter.stepSize)
        if (precision >= 0) {
          quantityPrecision = precision
        }
      }
    }

    symbols.push({
      provider,
      market,
      symbol: item.symbol,
      baseAsset: item.baseAsset,
      quoteAsset: item.quoteAsset,
      status: item.status,
      priceTickSize,
      pricePrecision,
      quantityPrecision,
    })
  }
  return symbols.sort((left, right) => left.symbol.localeCompare(right.symbol))
}

export function mergeCatalog(
  symbols: MarketSymbol[],
  rawTickers: BinanceTicker24h[],
): MarketPair[] {
  const tickers = new Map(
    rawTickers
      .filter((ticker) => typeof ticker.symbol === 'string')
      .map((ticker) => [ticker.symbol as string, ticker]),
  )

  return symbols.map((symbol) => {
    const ticker = tickers.get(symbol.symbol)
    return {
      ...symbol,
      lastPrice: finiteNumber(ticker?.lastPrice),
      priceChange: finiteNumber(ticker?.priceChange),
      priceChangePercent: finiteNumber(ticker?.priceChangePercent),
      weightedAveragePrice: finiteNumber(ticker?.weightedAvgPrice),
      openPrice: finiteNumber(ticker?.openPrice),
      highPrice: finiteNumber(ticker?.highPrice),
      lowPrice: finiteNumber(ticker?.lowPrice),
      volume: finiteNumber(ticker?.volume),
      quoteVolume: finiteNumber(ticker?.quoteVolume),
      tradeCount: finiteNumber(ticker?.count),
    }
  })
}

export function normalizeCandleRow(
  row: unknown[],
  market: Market,
  symbol: string,
  interval: string,
  now = Date.now(),
): Candle {
  if (!Array.isArray(row) || row.length < 8) {
    const shape = Array.isArray(row) ? `${row.length} campos` : typeof row
    throw new Error(`Candle Binance inválido: ${shape}`)
  }
  const openTime = requiredNumber(row[0], 'openTime')
  const closeTime = requiredNumber(row[6], 'closeTime')
  return {
    provider,
    market,
    symbol,
    interval,
    time: Math.trunc(openTime / 1000),
    closeTime: Math.trunc(closeTime / 1000),
    open: requiredNumber(row[1], 'open'),
    high: requiredNumber(row[2], 'high'),
    low: requiredNumber(row[3], 'low'),
    close: requiredNumber(row[4], 'close'),
    volume: requiredNumber(row[5], 'volume'),
    quoteVolume: requiredNumber(row[7], 'quoteVolume'),
    closed: closeTime < now,
  }
}

/**
 * Whether a frame from the kline stream is a kline at all.
 *
 * The socket carries more than candles: Binance answers subscription commands
 * and reports problems as `{"error":{…}}` on the same connection. Treating
 * those as malformed candles used to error the observable, which tore the
 * socket down and reconnected with backoff — indefinitely, because the next
 * connection received the same frame. A frame that is not a kline is not a
 * failure of the candle stream; it just is not a candle.
 */
export function isKlineEvent(raw: unknown): boolean {
  const event = raw as BinanceKlineEvent | null
  return Boolean(event?.s) && Boolean(event?.k?.i)
}

/** Describes a non-kline frame for the status line, without leaking its size. */
export function describeStreamFrame(raw: unknown): string {
  const frame = raw as { error?: { msg?: string, code?: number } } | null
  if (frame?.error) {
    const code = frame.error.code === undefined ? '' : ` (${frame.error.code})`
    return `A Binance recusou a assinatura${code}: ${
      frame.error.msg ?? 'sem detalhe'
    }`
  }
  return 'Quadro ignorado no stream de candles: não é um kline'
}

export function normalizeKlineEvent(
  raw: unknown,
  market: Market,
): Candle {
  const event = raw as BinanceKlineEvent
  const kline = event.k
  if (!event.s || !kline?.i) {
    throw new Error('Evento de candle Binance incompleto')
  }
  return {
    provider,
    market,
    symbol: event.s,
    interval: kline.i,
    time: Math.trunc(requiredNumber(kline.t, 'kline.startTime') / 1000),
    closeTime: Math.trunc(requiredNumber(kline.T, 'kline.closeTime') / 1000),
    open: requiredNumber(kline.o, 'kline.open'),
    high: requiredNumber(kline.h, 'kline.high'),
    low: requiredNumber(kline.l, 'kline.low'),
    close: requiredNumber(kline.c, 'kline.close'),
    volume: requiredNumber(kline.v, 'kline.volume'),
    quoteVolume: requiredNumber(kline.q, 'kline.quoteVolume'),
    closed: Boolean(kline.x),
  }
}

export function normalizeLevels(rawLevels: string[][]): OrderBookLevel[] {
  const levels: OrderBookLevel[] = []
  let cumulative = 0
  for (const raw of rawLevels) {
    if (raw.length < 2) {
      continue
    }
    const price = requiredNumber(raw[0], 'depth.price')
    const quantity = requiredNumber(raw[1], 'depth.quantity')
    cumulative += quantity
    levels.push({ price, quantity, total: cumulative })
  }
  return levels
}

function normalizeDeltas(rawLevels: string[][] | undefined): [number, number][] {
  const deltas: [number, number][] = []
  for (const raw of rawLevels ?? []) {
    if (raw.length < 2) {
      continue
    }
    const price = Number(raw[0])
    const quantity = Number(raw[1])
    // A zero quantity is a removal, so it must survive the finite check.
    if (Number.isFinite(price) && Number.isFinite(quantity) && price > 0) {
      deltas.push([price, quantity])
    }
  }
  return deltas
}

/** One diff of the `@depth` stream, before it reaches the local book. */
export function normalizeDepthUpdate(
  raw: unknown,
  now = Date.now(),
): DepthUpdate {
  const event = raw as BinanceDepthEvent
  return {
    firstUpdateId: finiteNumber(event.U),
    finalUpdateId: finiteNumber(event.u),
    // Futures only; `undefined` marks the first event after a snapshot.
    previousUpdateId: typeof event.pu === 'number' ? event.pu : undefined,
    eventTime: finiteNumber(event.E, now),
    bids: normalizeDeltas(event.b ?? event.bids),
    asks: normalizeDeltas(event.a ?? event.asks),
  }
}

/** The REST `/depth` payload that seeds the local book. */
export function normalizeDepthSnapshot(raw: unknown): DepthSnapshot {
  const event = raw as BinanceDepthEvent
  return {
    lastUpdateId: finiteNumber(event.lastUpdateId ?? event.u),
    bids: normalizeDeltas(event.bids),
    asks: normalizeDeltas(event.asks),
  }
}

/** Builds the renderer-facing snapshot from already aggregated levels. */
export function buildOrderBookSnapshot(
  market: Market,
  symbol: string,
  eventTime: number,
  lastUpdateId: number,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): OrderBookSnapshot {
  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price
  const hasSpread = Number.isFinite(bestBid) && Number.isFinite(bestAsk)
  return {
    provider,
    market,
    symbol,
    eventTime,
    lastUpdateId,
    bids,
    asks,
    midPrice: hasSpread ? ((bestBid as number) + (bestAsk as number)) / 2 : 0,
    spread: hasSpread
      ? Math.max(0, (bestAsk as number) - (bestBid as number))
      : 0,
  }
}

export function normalizeDepthEvent(
  raw: unknown,
  market: Market,
  fallbackSymbol: string,
  now = Date.now(),
): OrderBookSnapshot {
  const event = raw as BinanceDepthEvent
  const bids = normalizeLevels(event.bids?.length ? event.bids : event.b ?? [])
  const asks = normalizeLevels(event.asks?.length ? event.asks : event.a ?? [])
  const bestBid = bids[0]?.price
  const bestAsk = asks[0]?.price
  const hasSpread = Number.isFinite(bestBid) && Number.isFinite(bestAsk)

  return {
    provider,
    market,
    symbol: event.s || fallbackSymbol,
    eventTime: finiteNumber(event.E, now),
    lastUpdateId: finiteNumber(event.u || event.lastUpdateId),
    bids,
    asks,
    midPrice: hasSpread ? ((bestBid as number) + (bestAsk as number)) / 2 : 0,
    spread: hasSpread
      ? Math.max(0, (bestAsk as number) - (bestBid as number))
      : 0,
  }
}
