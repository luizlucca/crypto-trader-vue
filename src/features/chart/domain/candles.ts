import type { Candle } from '@shared/types/market'

/**
 * Turns an exchange page into what Lightweight Charts requires: strictly
 * ascending, one candle per instant.
 *
 * The chart throws on unordered or repeated times, and a page is not
 * guaranteed to be either. Pagination overlaps at the boundary — the same bar
 * comes back on the next page — and a provider retry can duplicate a bar
 * inside a single response. The later occurrence wins: it carries the more
 * recent state of an open bar.
 *
 * `beforeTime` is exclusive, so a prepended page cannot re-introduce a bar the
 * chart already holds.
 */
export function uniqueSortedCandles(
  source: readonly Candle[],
  beforeTime = Number.POSITIVE_INFINITY,
): Candle[] {
  const byTime = new Map<number, Candle>()
  for (const candle of source) {
    if (candle.time < beforeTime) {
      byTime.set(candle.time, candle)
    }
  }
  const unique = Array.from(byTime.values())
  unique.sort((left, right) => left.time - right.time)
  return unique
}
