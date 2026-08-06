import type { TextAppearance } from '@renderer-shared/domain/textAppearance'
import { normalizeTextAppearance } from '@renderer-shared/domain/textAppearance'

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
    | 'ray'
    | 'arrow'
    | 'extended-line'
    | 'info-line'
    | 'trend-angle'
    | 'horizontal-line'
    | 'horizontal-ray'
    | 'vertical-line'
    | 'cross-line'
    | 'regression-trend'
    | 'flat-top-bottom'
    | 'disjoint-channel'
    | 'andrews-pitchfork'
    | 'schiff-pitchfork'
    | 'modified-schiff-pitchfork'
    | 'inside-pitchfork'
    | 'fib-retracement'
    | 'fib-extension'
    | 'fib-channel'
    | 'fib-time-zone'
    | 'fib-speed-fan'
    | 'fib-time-extension'
    | 'fib-circles'
    | 'fib-spiral'
    | 'fib-arcs'
    | 'fib-wedge'
    | 'pitchfan'
    | 'gann-box'
    | 'gann-fan'
    | 'gann-square-fixed'
    | 'gann-square'
    | 'rectangle'
    | 'rotated-rectangle'
    | 'circle'
    | 'ellipse'
    | 'arc'
    | 'triangle'
    | 'path'
    | 'polyline'
    | 'curve'
    | 'double-curve'
    | 'parallel-channel'
    | 'long-position'
    | 'short-position'
    | 'forecast'
    | 'projection'
    | 'bars-pattern'
    | 'measure'
    | 'price-range'
    | 'date-range'
    | 'date-price-range'
    | 'text-annotation'
    | 'callout'
    | 'anchored-text'
    | 'note'
    | 'price-note'
    | 'price-label'
    | 'flag-mark'
    | 'pin'
    | 'comment'
    | 'signpost'
    | 'table'
    | 'brush'
    | 'highlighter'
    | 'arrow-marker'
    | 'arrow-mark-up'
    | 'arrow-mark-down'

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
  /** 0 solid, 1 dotted, 2 dashed. Absent in drawings from older builds. */
  lineStyle?: DrawingLineStyle
  /** Optional payload for tools whose appearance is more than one line. */
  configuration?: DrawingConfiguration
}

export interface DrawingLevel {
  value: number
  color: string
}

export interface DrawingConfiguration {
  positiveColor?: string
  negativeColor?: string
  levels?: DrawingLevel[]
  text?: string
  textAppearance?: TextAppearance
}

export type DrawingLineStyle = 0 | 1 | 2

export interface DrawingLineStyleOption {
  id: DrawingLineStyle
  label: string
}

export const DRAWING_LINE_STYLES = [
  { id: 0, label: 'Contínua' },
  { id: 2, label: 'Tracejada' },
  { id: 1, label: 'Pontilhada' },
] as const satisfies readonly DrawingLineStyleOption[]

/** Clicks needed to finish each tool. */
export const DRAWING_ANCHORS: Record<DrawingToolId, number> = {
  'trend-line': 2,
  'ray': 2,
  'arrow': 2,
  'extended-line': 2,
  'info-line': 2,
  'trend-angle': 2,
  'horizontal-line': 1,
  'horizontal-ray': 1,
  'vertical-line': 1,
  'cross-line': 1,
  'regression-trend': 2,
  'flat-top-bottom': 3,
  'disjoint-channel': 4,
  'andrews-pitchfork': 3,
  'schiff-pitchfork': 3,
  'modified-schiff-pitchfork': 3,
  'inside-pitchfork': 3,
  'fib-retracement': 2,
  'fib-extension': 3,
  'fib-channel': 3,
  'fib-time-zone': 2,
  'fib-speed-fan': 2,
  'fib-time-extension': 3,
  'fib-circles': 2,
  'fib-spiral': 2,
  'fib-arcs': 2,
  'fib-wedge': 3,
  'pitchfan': 3,
  'gann-box': 2,
  'gann-fan': 2,
  'gann-square-fixed': 1,
  'gann-square': 2,
  'rectangle': 2,
  'rotated-rectangle': 3,
  'circle': 2,
  'ellipse': 2,
  'arc': 3,
  'triangle': 3,
  'path': 2,
  'polyline': 2,
  'curve': 4,
  'double-curve': 3,
  'parallel-channel': 3,
  'long-position': 3,
  'short-position': 3,
  'forecast': 2,
  'projection': 3,
  'bars-pattern': 3,
  'measure': 2,
  'price-range': 2,
  'date-range': 2,
  'date-price-range': 2,
  'text-annotation': 1,
  'callout': 2,
  'anchored-text': 2,
  'note': 1,
  'price-note': 1,
  'price-label': 1,
  'flag-mark': 1,
  'pin': 1,
  'comment': 1,
  'signpost': 1,
  'table': 1,
  'brush': 2,
  'highlighter': 2,
  'arrow-marker': 1,
  'arrow-mark-up': 1,
  'arrow-mark-down': 1,
}

export const DRAWING_TOOL_LABELS: Record<DrawingToolId, string> = {
  'trend-line': 'Linha de tendência',
  'ray': 'Raio',
  'arrow': 'Seta',
  'extended-line': 'Linha estendida',
  'info-line': 'Linha informativa',
  'trend-angle': 'Ângulo de tendência',
  'horizontal-line': 'Linha horizontal',
  'horizontal-ray': 'Raio horizontal',
  'vertical-line': 'Linha vertical',
  'cross-line': 'Linha cruzada',
  'regression-trend': 'Canal de regressão',
  'flat-top-bottom': 'Canal de topo/fundo plano',
  'disjoint-channel': 'Canal descontínuo',
  'andrews-pitchfork': 'Forquilha de Andrews',
  'schiff-pitchfork': 'Forquilha de Schiff',
  'modified-schiff-pitchfork': 'Forquilha de Schiff modificada',
  'inside-pitchfork': 'Forquilha interna',
  'fib-retracement': 'Retração de Fibonacci',
  'fib-extension': 'Extensão de Fibonacci',
  'fib-channel': 'Canal de Fibonacci',
  'fib-time-zone': 'Zona temporal de Fibonacci',
  'fib-speed-fan': 'Leque de velocidade Fibonacci',
  'fib-time-extension': 'Extensão temporal Fibonacci',
  'fib-circles': 'Círculos de Fibonacci',
  'fib-spiral': 'Espiral de Fibonacci',
  'fib-arcs': 'Arcos de Fibonacci',
  'fib-wedge': 'Cunha de Fibonacci',
  'pitchfan': 'Leque de inclinação',
  'gann-box': 'Caixa de Gann',
  'gann-fan': 'Leque de Gann',
  'gann-square-fixed': 'Quadrado de Gann fixo',
  'gann-square': 'Quadrado de Gann',
  'rectangle': 'Retângulo',
  'rotated-rectangle': 'Retângulo rotacionado',
  'circle': 'Círculo',
  'ellipse': 'Elipse',
  'arc': 'Arco',
  'triangle': 'Triângulo',
  'path': 'Caminho',
  'polyline': 'Polilinha',
  'curve': 'Curva de Bézier',
  'double-curve': 'Curva dupla',
  'parallel-channel': 'Canal paralelo',
  'long-position': 'Posição comprada',
  'short-position': 'Posição vendida',
  'forecast': 'Previsão',
  'projection': 'Projeção',
  'bars-pattern': 'Padrão de barras',
  'measure': 'Régua',
  'price-range': 'Faixa de preço',
  'date-range': 'Faixa de tempo',
  'date-price-range': 'Faixa de data e preço',
  'text-annotation': 'Texto',
  'callout': 'Balão de chamada',
  'anchored-text': 'Texto ancorado',
  'note': 'Nota',
  'price-note': 'Nota de preço',
  'price-label': 'Etiqueta de preço',
  'flag-mark': 'Bandeira',
  'pin': 'Pino',
  'comment': 'Comentário',
  'signpost': 'Placa indicativa',
  'table': 'Tabela',
  'brush': 'Pincel',
  'highlighter': 'Marca-texto',
  'arrow-marker': 'Marcador de seta',
  'arrow-mark-up': 'Seta para cima',
  'arrow-mark-down': 'Seta para baixo',
}

export type DrawingToolGroupId
  = | 'lines'
    | 'channels'
    | 'fibonacci'
    | 'gann'
    | 'shapes'
    | 'forecasts'
    | 'measurements'
    | 'annotations'

export interface DrawingToolGroup {
  id: DrawingToolGroupId
  label: string
  tools: readonly DrawingToolId[]
}

/**
 * A trader reaches for a family before choosing its exact tool. The group id
 * also gives the toolbar a stable identity with which to remember the last
 * tool selected from each flyout.
 */
export const DRAWING_TOOL_GROUPS = [
  {
    id: 'lines',
    label: 'Linhas',
    tools: [
      'trend-line',
      'ray',
      'arrow',
      'extended-line',
      'info-line',
      'trend-angle',
      'horizontal-line',
      'horizontal-ray',
      'vertical-line',
      'cross-line',
    ],
  },
  {
    id: 'channels',
    label: 'Canais e forquilhas',
    tools: [
      'parallel-channel',
      'regression-trend',
      'flat-top-bottom',
      'disjoint-channel',
      'andrews-pitchfork',
      'schiff-pitchfork',
      'modified-schiff-pitchfork',
      'inside-pitchfork',
    ],
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci',
    tools: [
      'fib-retracement',
      'fib-extension',
      'fib-channel',
      'fib-time-zone',
      'fib-speed-fan',
      'fib-time-extension',
      'fib-circles',
      'fib-spiral',
      'fib-arcs',
      'fib-wedge',
      'pitchfan',
    ],
  },
  {
    id: 'gann',
    label: 'Gann',
    tools: [
      'gann-box',
      'gann-fan',
      'gann-square-fixed',
      'gann-square',
    ],
  },
  {
    id: 'shapes',
    label: 'Formas geométricas',
    tools: [
      'rectangle',
      'rotated-rectangle',
      'circle',
      'ellipse',
      'arc',
      'triangle',
      'path',
      'polyline',
      'curve',
      'double-curve',
    ],
  },
  {
    id: 'forecasts',
    label: 'Projeções e posições',
    tools: [
      'long-position',
      'short-position',
      'forecast',
      'projection',
      'bars-pattern',
    ],
  },
  {
    id: 'measurements',
    label: 'Medições',
    tools: [
      'measure',
      'price-range',
      'date-range',
      'date-price-range',
    ],
  },
  {
    id: 'annotations',
    label: 'Anotações e marcações',
    tools: [
      'text-annotation',
      'callout',
      'anchored-text',
      'note',
      'price-note',
      'price-label',
      'flag-mark',
      'pin',
      'comment',
      'signpost',
      'table',
      'brush',
      'highlighter',
      'arrow-marker',
      'arrow-mark-up',
      'arrow-mark-down',
    ],
  },
] as const satisfies readonly DrawingToolGroup[]

/**
 * Tools implemented by the local catalog primitive rather than the original
 * line-tools primitives. Kept explicit so the renderer and the domain can be
 * checked against each other without accepting an arbitrary string.
 */
export const CATALOG_DRAWING_TOOL_IDS = [
  'ray',
  'arrow',
  'extended-line',
  'info-line',
  'trend-angle',
  'regression-trend',
  'flat-top-bottom',
  'disjoint-channel',
  'andrews-pitchfork',
  'schiff-pitchfork',
  'modified-schiff-pitchfork',
  'inside-pitchfork',
  'fib-channel',
  'fib-time-zone',
  'fib-speed-fan',
  'fib-time-extension',
  'fib-circles',
  'fib-spiral',
  'fib-arcs',
  'fib-wedge',
  'pitchfan',
  'gann-box',
  'gann-fan',
  'gann-square-fixed',
  'gann-square',
  'rotated-rectangle',
  'ellipse',
  'arc',
  'path',
  'polyline',
  'curve',
  'double-curve',
  'forecast',
  'projection',
  'bars-pattern',
  'text-annotation',
  'callout',
  'anchored-text',
  'note',
  'price-note',
  'price-label',
  'flag-mark',
  'pin',
  'comment',
  'signpost',
  'table',
  'brush',
  'highlighter',
  'arrow-marker',
  'arrow-mark-up',
  'arrow-mark-down',
] as const satisfies readonly DrawingToolId[]

export type CatalogDrawingToolId = typeof CATALOG_DRAWING_TOOL_IDS[number]

const CATALOG_DRAWING_TOOL_SET: ReadonlySet<string> = new Set(
  CATALOG_DRAWING_TOOL_IDS,
)

export function isCatalogDrawingTool(
  tool: DrawingToolId,
): tool is CatalogDrawingToolId {
  return CATALOG_DRAWING_TOOL_SET.has(tool)
}

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
export const DRAWING_DEFAULT_LINE_STYLE: DrawingLineStyle = 0
export const DRAWING_DEFAULT_POSITIVE_COLOR = '#2962FF'
export const DRAWING_DEFAULT_NEGATIVE_COLOR = '#EF5350'
export const DRAWING_MAX_LEVELS = 32
export const DRAWING_MAX_TEXT_LENGTH = 240
export const DRAWING_MAX_ANCHORS = 128

const VARIABLE_POINT_TOOLS = new Set<DrawingToolId>(['polyline'])

const FIBONACCI_LEVEL_TOOLS = new Set<DrawingToolId>([
  'fib-retracement',
  'fib-extension',
  'fib-channel',
  'fib-time-zone',
  'fib-speed-fan',
  'fib-time-extension',
  'fib-circles',
  'fib-arcs',
  'fib-wedge',
  'pitchfan',
])

const SIGNED_COLOR_TOOLS = new Set<DrawingToolId>([
  'measure',
  'price-range',
  'date-price-range',
])

const TEXT_TOOLS = new Set<DrawingToolId>([
  'text-annotation',
  'callout',
  'anchored-text',
  'note',
  'price-note',
  'price-label',
  'flag-mark',
  'pin',
  'comment',
  'signpost',
  'table',
  'arrow-marker',
  'arrow-mark-up',
  'arrow-mark-down',
])

const ORIGINAL_TOOLS_WITH_LINE_STYLE = new Set<DrawingToolId>([
  'trend-line',
  'horizontal-line',
  'horizontal-ray',
  'vertical-line',
  'cross-line',
  'rectangle',
  'circle',
  'triangle',
  'parallel-channel',
])

export interface DrawingStyleCapabilities {
  color: boolean
  lineStyle: boolean
  levels: boolean
  signedColors: boolean
  text: boolean
}

/** Controls that produce a visible result for this primitive. */
export function drawingStyleCapabilities(
  tool: DrawingToolId,
): DrawingStyleCapabilities {
  const levels = FIBONACCI_LEVEL_TOOLS.has(tool)
  const signedColors = SIGNED_COLOR_TOOLS.has(tool)
  return {
    color: !levels && !signedColors,
    lineStyle: isCatalogDrawingTool(tool)
      || ORIGINAL_TOOLS_WITH_LINE_STYLE.has(tool),
    levels,
    signedColors,
    text: TEXT_TOOLS.has(tool),
  }
}

export function isVariablePointDrawing(tool: DrawingToolId): boolean {
  return VARIABLE_POINT_TOOLS.has(tool)
}

const LEVEL_COLORS = [
  '#787B86',
  '#EF5350',
  '#66BB6A',
  '#26A69A',
  '#42A5F5',
  '#7E57C2',
  '#FFA726',
] as const

const STANDARD_FIBONACCI_LEVELS = [
  0,
  0.236,
  0.382,
  0.5,
  0.618,
  0.786,
  1,
  1.618,
] as const

const EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2.618, 4.236] as const
const TIME_LEVELS = [0, 1, 2, 3, 5, 8, 13, 21, 34] as const

/** Fresh list: editors may change it without mutating the defaults. */
export function defaultDrawingLevels(tool: DrawingToolId): DrawingLevel[] {
  if (!FIBONACCI_LEVEL_TOOLS.has(tool)) {
    return []
  }
  let values: readonly number[] = STANDARD_FIBONACCI_LEVELS
  if (tool === 'fib-extension' || tool === 'fib-time-extension') {
    values = EXTENSION_LEVELS
  } else if (tool === 'fib-time-zone') {
    values = TIME_LEVELS
  }
  return values.map((value, index) => ({
    value,
    color: LEVEL_COLORS[index % LEVEL_COLORS.length],
  }))
}

const DEFAULT_DRAWING_TEXT: Partial<Record<DrawingToolId, string>> = {
  'text-annotation': 'Texto',
  'callout': 'Nota',
  'anchored-text': 'Texto',
  'note': 'Nota',
  'price-note': 'Nota de preço',
  'price-label': 'Preço',
  'flag-mark': 'Bandeira',
  'pin': 'Pino',
  'comment': 'Comentário',
  'signpost': 'Sinal',
  'table': 'Tabela',
  'arrow-marker': 'Marcador',
  'arrow-mark-up': 'Alta',
  'arrow-mark-down': 'Baixa',
}

export function defaultDrawingText(tool: DrawingToolId): string {
  return DEFAULT_DRAWING_TEXT[tool] ?? ''
}

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
  const validAnchorCount = isVariablePointDrawing(tool)
    ? anchors.length >= expected && anchors.length <= DRAWING_MAX_ANCHORS
    : anchors.length === expected
  if (!validAnchorCount) {
    return null
  }
  const configuration = parseDrawingConfiguration(drawing.configuration, tool)
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
    lineStyle: isDrawingLineStyle(drawing.lineStyle)
      ? drawing.lineStyle
      : DRAWING_DEFAULT_LINE_STYLE,
    ...(configuration ? { configuration } : {}),
  }
}

function parseDrawingConfiguration(
  value: unknown,
  tool: DrawingToolId,
): DrawingConfiguration | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const stored = value as Partial<DrawingConfiguration>
  const configuration: DrawingConfiguration = {}
  const capabilities = drawingStyleCapabilities(tool)
  if (
    capabilities.signedColors
    && typeof stored.positiveColor === 'string'
    && stored.positiveColor !== ''
  ) {
    configuration.positiveColor = stored.positiveColor
  }
  if (
    capabilities.signedColors
    && typeof stored.negativeColor === 'string'
    && stored.negativeColor !== ''
  ) {
    configuration.negativeColor = stored.negativeColor
  }
  if (typeof stored.text === 'string' && capabilities.text) {
    configuration.text = stored.text.slice(0, DRAWING_MAX_TEXT_LENGTH)
  }
  if (
    capabilities.text
    && stored.textAppearance
    && typeof stored.textAppearance === 'object'
  ) {
    configuration.textAppearance = normalizeTextAppearance(
      stored.textAppearance,
    )
  }
  if (Array.isArray(stored.levels) && capabilities.levels) {
    const levels = stored.levels
      .map(parseDrawingLevel)
      .filter((level): level is DrawingLevel => level !== null)
      .slice(0, DRAWING_MAX_LEVELS)
    if (levels.length > 0) {
      configuration.levels = levels
    }
  }
  return Object.keys(configuration).length > 0 ? configuration : undefined
}

function parseDrawingLevel(value: unknown): DrawingLevel | null {
  const level = value as Partial<DrawingLevel> | null
  return level
    && Number.isFinite(level.value)
    && typeof level.color === 'string'
    && level.color !== ''
    ? { value: level.value as number, color: level.color }
    : null
}

function isDrawingLineStyle(value: unknown): value is DrawingLineStyle {
  return value === 0 || value === 1 || value === 2
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
