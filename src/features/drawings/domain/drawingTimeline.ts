import type { ChartDrawing } from './chartDrawings'

export interface TimelinePoint {
  time: number
}

export interface DrawingTimeline {
  points: TimelinePoint[]
  supportTimes: number[]
  lastCandleIndex: number
}

export const MAX_DRAWING_WHITESPACE_POINTS_PER_SIDE = 32_000

/**
 * Builds the horizontal domain shared by candles and persisted drawings.
 *
 * External anchors need enough regular whitespace bars to preserve temporal
 * distance. Adding only the anchor itself would make a projection one day or
 * one year ahead occupy the same single logical slot. The cap bounds memory;
 * anchors farther away remain outside the drawable domain until historical
 * pagination moves the candle boundary toward them.
 */
export function buildDrawingTimeline(
  candles: readonly TimelinePoint[],
  drawings: readonly ChartDrawing[],
  barSpanSeconds: number,
  maximumPointsPerSide = MAX_DRAWING_WHITESPACE_POINTS_PER_SIDE,
): DrawingTimeline {
  if (candles.length === 0) {
    const supportTimes = uniqueAnchorTimes(drawings)
    return {
      points: supportTimes.map((time) => ({ time })),
      supportTimes,
      lastCandleIndex: -1,
    }
  }

  const firstCandle = candles[0].time
  const lastCandle = candles.at(-1)?.time ?? firstCandle
  const { oldest, newest } = externalAnchorBounds(
    drawings,
    firstCandle,
    lastCandle,
  )
  const span = Math.max(1, Math.round(barSpanSeconds))
  const limit = Math.max(0, Math.floor(maximumPointsPerSide))
  const beforeCount = oldest === undefined
    ? 0
    : Math.min(limit, Math.ceil((firstCandle - oldest) / span))
  const afterCount = newest === undefined
    ? 0
    : Math.min(limit, Math.ceil((newest - lastCandle) / span))
  const points = new Array<TimelinePoint>(
    beforeCount + candles.length + afterCount,
  )
  const supportTimes = new Array<number>(beforeCount + afterCount)
  let targetIndex = 0
  for (let index = beforeCount; index > 0; index -= 1) {
    const time = firstCandle - index * span
    points[targetIndex] = { time }
    supportTimes[targetIndex] = time
    targetIndex += 1
  }
  for (const candle of candles) {
    points[targetIndex] = { time: candle.time }
    targetIndex += 1
  }
  const lastCandleIndex = targetIndex - 1
  for (let index = 1; index <= afterCount; index += 1) {
    const time = lastCandle + index * span
    points[targetIndex] = { time }
    supportTimes[beforeCount + index - 1] = time
    targetIndex += 1
  }
  return { points, supportTimes, lastCandleIndex }
}

function externalAnchorBounds(
  drawings: readonly ChartDrawing[],
  firstCandle: number,
  lastCandle: number,
): { oldest?: number, newest?: number } {
  let oldest: number | undefined
  let newest: number | undefined
  for (const drawing of drawings) {
    for (const anchor of drawing.anchors) {
      if (anchor.time < firstCandle) {
        oldest = oldest === undefined
          ? anchor.time
          : Math.min(oldest, anchor.time)
      } else if (anchor.time > lastCandle) {
        newest = newest === undefined
          ? anchor.time
          : Math.max(newest, anchor.time)
      }
    }
  }
  return { oldest, newest }
}

function uniqueAnchorTimes(drawings: readonly ChartDrawing[]): number[] {
  const times = new Set<number>()
  for (const drawing of drawings) {
    for (const anchor of drawing.anchors) {
      times.add(anchor.time)
    }
  }
  return [...times].sort((a, b) => a - b)
}
