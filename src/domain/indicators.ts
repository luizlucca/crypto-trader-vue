/**
 * Domain model for technical indicators.
 *
 * This module never imports the indicator library. It describes the shapes the
 * renderer works with, so the library stays confined to the worker and can be
 * replaced without touching components, services or state.
 */

/** The six parameter kinds that exist across the whole catalog. */
export type IndicatorInputType
  = | 'int'
    | 'float'
    | 'bool'
    | 'string'
    | 'color'
    | 'source'

export interface IndicatorInputSpec {
  id: string
  type: IndicatorInputType
  title: string
  defval: string | number | boolean
  min?: number
  max?: number
  options?: readonly string[]
}

/**
 * How a plot is meant to be drawn. The catalog declares this per plot and it is
 * not cosmetic: rendering a MACD histogram as a line misreads the indicator.
 */
export type IndicatorPlotStyleKind = 'line' | 'histogram' | 'area'

export interface IndicatorPlotSpec {
  id: string
  title: string
  color?: string
  lineWidth?: number
  /** Raw value from the catalog: `columns`, `histogram`, `area`, `circles`… */
  style?: string
}

export function plotStyleKind(plot: IndicatorPlotSpec): IndicatorPlotStyleKind {
  switch (plot.style) {
    case 'columns':
    case 'histogram':
      return 'histogram'
    case 'area':
      return 'area'
    default:
      // `circles`, `cross`, `stepline` and `linebr` have no direct equivalent
      // in Lightweight Charts; a line is the closest honest approximation.
      return 'line'
  }
}

/** Reference line drawn at a fixed value, such as the RSI's 70 and 30. */
export interface IndicatorHLineSpec {
  id: string
  price: number
  color?: string
  /** Only oscillators declare these; the catalog uses these three names. */
  linestyle?: 'solid' | 'dashed' | 'dotted'
  title?: string
}

/**
 * Everything the interface needs to offer and configure an indicator, with no
 * reference to the library that computes it.
 */
export interface IndicatorDefinition {
  id: string
  name: string
  shortName: string
  description: string
  category: string
  /** True draws over the price pane; false asks for a pane of its own. */
  overlay: boolean
  /**
   * `standard` indicators are the curated set. `community` ones are ports from
   * PineScript with no guarantee of matching the original, and the interface
   * labels them as unverified.
   */
  group: 'standard' | 'community' | 'candlestick'
  inputs: readonly IndicatorInputSpec[]
  plots: readonly IndicatorPlotSpec[]
  hlines: readonly IndicatorHLineSpec[]
  defaults: Readonly<Record<string, string | number | boolean>>
}

export type IndicatorInputs = Record<string, string | number | boolean>

/** Appearance of a single plotted line, editable per line. */
export interface IndicatorPlotStyle {
  color: string
  /** Lightweight Charts accepts 1 to 4 only. */
  lineWidth: number
  /** 0 to 1; folded into the colour, since the library has no opacity option. */
  opacity: number
  visible: boolean
}

export const DEFAULT_PLOT_COLOR = '#2f9cff'

export function defaultPlotStyle(plot: IndicatorPlotSpec): IndicatorPlotStyle {
  return {
    color: plot.color ?? DEFAULT_PLOT_COLOR,
    lineWidth: Math.min(4, Math.max(1, Math.round(plot.lineWidth ?? 1))),
    opacity: 1,
    visible: true,
  }
}

export function resolvePlotStyles(
  definition: IndicatorDefinition,
  provided: Readonly<Record<string, Partial<IndicatorPlotStyle>>> = {},
): Record<string, IndicatorPlotStyle> {
  const styles: Record<string, IndicatorPlotStyle> = {}
  for (const plot of definition.plots) {
    const base = defaultPlotStyle(plot)
    const given = provided[plot.id] ?? {}
    styles[plot.id] = {
      color: typeof given.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(given.color)
        ? given.color
        : base.color,
      lineWidth: Number.isFinite(given.lineWidth)
        ? Math.min(4, Math.max(1, Math.round(given.lineWidth as number)))
        : base.lineWidth,
      opacity: Number.isFinite(given.opacity)
        ? Math.min(1, Math.max(0, given.opacity as number))
        : base.opacity,
      visible: typeof given.visible === 'boolean' ? given.visible : base.visible,
    }
  }
  return styles
}

/**
 * Lightweight Charts has no opacity option, so transparency is folded into the
 * colour. Hex is expanded to `rgba` only when it is actually needed.
 */
export function plotColor(style: IndicatorPlotStyle): string {
  if (style.opacity >= 1) {
    return style.color
  }
  let hex = style.color.slice(1)
  if (hex.length === 3) {
    hex = [...hex].map((c) => c + c).join('')
  }
  const value = Number.parseInt(hex.slice(0, 6), 16)
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  return `rgba(${r}, ${g}, ${b}, ${style.opacity.toFixed(2)})`
}

/** An indicator applied to a tab, with the parameters the user chose. */
export interface IndicatorInstance {
  /** Unique per application: the same indicator can be applied twice. */
  instanceId: string
  definitionId: string
  inputs: IndicatorInputs
  /** Appearance per plot id; an indicator can draw several lines. */
  styles: Record<string, IndicatorPlotStyle>
}

export function createInstanceId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `ind-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Coerces a value into what the parameter accepts, discarding anything the
 * spec cannot describe. Inputs reach here from persisted state and from user
 * typing, so neither the type nor the range can be assumed.
 */
export function coerceInput(
  spec: IndicatorInputSpec,
  value: unknown,
): string | number | boolean {
  switch (spec.type) {
    case 'bool':
      return typeof value === 'boolean' ? value : Boolean(spec.defval)

    case 'int':
    case 'float': {
      const parsed = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(parsed)) {
        return spec.defval
      }
      const rounded = spec.type === 'int' ? Math.round(parsed) : parsed
      const lower = spec.min ?? Number.NEGATIVE_INFINITY
      const upper = spec.max ?? Number.POSITIVE_INFINITY
      return Math.min(upper, Math.max(lower, rounded))
    }

    case 'string':
    case 'source': {
      const text = typeof value === 'string' ? value : String(spec.defval)
      // An out-of-list option would make the library fall back silently.
      return spec.options && !spec.options.includes(text)
        ? String(spec.defval)
        : text
    }

    case 'color':
      return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
        ? value
        : String(spec.defval)
  }
}

/** Fills in defaults and sanitises whatever the caller provided. */
export function resolveInputs(
  definition: IndicatorDefinition,
  provided: Readonly<Record<string, unknown>> = {},
): IndicatorInputs {
  const resolved: IndicatorInputs = {}
  for (const spec of definition.inputs) {
    resolved[spec.id] = coerceInput(
      spec,
      spec.id in provided ? provided[spec.id] : definition.defaults[spec.id],
    )
  }
  return resolved
}

/**
 * Families of parameter, used to lay the form out.
 *
 * The catalog lists inputs in calculation order, which interleaves kinds: the
 * SMA declares length, source, offset, smoothing type, smoothing length and
 * deviation. Editing four numbers then means jumping over two dropdowns.
 */
export type IndicatorInputGroupKind
  = | 'numeric'
    | 'choice'
    | 'toggle'
    | 'color'
    | 'text'

export interface IndicatorInputGroup {
  kind: IndicatorInputGroupKind
  label: string
  inputs: IndicatorInputSpec[]
}

const GROUP_LABELS: Record<IndicatorInputGroupKind, string> = {
  numeric: 'Valores',
  choice: 'Seleções',
  toggle: 'Opções',
  color: 'Cores',
  text: 'Texto',
}

/** Presentation order; within a group the catalog order is preserved. */
const GROUP_ORDER: IndicatorInputGroupKind[] = [
  'numeric',
  'choice',
  'toggle',
  'color',
  'text',
]

export function inputGroupKind(
  spec: IndicatorInputSpec,
): IndicatorInputGroupKind {
  switch (spec.type) {
    case 'int':
    case 'float':
      return 'numeric'
    case 'bool':
      return 'toggle'
    case 'color':
      return 'color'
    case 'source':
      return 'choice'
    case 'string':
      // A string with options is a dropdown; without them it is free text.
      return spec.options?.length ? 'choice' : 'text'
  }
}

/**
 * Groups parameters by family, keeping the catalog order inside each group so
 * related settings stay in their declared sequence.
 */
export function groupIndicatorInputs(
  inputs: readonly IndicatorInputSpec[],
): IndicatorInputGroup[] {
  const buckets = new Map<IndicatorInputGroupKind, IndicatorInputSpec[]>()
  for (const spec of inputs) {
    const kind = inputGroupKind(spec)
    const bucket = buckets.get(kind)
    if (bucket) {
      bucket.push(spec)
    } else {
      buckets.set(kind, [spec])
    }
  }
  return GROUP_ORDER
    .filter((kind) => buckets.has(kind))
    .map((kind) => ({
      kind,
      label: GROUP_LABELS[kind],
      inputs: buckets.get(kind) as IndicatorInputSpec[],
    }))
}

/** Label shown on the chart legend, e.g. `RSI 14`. */
export function instanceLabel(
  definition: IndicatorDefinition,
  inputs: IndicatorInputs,
): string {
  const numeric = definition.inputs
    .filter((spec) => spec.type === 'int' || spec.type === 'float')
    .map((spec) => inputs[spec.id])
    .filter((value) => typeof value === 'number')
  return numeric.length > 0
    ? `${definition.shortName} ${numeric.join(' ')}`
    : definition.shortName
}
