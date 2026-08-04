import type { Market } from '@shared/types/market'

/** One `{price: quantity}` change; quantity 0 removes the level. */
export type DepthDelta = readonly (readonly [number, number])[]

export interface DepthUpdate {
  /** First update id covered by the event (`U`). */
  firstUpdateId: number
  /** Final update id covered by the event (`u`). */
  finalUpdateId: number
  /** Final update id of the previous event (`pu`); Futures only. */
  previousUpdateId?: number
  eventTime: number
  bids: DepthDelta
  asks: DepthDelta
}

export interface DepthSnapshot {
  lastUpdateId: number
  bids: DepthDelta
  asks: DepthDelta
}

/**
 * - `applied`: the local book absorbed the event and is in sync.
 * - `ignored`: the event predates the snapshot and was dropped on purpose.
 * - `desynchronised`: the sequence broke; the caller must fetch a snapshot.
 */
export type SyncOutcome
  = | { status: 'applied' }
    | { status: 'ignored' }
    | { status: 'desynchronised', reason: string }

/**
 * Maximum depth each market's REST snapshot accepts. Asking for more is
 * rejected by Binance, so these are hard ceilings rather than preferences.
 */
export const SNAPSHOT_LIMIT: Record<Market, number> = {
  spot: 5000,
  futures: 1000,
}

/**
 * A snapshot request times out after 12 seconds and the Binance stream emits at
 * most every 100 ms. This ceiling is deliberately above that normal window,
 * but still prevents a failed bootstrap from retaining depth events forever.
 */
const MAX_BUFFERED_UPDATES = 256

/**
 * Maintains a local copy of a Binance order book from a REST snapshot plus the
 * diff depth stream.
 *
 * The partial stream (`@depth20`) caps at 20 levels, which is not enough to
 * fill the visible rows once prices are aggregated into wider buckets. Keeping
 * the full book here — rather than in the renderer — also keeps the IPC payload
 * constant: only the aggregated rows travel.
 *
 * Spot and Futures do NOT share a sequencing rule, so the market is part of the
 * book's identity:
 *
 * - Spot chains events by `U == previous u + 1`.
 * - Futures chains them by `pu == previous u`, and accepts a first event that
 *   merely straddles `lastUpdateId`.
 *
 * Applying the wrong rule produces a book that looks plausible while silently
 * drifting, which is why a broken sequence resets instead of continuing.
 */
export class BinanceOrderBook {
  private readonly bids = new Map<number, number>()
  private readonly asks = new Map<number, number>()
  private buffered: DepthUpdate[] = []
  private bufferOverflowed = false
  private lastUpdateId = 0
  private synchronised = false
  /**
   * The first event after a snapshot is validated against `lastUpdateId`;
   * every later one is chained to its predecessor. The live stream always
   * carries `pu`, including on that first event, so its presence cannot be
   * used to tell the two cases apart.
   */
  private chained = false

  constructor(private readonly market: Market) {}

  get isSynchronised(): boolean {
    return this.synchronised
  }

  /** Update id of the newest change already reflected in the local book. */
  get lastAppliedUpdateId(): number {
    return this.lastUpdateId
  }

  /** Holds events that arrive before the snapshot, per the documented flow. */
  buffer(update: DepthUpdate): void {
    if (this.synchronised) {
      return
    }
    if (this.buffered.length >= MAX_BUFFERED_UPDATES) {
      this.buffered = []
      this.bufferOverflowed = true
    }
    this.buffered.push(update)
  }

  /**
   * Adopts a snapshot and replays whatever arrived while it was in flight.
   * Returns false when the buffer cannot bridge the gap, meaning the caller
   * should fetch a newer snapshot.
   */
  applySnapshot(snapshot: DepthSnapshot): boolean {
    if (this.bufferOverflowed) {
      this.buffered = []
      this.bufferOverflowed = false
      this.synchronised = false
      return false
    }
    this.bids.clear()
    this.asks.clear()
    this.lastUpdateId = snapshot.lastUpdateId
    this.synchronised = true
    this.chained = false
    writeLevels(this.bids, snapshot.bids)
    writeLevels(this.asks, snapshot.asks)

    const pending = this.buffered
    this.buffered = []
    for (const update of pending) {
      const outcome = this.apply(update)
      if (outcome.status === 'desynchronised') {
        this.synchronised = false
        return false
      }
    }
    return true
  }

  apply(update: DepthUpdate): SyncOutcome {
    if (!this.synchronised) {
      this.buffer(update)
      return { status: 'ignored' }
    }
    if (this.isStale(update)) {
      return { status: 'ignored' }
    }
    if (!this.isContinuous(update)) {
      this.synchronised = false
      return {
        status: 'desynchronised',
        reason: `Sequência do livro quebrada em ${update.firstUpdateId}`,
      }
    }

    writeLevels(this.bids, update.bids)
    writeLevels(this.asks, update.asks)
    this.lastUpdateId = update.finalUpdateId
    this.chained = true
    return { status: 'applied' }
  }

  /** Best `count` levels per side, best price first. */
  best(count: number): { bids: [number, number][], asks: [number, number][] } {
    return {
      bids: bestLevels(this.bids, count, (left, right) => right - left),
      asks: bestLevels(this.asks, count, (left, right) => left - right),
    }
  }

  reset(): void {
    this.bids.clear()
    this.asks.clear()
    this.buffered = []
    this.bufferOverflowed = false
    this.lastUpdateId = 0
    this.synchronised = false
    this.chained = false
  }

  private isStale(update: DepthUpdate): boolean {
    return this.market === 'spot'
      ? update.finalUpdateId <= this.lastUpdateId
      : update.finalUpdateId < this.lastUpdateId
  }

  private isValidFirstEvent(update: DepthUpdate): boolean {
    return this.market === 'spot'
      ? update.firstUpdateId <= this.lastUpdateId + 1
      && update.finalUpdateId >= this.lastUpdateId + 1
      : update.firstUpdateId <= this.lastUpdateId
        && update.finalUpdateId >= this.lastUpdateId
  }

  private isContinuous(update: DepthUpdate): boolean {
    if (!this.chained) {
      return this.isValidFirstEvent(update)
    }
    return this.market === 'futures'
      // Futures chains by `pu`; `U` jumps freely between events.
      ? update.previousUpdateId === undefined
      || update.previousUpdateId === this.lastUpdateId
      : update.firstUpdateId === this.lastUpdateId + 1
  }
}

function writeLevels(target: Map<number, number>, deltas: DepthDelta): void {
  for (const [price, quantity] of deltas) {
    if (quantity > 0) {
      target.set(price, quantity)
    } else {
      target.delete(price)
    }
  }
}

/**
 * Selects the best levels without sorting the whole book: it holds thousands
 * of prices while only a few dozen are ever displayed.
 */
function bestLevels(
  book: Map<number, number>,
  count: number,
  compare: (left: number, right: number) => number,
): [number, number][] {
  if (count < 1) {
    return []
  }
  const prices: number[] = []
  for (const price of book.keys()) {
    const full = prices.length >= count
    if (full && compare(price, prices[prices.length - 1]) >= 0) {
      continue
    }
    let position = prices.length
    while (position > 0 && compare(price, prices[position - 1]) < 0) {
      position -= 1
    }
    prices.splice(position, 0, price)
    if (prices.length > count) {
      prices.pop()
    }
  }
  return prices.map((price) => [price, book.get(price) ?? 0])
}
