import type { Candle, MarketSelection } from '@shared/types/market'
import { marketSelectionFingerprint } from '@/domain/marketSelection'
import { onCandle } from '@/services/marketData'

interface HistoryEntry {
  fingerprint: string
  candles: Candle[]
  /** False while only realtime ticks arrived and REST history is still absent. */
  ready: boolean
}

export interface CandleHistoryCache {
  /** Cached candles for a session, or undefined if they do not match. */
  read: (sessionId: string, selection: MarketSelection) => Candle[] | undefined
  /** Stores the REST page the chart just loaded, keeping any newer tick. */
  store: (sessionId: string, fingerprint: string, candles: Candle[]) => void
  /** Starts feeding a session's cache from the realtime candle stream. */
  attach: (sessionId: string, selection: () => MarketSelection) => void
  detach: (sessionId: string) => void
  drop: (sessionId: string) => void
  detachAll: () => void
}

/**
 * Keeps a bounded candle window per tab so returning to a background tab is a
 * single in-memory `setData()` instead of a REST round trip.
 *
 * DELIBERATELY NOT REACTIVE. This cache is written on every realtime candle.
 * A `ref`, `reactive` or `shallowRef` here would put the hot path back into
 * Vue's dependency graph and let the market data stream schedule renders —
 * the failure mode that made the order book contend with the chart. Nothing in
 * this module may become reactive; the chart reads it once per mount.
 */
export function useCandleHistoryCache(
  maxCachedCandles: number,
): CandleHistoryCache {
  const entries = new Map<string, HistoryEntry>()
  const unsubscribers = new Map<string, () => void>()

  function ingest(
    sessionId: string,
    selection: MarketSelection,
    candle: Candle,
  ): void {
    if (
      candle.provider !== selection.provider
      || candle.market !== selection.market
      || candle.symbol !== selection.symbol
      || candle.interval !== selection.interval
    ) {
      return
    }

    const fingerprint = marketSelectionFingerprint(selection)
    const current = entries.get(sessionId)
    if (!current || current.fingerprint !== fingerprint) {
      entries.set(sessionId, { fingerprint, candles: [candle], ready: false })
      return
    }

    const last = current.candles.at(-1)
    if (!last || candle.time > last.time) {
      current.candles.push(candle)
      if (current.candles.length > maxCachedCandles) {
        current.candles.shift()
      }
    } else if (candle.time === last.time) {
      current.candles[current.candles.length - 1] = candle
    }
  }

  return {
    read(sessionId, selection) {
      const cached = entries.get(sessionId)
      return cached?.ready
        && cached.fingerprint === marketSelectionFingerprint(selection)
        ? cached.candles
        : undefined
    },

    store(sessionId, fingerprint, candles) {
      // A tick may have arrived while the REST page was in flight; it is newer
      // than anything the page contains, so it survives the replacement.
      const pending = entries.get(sessionId)
      const latest = pending?.fingerprint === fingerprint
        ? pending.candles.at(-1)
        : undefined
      const merged = candles.slice(-maxCachedCandles)
      const last = merged.at(-1)
      if (latest && (!last || latest.time >= last.time)) {
        if (last?.time === latest.time) {
          merged[merged.length - 1] = latest
        } else {
          merged.push(latest)
        }
      }
      entries.set(sessionId, {
        fingerprint,
        candles: merged.slice(-maxCachedCandles),
        ready: true,
      })
    },

    attach(sessionId, selection) {
      if (unsubscribers.has(sessionId)) {
        return
      }
      unsubscribers.set(
        sessionId,
        onCandle(sessionId, (candle) => {
          ingest(sessionId, selection(), candle)
        }),
      )
    },

    detach(sessionId) {
      unsubscribers.get(sessionId)?.()
      unsubscribers.delete(sessionId)
      entries.delete(sessionId)
    },

    drop(sessionId) {
      entries.delete(sessionId)
    },

    detachAll() {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      unsubscribers.clear()
      entries.clear()
    },
  }
}
