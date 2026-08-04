/**
 * Drawings the operator places on the chart.
 *
 * The anchor is **time and price**, never the logical index the primitives
 * consume. Lightweight Charts addresses the horizontal axis by position in the
 * data array, and this app prepends older candles when the user scrolls back —
 * every index shifts, and a drawing anchored to one would slide along the
 * chart. Time is the only anchor the market itself agrees with.
 *
 * The primitives are therefore derived, not owned: they are rebuilt from these
 * anchors whenever the data set underneath them changes.
 */

export type DrawingToolId
  = | 'trend-line'
    | 'horizontal-line'
    | 'horizontal-ray'
    | 'vertical-line'
    | 'fib-retracement'
    | 'fib-extension'
    | 'rectangle'
    | 'circle'
    | 'triangle'
    | 'parallel-channel'
    | 'long-position'
    | 'short-position'
    | 'measure'
    | 'price-range'
    | 'date-range'

export interface DrawingAnchor {
  /** Seconds, matching the chart's `UTCTimestamp`. */
  time: number
  price: number
}

export interface ChartDrawing {
  id: string
  tool: DrawingToolId
  anchors: DrawingAnchor[]
  color: string
  lineWidth: number
}

/** Clicks needed to finish each tool. */
export const DRAWING_ANCHORS: Record<DrawingToolId, number> = {
  'trend-line': 2,
  'horizontal-line': 1,
  'horizontal-ray': 1,
  'vertical-line': 1,
  'fib-retracement': 2,
  'fib-extension': 3,
  'rectangle': 2,
  'circle': 2,
  'triangle': 3,
  'parallel-channel': 3,
  'long-position': 3,
  'short-position': 3,
  'measure': 2,
  'price-range': 2,
  'date-range': 2,
}

export const DRAWING_TOOL_LABELS: Record<DrawingToolId, string> = {
  'trend-line': 'Linha de tendência',
  'horizontal-line': 'Linha horizontal',
  'horizontal-ray': 'Raio horizontal',
  'vertical-line': 'Linha vertical',
  'fib-retracement': 'Retração de Fibonacci',
  'fib-extension': 'Extensão de Fibonacci',
  'rectangle': 'Retângulo',
  'circle': 'Círculo',
  'triangle': 'Triângulo',
  'parallel-channel': 'Canal paralelo',
  'long-position': 'Posição comprada',
  'short-position': 'Posição vendida',
  'measure': 'Régua',
  'price-range': 'Faixa de preço',
  'date-range': 'Faixa de tempo',
}

/**
 * How the toolbar groups them. A trader reaches for a family, not for an
 * alphabetical list: lines, then fibonacci, then shapes, then the ones that
 * measure something.
 */
export const DRAWING_TOOL_GROUPS: readonly (readonly DrawingToolId[])[] = [
  ['trend-line', 'horizontal-line', 'horizontal-ray', 'vertical-line'],
  ['fib-retracement', 'fib-extension', 'parallel-channel'],
  ['rectangle', 'circle', 'triangle'],
  ['long-position', 'short-position', 'measure', 'price-range', 'date-range'],
]

/**
 * The palette offered for a drawing, readable against every one of the 38
 * theme presets, light and dark.
 */
export const DRAWING_COLORS: readonly string[] = [
  '#2962FF',
  '#00BCD4',
  '#26A69A',
  '#66BB6A',
  '#FFA726',
  '#EF5350',
  '#AB47BC',
  '#B0BEC5',
]

export const DRAWING_LINE_WIDTHS: readonly number[] = [1, 2, 3, 4]

/**
 * What a drawing is born with, and what a stored one falls back to.
 *
 * Kept here rather than beside the toolbar because three places have to agree:
 * a new drawing, a drawing read back from storage, and the swatch the style bar
 * paints as active. A fourth copy would drift, and the only symptom would be a
 * style bar that highlights nothing.
 */
export const DRAWING_DEFAULT_COLOR = DRAWING_COLORS[0]
export const DRAWING_DEFAULT_WIDTH = 2

const NARROWEST_LINE = Math.min(...DRAWING_LINE_WIDTHS)
const WIDEST_LINE = Math.max(...DRAWING_LINE_WIDTHS)

let sequence = 0

export function createDrawingId(): string {
  sequence += 1
  return `drawing-${Date.now().toString(36)}-${sequence}`
}

function isAnchor(value: unknown): value is DrawingAnchor {
  const anchor = value as Partial<DrawingAnchor> | null
  return Boolean(anchor)
    && Number.isFinite(anchor?.time)
    && Number.isFinite(anchor?.price)
}

/**
 * Rebuilds a drawing from stored data, dropping anything malformed.
 *
 * Storage outlives the code that wrote it: a drawing saved by an older build
 * must never be able to throw while the chart is mounting.
 */
export function parseDrawing(value: unknown): ChartDrawing | null {
  const drawing = value as Partial<ChartDrawing> | null
  if (!drawing || typeof drawing.tool !== 'string') {
    return null
  }
  const tool = drawing.tool as DrawingToolId
  // Own property, not a lookup: a stored `tool` of `"constructor"` or
  // `"toString"` resolves through the prototype and is not `undefined`, so the
  // table alone cannot say whether the name is a tool this build knows.
  if (
    !Object.hasOwn(DRAWING_ANCHORS, tool)
    || !Array.isArray(drawing.anchors)
  ) {
    return null
  }
  const expected = DRAWING_ANCHORS[tool]
  const anchors = drawing.anchors.filter(isAnchor)
  if (anchors.length !== expected) {
    return null
  }
  return {
    id: typeof drawing.id === 'string' ? drawing.id : createDrawingId(),
    tool,
    anchors,
    color: typeof drawing.color === 'string' && drawing.color !== ''
      ? drawing.color
      : DRAWING_DEFAULT_COLOR,
    lineWidth: Number.isFinite(drawing.lineWidth)
      ? clampLineWidth(drawing.lineWidth as number)
      : DRAWING_DEFAULT_WIDTH,
  }
}

/** Bounds come from the offered widths, so the two cannot drift apart. */
function clampLineWidth(width: number): number {
  return Math.min(WIDEST_LINE, Math.max(NARROWEST_LINE, Math.round(width)))
}

/**
 * Fractional position of an instant inside a candle series.
 *
 * Takes the bars themselves, not their times: the preview asks for this on
 * every pointer move, and mapping four hundred candles into a fresh array of
 * timestamps each time would allocate on the path that has to stay quiet.
 *
 * Lightweight Charts resolves a time to a coordinate only when that exact time
 * is a bar, which makes a drawing vanish the moment the period changes: a
 * timestamp from the 1h chart is not a bar on the 4h one. A trend line is a
 * statement about two instants, and it has to hold on any period — so the
 * position is interpolated between the bars that surround the instant, and
 * extrapolated with the neighbouring spacing when it falls outside the loaded
 * range.
 *
 * Returns null only when there is nothing to interpolate against.
 *
 * `bars[i].time` is read inline, on purpose. Wrapping the reads in an accessor
 * reads better and allocates a closure per call on the path this function was
 * written to keep quiet — a preview move calls it once per anchor, and the
 * binary search calls the accessor once per comparison.
 */
export function logicalForTime(
  bars: readonly { time: number }[],
  time: number,
): number | null {
  const last = bars.length - 1
  if (last < 0) {
    return null
  }
  if (last === 0) {
    return bars[0].time === time ? 0 : null
  }

  if (time <= bars[0].time) {
    const span = bars[1].time - bars[0].time
    return span > 0 ? (time - bars[0].time) / span : 0
  }
  if (time >= bars[last].time) {
    const span = bars[last].time - bars[last - 1].time
    return span > 0 ? last + ((time - bars[last].time) / span) : last
  }

  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (bars[middle].time <= time) {
      low = middle
    } else {
      high = middle
    }
  }
  const span = bars[high].time - bars[low].time
  return span > 0 ? low + ((time - bars[low].time) / span) : low
}

/**
 * The instant at a fractional position in the series — the inverse of
 * `logicalForTime`.
 *
 * Exists because a click is only reported with a `time` when it lands exactly
 * on a bar. Everywhere else — between two bars, and above all in the empty
 * margin to the right of the last candle — the chart reports only the logical
 * position. Dropping those clicks silently disarmed the tool in the one place
 * a trader most wants to draw: ahead of the price.
 *
 * Extrapolates past both ends with the spacing of the nearest pair, so a
 * drawing extended into the future keeps a real timestamp and survives a
 * change of period like any other.
 */
export function timeForLogical(
  bars: readonly { time: number }[],
  logical: number,
): number | null {
  if (bars.length === 0) {
    return null
  }
  if (bars.length === 1) {
    return bars[0].time
  }
  const last = bars.length - 1
  if (logical <= 0) {
    const span = bars[1].time - bars[0].time
    return Math.round(bars[0].time + (logical * span))
  }
  if (logical >= last) {
    const span = bars[last].time - bars[last - 1].time
    return Math.round(bars[last].time + ((logical - last) * span))
  }
  const low = Math.floor(logical)
  const span = bars[low + 1].time - bars[low].time
  return Math.round(bars[low].time + ((logical - low) * span))
}

/**
 * Which anchor each axis of a grabbed handle belongs to.
 *
 * `null` means that axis is not the handle's to move: a horizontal line has a
 * price and no instant, so dragging its handle must not slide it sideways.
 */
export interface AnchorEdit {
  time: number | null
  price: number | null
}

/**
 * Reads a grabbed handle as "which anchor owns its horizontal position, and
 * which owns its vertical one".
 *
 * The tools number their handles by corner, not by anchor: a rectangle answers
 * with four corners while holding two anchors, and its top-right corner is the
 * instant of one and the price of the other. Deriving the pair from the
 * geometry, instead of tabulating each tool's numbering, keeps this correct if
 * upstream renumbers — and it falls out right for the degenerate tools too,
 * where one of the two axes simply has no anchor near the handle.
 *
 * Returns null when the position matches no handle, so the caller can treat
 * the gesture as moving the whole shape.
 */
export function anchorEditAt(
  points: readonly { x: number, y: number }[],
  x: number,
  y: number,
  tolerance = 8,
): AnchorEdit | null {
  let time: number | null = null
  let price: number | null = null
  let nearestX = tolerance
  let nearestY = tolerance
  points.forEach((point, index) => {
    const dx = Math.abs(point.x - x)
    if (dx <= nearestX) {
      nearestX = dx
      time = index
    }
    const dy = Math.abs(point.y - y)
    if (dy <= nearestY) {
      nearestY = dy
      price = index
    }
  })
  return time === null && price === null ? null : { time, price }
}
