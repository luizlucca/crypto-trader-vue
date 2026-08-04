import type { MarketSelection } from '@shared/types/market'
import type { ChartDrawing } from '@/domain/chartDrawings'
import { parseDrawing } from '@/domain/chartDrawings'

/**
 * Drawings kept per asset, on disk.
 *
 * Unlike an indicator, a drawing is manual work: a trend line took a decision
 * and two clicks to place, and losing it on restart would be losing the
 * analysis itself. It survives the app closing.
 *
 * The key is the asset, **not** the period. A trend line is a statement about
 * time and price, and it holds on the 4h chart exactly as it was drawn on the
 * 1h. It is not, however, a statement about another pair — so the symbol is
 * part of the key.
 */

const STORAGE_KEY = 'cryptopro.chart-drawings.v1'
const MAX_ASSETS = 60

export function drawingKey(selection: MarketSelection): string {
  return `${selection.provider}:${selection.market}:${selection.symbol}`
}

type Stored = Record<string, unknown[]>

function readAll(): Stored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Stored : {}
  } catch {
    return {}
  }
}

function writeAll(value: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage can be full or unavailable; the drawings still work in memory.
  }
}

export function readDrawings(selection: MarketSelection): ChartDrawing[] {
  const stored = readAll()[drawingKey(selection)]
  if (!Array.isArray(stored)) {
    return []
  }
  return stored
    .map(parseDrawing)
    .filter((drawing): drawing is ChartDrawing => drawing !== null)
}

export function writeDrawings(
  selection: MarketSelection,
  drawings: readonly ChartDrawing[],
): void {
  const all = readAll()
  const key = drawingKey(selection)
  if (drawings.length === 0) {
    delete all[key]
  } else {
    all[key] = drawings.map((drawing) => ({ ...drawing }))
  }

  /*
   * A trader who browses a hundred pairs should not carry every empty visit
   * forever. Oldest keys go first, and the asset being written always stays.
   */
  const keys = Object.keys(all)
  if (keys.length > MAX_ASSETS) {
    keys.slice(0, keys.length - MAX_ASSETS)
      .filter((stale) => stale !== key)
      .forEach((stale) => delete all[stale])
  }
  writeAll(all)
}
