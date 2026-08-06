import { shallowRef } from 'vue'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  MouseEventParams,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type {
  AnchorEdit,
  ChartDrawing,
  DrawingAnchor,
  DrawingConfiguration,
  DrawingLineStyle,
  DrawingToolId,
} from '@drawings/domain/chartDrawings'
import {
  CATALOG_DRAWING_TOOL_IDS,
  DRAWING_ANCHORS,
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_LINE_STYLE,
  DRAWING_DEFAULT_NEGATIVE_COLOR,
  DRAWING_DEFAULT_POSITIVE_COLOR,
  DRAWING_DEFAULT_WIDTH,
  DRAWING_MAX_ANCHORS,
  anchorEditAt,
  createDrawingId,
  defaultDrawingLevels,
  defaultDrawingText,
  drawingStyleCapabilities,
  isCatalogDrawingTool,
  isVariablePointDrawing,
  logicalForTime,
  timeForLogical,
} from '@drawings/domain/chartDrawings'
import {
  CatalogDrawing,
} from '@drawings/plugins/catalog-drawings/catalog-drawing'
import { TrendLine } from '@drawings/plugins/line-tools/trend-line'
import { HorizontalLine } from '@drawings/plugins/line-tools/horizontal-line'
import { HorizontalRay } from '@drawings/plugins/line-tools/horizontal-ray'
import { VerticalLine } from '@drawings/plugins/line-tools/vertical-line'
import { CrossLine } from '@drawings/plugins/line-tools/cross-line'
import { FibRetracement } from '@drawings/plugins/line-tools/fib-retracement'
import { FibExtension } from '@drawings/plugins/line-tools/fib-extension'
import { Rectangle } from '@drawings/plugins/line-tools/rectangle'
import { Circle } from '@drawings/plugins/line-tools/circle'
import { Triangle } from '@drawings/plugins/line-tools/triangle'
import { ParallelChannel } from '@drawings/plugins/line-tools/parallel-channel'
import { LongPosition } from '@drawings/plugins/line-tools/long-position'
import { ShortPosition } from '@drawings/plugins/line-tools/short-position'
import { Measure } from '@drawings/plugins/line-tools/measure'
import { PriceRange } from '@drawings/plugins/line-tools/price-range'
import { DateRange } from '@drawings/plugins/line-tools/date-range'
import { DatePriceRange } from '@drawings/plugins/line-tools/date-price-range'
import { RepaintPump } from '@drawings/plugins/repaintPump'
import type { LogicalPoint } from '@drawings/plugins/line-tools/base-types'
import {
  DEFAULT_TEXT_APPEARANCE,
  copyTextAppearance,
  estimateTextWidth,
  normalizeTextAppearance,
  textBoxHeight,
} from '@renderer-shared/domain/textAppearance'

/**
 * Owns the drawings on one chart: the active tool, the clicks that build a
 * shape, and the primitives that render it.
 *
 * The upstream plugin ships a 2.000-line manager with its own floating
 * toolbar, its own theme and its own chart controls. This one keeps the
 * primitives and nothing else, because the app already has a toolbar, a theme
 * and a persistence model — see the README inside `plugins/line-tools`.
 *
 * Reactivity is limited to low-frequency interface state: active tool,
 * visibility, lock, selection and list revision. A drawing is created by a
 * click and repainted by the chart's own paint pass; neither belongs in Vue's
 * render queue (ADR-0003).
 */

export interface ChartDrawingsOptions {
  chart: () => IChartApi | null
  /** Drawings attach here: it owns the price scale they are anchored to. */
  series: () => ISeriesApi<SeriesType> | null
  /**
   * The bars currently loaded, ascending. The anchor is an instant, and only
   * the owner of the candles can say where an instant sits among them. Passed
   * as the live array — never a copy — because the preview reads it per
   * pointer move.
   */
  bars: () => readonly { time: number }[]
  /** Called when the set of drawings changes, so it can be persisted. */
  onChange?: (drawings: ChartDrawing[]) => void
}

/** The shape of every vendored tool that takes more than one point. */
interface MutablePreview {
  _p1?: LogicalPoint
  _p2?: LogicalPoint
  _p3?: LogicalPoint
  updatePoints?: (...points: LogicalPoint[]) => void
  updateAllViews(): void
}

/**
 * What the vendored tools offer beyond `ISeriesPrimitive`.
 *
 * Every one of them answers `toolHitTest` in pane coordinates and draws its
 * anchors when selected; the setters differ because a horizontal line has a
 * price and nothing else, while a triangle has three points.
 */
interface EditableTool {
  toolHitTest?: (
    x: number,
    y: number,
  ) => { hit: boolean, type: 'point' | 'line' | 'shape' } | null
  setSelected?: (selected: boolean) => void
  applyOptions?: (options: Record<string, unknown>) => void
  updatePrice?: (price: number) => void
  updatePoint?: (point: LogicalPoint) => void
  updatePosition?: (logical: Logical) => void
  updatePoints?: (...points: LogicalPoint[]) => void
}

interface MountedDrawing {
  drawing: ChartDrawing
  primitive: ISeriesPrimitive<Time>
}

const SECOND_ANCHOR_TEXT_TOOLS = new Set<DrawingToolId>([
  'callout',
  'anchored-text',
])

const DIRECT_TEXT_TOOLS = new Set<DrawingToolId>([
  'text-annotation',
  'price-note',
  'price-label',
])

/** Pane coordinates plus the values they map to, as the chart resolved them. */
interface CursorPosition {
  logical: number
  price: number
  x: number
  y: number
}

/** A drag in progress: where it started and the anchors it started from. */
interface DragState {
  entry: MountedDrawing
  logical: number
  price: number
  anchors: readonly DrawingAnchor[]
  /** Reused result buffer; one drag must not allocate on every pointer move. */
  movedAnchors: DrawingAnchor[]
  /** Which anchor each axis belongs to, or null to slide the whole shape. */
  edit: AnchorEdit | null
  moved: boolean
}

/**
 * The option names each tool actually answers to.
 *
 * There is no shared vocabulary: the line family takes `lineColor` and
 * `width`, the position tools take `lineColor` and `lineWidth`, the ones drawn
 * as areas take `borderColor` and `borderWidth`, and the fibonacci tools carry
 * a colour per level and accept only the width. An option under the wrong name
 * is not rejected — it is merged in and never read, so the drawing silently
 * keeps the vendored default. That is how the four line tools spent a while
 * ignoring the thickness the operator picked.
 *
 * A table rather than a `switch`: a new entry in `DrawingToolId` then fails to
 * compile until someone states which pair it answers to, where a `default`
 * branch would guess.
 */
const catalogStyleOptionNames = Object.fromEntries(
  CATALOG_DRAWING_TOOL_IDS.map((tool) => [
    tool,
    { color: 'lineColor', width: 'width' },
  ]),
) as Record<
  typeof CATALOG_DRAWING_TOOL_IDS[number],
  { color: string, width: string }
>

const STYLE_OPTION_NAMES: Record<
  DrawingToolId,
  { color: string | null, width: string }
> = {
  ...catalogStyleOptionNames,
  'trend-line': { color: 'lineColor', width: 'width' },
  'horizontal-line': { color: 'lineColor', width: 'width' },
  'horizontal-ray': { color: 'lineColor', width: 'width' },
  'vertical-line': { color: 'lineColor', width: 'width' },
  'cross-line': { color: 'lineColor', width: 'width' },
  'rectangle': { color: 'lineColor', width: 'width' },
  'circle': { color: 'lineColor', width: 'width' },
  'triangle': { color: 'lineColor', width: 'width' },
  'parallel-channel': { color: 'lineColor', width: 'width' },
  'long-position': { color: 'lineColor', width: 'lineWidth' },
  'short-position': { color: 'lineColor', width: 'lineWidth' },
  'measure': { color: null, width: 'borderWidth' },
  'price-range': { color: null, width: 'borderWidth' },
  'date-range': { color: 'borderColor', width: 'borderWidth' },
  'date-price-range': { color: null, width: 'borderWidth' },
  // Fibonacci carries a colour per level; a single colour has nowhere to go.
  'fib-retracement': { color: null, width: 'width' },
  'fib-extension': { color: null, width: 'width' },
}

/** Translates a drawing into the vocabulary of the tool that renders it. */
export function styleFor(drawing: ChartDrawing): Record<string, unknown> {
  const names = STYLE_OPTION_NAMES[drawing.tool]
  const capabilities = drawingStyleCapabilities(drawing.tool)
  const style: Record<string, unknown> = { [names.width]: drawing.lineWidth }
  if (names.color !== null) {
    style[names.color] = drawing.color
  }
  if (capabilities.lineStyle) {
    style.lineStyle = drawing.lineStyle ?? DRAWING_DEFAULT_LINE_STYLE
  }
  if (capabilities.signedColors) {
    style.positiveColor = drawing.configuration?.positiveColor
      ?? DRAWING_DEFAULT_POSITIVE_COLOR
    style.negativeColor = drawing.configuration?.negativeColor
      ?? DRAWING_DEFAULT_NEGATIVE_COLOR
  }
  if (capabilities.levels) {
    const levels = drawing.configuration?.levels
      ?? defaultDrawingLevels(drawing.tool)
    style.levels = drawing.tool === 'fib-retracement'
      || drawing.tool === 'fib-extension'
      ? levels.map(({ value, color }) => ({ coeff: value, color }))
      : levels
  }
  if (capabilities.text) {
    style.text = drawing.configuration?.text
      ?? defaultDrawingText(drawing.tool)
    style.textAppearance = normalizeTextAppearance(
      drawing.configuration?.textAppearance ?? DEFAULT_TEXT_APPEARANCE,
    )
  }
  return style
}

/** Everything a tool's constructor needs beyond its points. */
interface PrimitiveContext {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  drawing: ChartDrawing
  style: Record<string, unknown>
}

interface PrimitiveSpec {
  /**
   * Resolved points the constructor takes. The horizontal line takes none: it
   * is the one tool with no horizontal anchor at all, so it still has to build
   * when its instant cannot be placed among the loaded bars.
   */
  points: number
  /** Reads every persisted anchor instead of truncating to `points`. */
  variablePoints?: boolean
  create: (
    context: PrimitiveContext,
    points: readonly LogicalPoint[],
  ) => ISeriesPrimitive<Time>
}

/**
 * How each tool is constructed, one row per tool.
 *
 * Also a table rather than a `switch`, for the same reason as the style names:
 * a tool added to `DrawingToolId` and forgotten here would fall into a
 * `default` and quietly return null, which reads on screen as a drawing that
 * refuses to appear.
 */
const catalogPrimitiveSpecs = Object.fromEntries(
  CATALOG_DRAWING_TOOL_IDS.map((tool) => [
    tool,
    {
      points: DRAWING_ANCHORS[tool],
      variablePoints: isVariablePointDrawing(tool),
      create: (
        { chart, series, style }: PrimitiveContext,
        points: readonly LogicalPoint[],
      ) => new CatalogDrawing(chart, series, tool, points, style),
    },
  ]),
) as unknown as Record<
  typeof CATALOG_DRAWING_TOOL_IDS[number],
  PrimitiveSpec
>

const PRIMITIVE_SPECS: Record<DrawingToolId, PrimitiveSpec> = {
  ...catalogPrimitiveSpecs,
  'horizontal-line': {
    points: 0,
    create: ({ chart, series, drawing, style }) =>
      new HorizontalLine(chart, series, drawing.anchors[0].price, style),
  },
  'horizontal-ray': {
    points: 1,
    create: ({ chart, series, style }, [p1]) =>
      new HorizontalRay(chart, series, p1, style),
  },
  'vertical-line': {
    points: 1,
    create: ({ chart, series, style }, [p1]) =>
      new VerticalLine(chart, series, p1.logical as Logical, style),
  },
  'cross-line': {
    points: 1,
    create: ({ chart, series, style }, [p1]) =>
      new CrossLine(chart, series, p1, style),
  },
  'trend-line': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new TrendLine(chart, series, p1, p2, style),
  },
  'fib-retracement': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new FibRetracement(chart, series, p1, p2, style),
  },
  'rectangle': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new Rectangle(chart, series, p1, p2, style),
  },
  'circle': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new Circle(chart, series, p1, p2, style),
  },
  'measure': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new Measure(chart, series, p1, p2, style),
  },
  'price-range': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new PriceRange(chart, series, p1, p2, style),
  },
  'date-range': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new DateRange(chart, series, p1, p2, style),
  },
  'date-price-range': {
    points: 2,
    create: ({ chart, series, style }, [p1, p2]) =>
      new DatePriceRange(chart, series, p1, p2, style),
  },
  'fib-extension': {
    points: 3,
    create: ({ chart, series, style }, [p1, p2, p3]) =>
      new FibExtension(chart, series, p1, p2, p3, style),
  },
  'triangle': {
    points: 3,
    create: ({ chart, series, style }, [p1, p2, p3]) =>
      new Triangle(chart, series, p1, p2, p3, style),
  },
  'parallel-channel': {
    points: 3,
    create: ({ chart, series, style }, [p1, p2, p3]) =>
      new ParallelChannel(chart, series, p1, p2, p3, style),
  },
  'long-position': {
    points: 3,
    create: ({ chart, series, style }, [p1, p2, p3]) =>
      new LongPosition(chart, series, p1, p2, p3, style),
  },
  'short-position': {
    points: 3,
    create: ({ chart, series, style }, [p1, p2, p3]) =>
      new ShortPosition(chart, series, p1, p2, p3, style),
  },
}

export function useChartDrawings(options: ChartDrawingsOptions) {
  const mounted: MountedDrawing[] = []
  /** Anchors already clicked for the shape being drawn. */
  let pending: DrawingAnchor[] = []
  /** Same clicks in the renderer's coordinate system, without re-searching. */
  let pendingPoints: LogicalPoint[] = []
  /** Reused on every preview frame to avoid allocating per pointer pixel. */
  const previewPoints: LogicalPoint[] = []
  /** Reused while a selected primitive follows the pointer. */
  const dragPoints: LogicalPoint[] = []
  /**
   * Every tool exposes its points as `_p1`, `_p2`, `_p3` and rebuilds its
   * views on demand, so the preview can drive any of them without knowing
   * which tool it holds.
   */
  let preview: MutablePreview | undefined
  /**
   * Where the crosshair is, as the chart itself resolved it.
   *
   * The anchor is placed on a DOM release, but the position comes from here:
   * the chart already maps the pointer to a logical position and a price for
   * the right pane, and it reports nothing while the pointer is off the plot.
   */
  let cursor: CursorPosition | null = null
  /** Where the current press started, null when no button is down. */
  let pressedAt: { x: number, y: number } | null = null
  /** Set while a selected drawing is being dragged. */
  let drag: DragState | null = null
  /*
   * Drawings that belong to this asset but have no place on the chart yet.
   *
   * A drawing resolves its instants against the loaded bars, and the chart may
   * have none — the history request failed, or has not answered. Dropping them
   * would be worse than invisible: `persist` writes what it knows, so the next
   * shape the operator drew would erase from storage every drawing that could
   * not be placed. They are kept here and retried by `rebuild`.
   */
  const unbuilt: ChartDrawing[] = []
  /** Holds the chart's repaint signal; the vendored tools do not take it. */
  const pump = new RepaintPump()
  let pumpAttached = false

  function ensurePump(): void {
    const series = options.series()
    if (pumpAttached || !series) {
      return
    }
    series.attachPrimitive(pump)
    pumpAttached = true
  }

  const activeTool = shallowRef<DrawingToolId | null>(null)
  const visible = shallowRef(true)
  const locked = shallowRef(false)
  /** Bumped when the list changes, so the toolbar can show a count. */
  const revision = shallowRef(0)
  /** The drawing under edit, or null. Read by the style bar. */
  const selected = shallowRef<ChartDrawing | null>(null)

  function editable(primitive: ISeriesPrimitive<Time>): EditableTool {
    return primitive as unknown as EditableTool
  }

  function persist(): void {
    options.onChange?.(allDrawings())
  }

  /** The topmost drawing under a pane coordinate, newest first. */
  function drawingAt(x: number, y: number): MountedDrawing | null {
    // A hidden drawing is off the chart, and hit testing does not know that:
    // the primitives answer `toolHitTest` whether or not they are attached. A
    // click on apparently empty chart would pick a shape nobody can see, open
    // the style bar on it and let it be dragged blind.
    if (!visible.value || locked.value) {
      return null
    }
    for (let index = mounted.length - 1; index >= 0; index -= 1) {
      const entry = mounted[index]
      if (editable(entry.primitive).toolHitTest?.(x, y)?.hit) {
        return entry
      }
    }
    return null
  }

  /**
   * Text labels are wider than their anchor. Primitive hit tests know the
   * shape, but most imported tools only test a small radius around the point;
   * double-clicking the visible end of a label would otherwise miss it.
   */
  function textDrawingAt(x: number, y: number): MountedDrawing | null {
    if (!visible.value || locked.value) {
      return null
    }
    for (let index = mounted.length - 1; index >= 0; index -= 1) {
      const entry = mounted[index]
      if (!drawingStyleCapabilities(entry.drawing.tool).text) {
        continue
      }
      const primitiveHit = editable(entry.primitive)
        .toolHitTest?.(x, y)?.hit
      if (primitiveHit || textLabelContains(entry.drawing, x, y)) {
        return entry
      }
    }
    return null
  }

  function textLabelContains(
    drawing: ChartDrawing,
    x: number,
    y: number,
  ): boolean {
    const points = paneCoordinates(drawing)
    const pointIndex = SECOND_ANCHOR_TEXT_TOOLS.has(drawing.tool) ? 1 : 0
    const point = points[pointIndex]
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return false
    }
    const direct = DIRECT_TEXT_TOOLS.has(drawing.tool)
      || SECOND_ANCHOR_TEXT_TOOLS.has(drawing.tool)
    const originX = point.x + (direct ? 0 : 18)
    const originY = point.y + (direct ? 0 : -18)
    const text = drawing.configuration?.text
      ?? defaultDrawingText(drawing.tool)
    const appearance = normalizeTextAppearance(
      drawing.configuration?.textAppearance ?? DEFAULT_TEXT_APPEARANCE,
    )
    const priceWidth = drawing.tool === 'price-note'
      || drawing.tool === 'price-label'
      ? 92
      : 0
    // Renderer uses 11px Inter. This deliberately errs a few pixels wide so
    // the full painted box remains easy to acquire at different font metrics.
    const estimatedWidth = estimateTextWidth(text, appearance)
      + 12
      + priceWidth * appearance.fontSize / 12
    const width = Math.min(340, Math.max(42, estimatedWidth))
    const height = textBoxHeight(appearance)
    return x >= originX - 10
      && x <= originX + width + 5
      && y >= originY - height / 2 - 6
      && y <= originY + height / 2 + 6
  }

  function markSelected(id: string | null): void {
    const targetId = locked.value ? null : id
    let found: ChartDrawing | null = null
    for (const entry of mounted) {
      const isTarget = entry.drawing.id === targetId
      editable(entry.primitive).setSelected?.(isTarget)
      if (isTarget) {
        found = entry.drawing
      }
    }
    selected.value = found
    pump.request()
  }

  /**
   * Where a drawing's anchors sit on screen, for reading a grabbed handle.
   *
   * An anchor the chart cannot place is put infinitely far away rather than
   * dropped: the caller matches handles by index, and a shorter array would
   * shift every anchor after it onto the wrong axis.
   */
  function paneCoordinates(
    drawing: ChartDrawing,
  ): { x: number, y: number }[] {
    const chart = options.chart()
    const series = options.series()
    if (!chart || !series) {
      return []
    }
    const scale = chart.timeScale()
    return drawing.anchors.map((anchor) => {
      const logical = toLogical(anchor.time)
      return {
        x: (logical === null ? null : scale.logicalToCoordinate(logical))
          ?? Number.NEGATIVE_INFINITY,
        y: series.priceToCoordinate(anchor.price) ?? Number.NEGATIVE_INFINITY,
      }
    })
  }

  /**
   * Slides the dragged drawing to follow the pointer.
   *
   * The offset is taken in the chart's own units — logical position and price
   * — and only then turned back into an instant, so dragging across a gap in
   * the candles moves the drawing by what the operator sees, not by a
   * duration.
   */
  function moveDragged(position: CursorPosition): void {
    const current = drag
    if (!current) {
      return
    }
    const entry = current.entry
    const bars = options.bars()
    const deltaLogical = position.logical - current.logical
    const deltaPrice = position.price - current.price
    /*
     * A handle drags only what it owns. On a rectangle's top-right corner that
     * is the instant of one anchor and the price of the other, so the two axes
     * are decided apart; with no handle grabbed, everything moves and the
     * shape slides rigid.
     */
    const edit = current.edit
    for (let index = 0; index < current.anchors.length; index += 1) {
      const anchor = current.anchors[index]
      const movesTime = !edit || edit.time === index
      const movesPrice = !edit || edit.price === index
      const logical = movesTime ? logicalForTime(bars, anchor.time) : null
      const time = !movesTime
        ? anchor.time
        : logical === null ? null : timeForLogical(bars, logical + deltaLogical)
      if (time === null) {
        return
      }
      const moved = current.movedAnchors[index]
      moved.time = time
      moved.price = movesPrice ? anchor.price + deltaPrice : anchor.price
    }
    entry.drawing.anchors = current.movedAnchors
    current.moved = true
    if (movePrimitive(entry)) {
      pump.request()
    }
  }

  /**
   * Writes new anchors onto a live primitive.
   *
   * Rebuilding it would be simpler and is not an option: attaching mutates the
   * chart's model, and a drag does this once per pointer move (ADR-0003).
   */
  function movePrimitive(entry: MountedDrawing): boolean {
    dragPoints.length = entry.drawing.anchors.length
    for (let index = 0; index < entry.drawing.anchors.length; index += 1) {
      const anchor = entry.drawing.anchors[index]
      const logical = toLogical(anchor.time)
      if (logical === null) {
        dragPoints.length = 0
        return false
      }
      const point = dragPoints[index]
      if (point) {
        point.logical = logical
        point.price = anchor.price
      } else {
        dragPoints[index] = { logical, price: anchor.price }
      }
    }
    const [p1] = dragPoints
    const tool = editable(entry.primitive)
    if (isCatalogDrawingTool(entry.drawing.tool)) {
      tool.updatePoints?.(...dragPoints)
      return true
    }
    switch (entry.drawing.tool) {
      case 'horizontal-line':
        tool.updatePrice?.(entry.drawing.anchors[0].price)
        break
      case 'horizontal-ray':
      case 'cross-line':
        tool.updatePoint?.(p1)
        break
      case 'vertical-line':
        tool.updatePosition?.(p1.logical as Logical)
        break
      default:
        tool.updatePoints?.(...dragPoints)
    }
    return true
  }

  /** An anchor as the primitives want it, or null when it cannot be placed. */
  function toPoint(anchor: DrawingAnchor | undefined): LogicalPoint | null {
    if (!anchor) {
      return null
    }
    const logical = toLogical(anchor.time)
    return logical === null ? null : { logical, price: anchor.price }
  }

  /**
   * Time is the anchor; the logical index is derived from the loaded bars.
   *
   * Deliberately not `timeScale().timeToCoordinate`: that resolves only exact
   * bar times, so a line drawn on the 1h chart would disappear on the 4h one,
   * where its timestamps are not bars.
   */
  function toLogical(time: number): Logical | null {
    const logical = logicalForTime(options.bars(), time)
    return logical === null ? null : logical as Logical
  }

  /** Seconds between the last two bars, for a non-degenerate first segment. */
  function barSpanSeconds(): number {
    const bars = options.bars()
    if (bars.length < 2) {
      return 60
    }
    const span = bars[bars.length - 1].time - bars[bars.length - 2].time
    return span > 0 ? span : 60
  }

  function buildPrimitive(
    drawing: ChartDrawing,
  ): ISeriesPrimitive<Time> | null {
    const chart = options.chart()
    const series = options.series()
    if (!chart || !series) {
      return null
    }
    const spec = PRIMITIVE_SPECS[drawing.tool]
    const points: LogicalPoint[] = []
    const pointCount = spec.variablePoints
      ? drawing.anchors.length
      : spec.points
    for (let index = 0; index < pointCount; index += 1) {
      const point = toPoint(drawing.anchors[index])
      if (!point) {
        return null
      }
      points.push(point)
    }
    const style = styleFor(drawing)
    return spec.create({ chart, series, drawing, style }, points)
  }

  function attach(primitive: ISeriesPrimitive<Time>): boolean {
    const series = options.series()
    if (!series) {
      return false
    }
    ensurePump()
    series.attachPrimitive(primitive)
    pump.request()
    return true
  }

  /**
   * The chart only ever holds primitives the operator asked to see.
   *
   * Hidden drawings stay built and listed — they are only off the chart — so
   * every path that puts one back has to ask first. A rebuild after loading
   * older history used to make the whole hidden set reappear.
   */
  function attachIfVisible(primitive: ISeriesPrimitive<Time>): void {
    if (visible.value) {
      attach(primitive)
    }
  }

  function detach(primitive: ISeriesPrimitive<Time>): void {
    try {
      options.series()?.detachPrimitive(primitive)
      pump.request()
    } catch {
      // The series may already be gone with the chart; nothing to release.
    }
  }

  function clearPreview(): void {
    if (preview) {
      detach(preview)
      preview = undefined
    }
  }

  /** Hands panning back to the chart after a drag took the gesture over. */
  function releaseChartPan(): void {
    options.chart()?.applyOptions({ handleScroll: true, handleScale: true })
  }

  /**
   * Replaces every primitive on the chart with one built from `drawings`.
   *
   * Shared by the two callers that do this — a prepend of older candles, which
   * shifts every logical index, and restoring a saved layout — because the
   * order matters: detaching after building would leave the old primitive
   * attached under the new one.
   */
  function mountAll(drawings: readonly ChartDrawing[]): void {
    mounted.forEach((entry) => detach(entry.primitive))
    mounted.length = 0
    unbuilt.length = 0
    drawings.forEach((drawing) => {
      const primitive = buildPrimitive(drawing)
      if (primitive) {
        mounted.push({ drawing, primitive })
        attachIfVisible(primitive)
        return
      }
      unbuilt.push(drawing)
    })
  }

  /** Everything that belongs to this asset, placed or not, in stored order. */
  function allDrawings(): ChartDrawing[] {
    return [...mounted.map((entry) => entry.drawing), ...unbuilt]
  }

  /**
   * Puts the shape on the chart while anchors are still missing.
   *
   * Created here, on the click, and never while the pointer moves. Attaching a
   * primitive mutates the chart model, and doing that inside the crosshair
   * callback re-enters the update it is already running: measured, every
   * pointer event then hit the 5 s input timeout. The move path only writes a
   * point.
   *
   * The missing anchors are offset by one bar each instead of repeating the
   * last one. A zero-length segment gives the tool a degenerate autoscale range
   * and an undefined direction, and the chart stopped delivering clicks
   * altogether — the second click never arrived and the line could never be
   * finished. The offset is replaced by the first pointer move anyway.
   */
  function showPreview(tool: DrawingToolId): void {
    clearPreview()
    const last = pending[pending.length - 1]
    const anchors = [...pending]
    const span = barSpanSeconds()
    while (anchors.length < DRAWING_ANCHORS[tool]) {
      anchors.push({
        time: last.time + span * (anchors.length - pending.length + 1),
        price: last.price,
      })
    }
    const built = buildPrimitive({
      id: 'preview',
      tool,
      anchors,
      color: DRAWING_DEFAULT_COLOR,
      lineWidth: DRAWING_DEFAULT_WIDTH,
      lineStyle: DRAWING_DEFAULT_LINE_STYLE,
    })
    if (built && attach(built)) {
      preview = built as unknown as MutablePreview
    }
  }

  function commit(drawing: ChartDrawing): void {
    const primitive = buildPrimitive(drawing)
    if (!primitive) {
      return
    }
    mounted.push({ drawing, primitive })
    revision.value += 1
    persist()
    /*
     * Attached on the next frame, never inside the click callback that got us
     * here. Attaching mutates the chart's model, and doing it while the chart
     * is still dispatching the mouse event leaves its event handler in a state
     * where the *following* click is swallowed: measured — the first drawing
     * landed and the second click did nothing at all.
     */
    requestAnimationFrame(() => {
      if (mounted.some((entry) => entry.primitive === primitive)) {
        attachIfVisible(primitive)
      }
    })
  }

  function finishVariableDrawing(removeDuplicateEnd = false): boolean {
    const tool = activeTool.value
    if (!tool || !isVariablePointDrawing(tool)) {
      return false
    }
    if (removeDuplicateEnd && pending.length > DRAWING_ANCHORS[tool]) {
      pending.pop()
      pendingPoints.pop()
    }
    if (pending.length < DRAWING_ANCHORS[tool]) {
      return false
    }
    clearPreview()
    commit({
      id: createDrawingId(),
      tool,
      anchors: pending,
      color: DRAWING_DEFAULT_COLOR,
      lineWidth: DRAWING_DEFAULT_WIDTH,
      lineStyle: DRAWING_DEFAULT_LINE_STYLE,
    })
    pending = []
    pendingPoints = []
    activeTool.value = null
    return true
  }

  function updateSelectedDrawing(
    update: (drawing: ChartDrawing) => ChartDrawing,
  ): void {
    const id = selected.value?.id
    const index = mounted.findIndex((entry) => entry.drawing.id === id)
    if (index < 0) {
      return
    }
    const entry = mounted[index]
    entry.drawing = update(entry.drawing)
    const tool = editable(entry.primitive)
    if (tool.applyOptions) {
      tool.applyOptions(styleFor(entry.drawing))
    } else {
      const rebuilt = buildPrimitive(entry.drawing)
      if (rebuilt) {
        detach(entry.primitive)
        entry.primitive = rebuilt
        attachIfVisible(rebuilt)
      }
    }
    editable(entry.primitive).setSelected?.(true)
    selected.value = entry.drawing
    pump.request()
    revision.value += 1
    persist()
  }

  return {
    activeTool,
    visible,
    locked,
    revision,

    selected,

    select(tool: DrawingToolId | null): void {
      activeTool.value = tool
      pending = []
      pendingPoints = []
      clearPreview()
      if (tool) {
        markSelected(null)
      }
    },

    /**
     * Remembers where a press started, to tell a click from a pan — and takes
     * over the gesture when it lands on the drawing already selected.
     */
    handlePointerDown(event: MouseEvent): void {
      pressedAt = { x: event.clientX, y: event.clientY }
      if (drag) {
        // The previous drag never saw its release: the button came up outside
        // the element the handlers are bound to. Hand panning back before
        // taking the gesture again, or the chart stays frozen.
        releaseChartPan()
        drag = null
      }
      const position = cursor
      if (activeTool.value || !position) {
        return
      }
      const entry = drawingAt(position.x, position.y)
      if (!entry || entry.drawing.id !== selected.value?.id) {
        return
      }
      const grabbed = editable(entry.primitive)
        .toolHitTest?.(position.x, position.y)
      drag = {
        entry,
        logical: position.logical,
        price: position.price,
        anchors: entry.drawing.anchors.map((anchor) => ({ ...anchor })),
        movedAnchors: entry.drawing.anchors.map((anchor) => ({ ...anchor })),
        edit: grabbed?.type === 'point'
          ? anchorEditAt(paneCoordinates(entry.drawing), position.x, position.y)
          : null,
        moved: false,
      }
      /*
       * The chart pans on the same gesture. Handing it back on release, not
       * on the next selection: leaving scroll off would freeze the chart the
       * moment a drag ended outside the plot.
       */
      options.chart()?.applyOptions({ handleScroll: false, handleScale: false })
    },

    /**
     * A release either starts a shape or finishes it. Tools that need one
     * anchor complete immediately; the trend line waits for the second.
     *
     * Deliberately driven from the DOM instead of `subscribeClick`. The chart
     * swallows any second click that lands within 500 ms of the first,
     * whatever the distance between them: two clicks inside that window take
     * its double-click branch, which then fires nothing because they are far
     * apart, and the single-click handler is never called. Every tool that
     * needs more than one point lost the point a trader placed quickly — the
     * second click of a trend line simply did nothing.
     */
    handlePointerUp(event: MouseEvent): void {
      const start = pressedAt
      const finishedDrag = drag
      pressedAt = null
      drag = null
      if (finishedDrag) {
        releaseChartPan()
        if (finishedDrag.moved) {
          revision.value += 1
          persist()
          return
        }
      }
      const tool = activeTool.value
      const series = options.series()
      const position = cursor
      if (!start || !series || !position) {
        return
      }
      // Dragging the chart is panning, not drawing. Same five pixels the
      // chart itself uses to cancel a click.
      const travelled = Math.abs(event.clientX - start.x)
        + Math.abs(event.clientY - start.y)
      const pane = series.getPane().getHTMLElement()
      if (
        travelled >= 5
        || !pane
        || !(event.target instanceof Node)
        || !pane.contains(event.target)
      ) {
        return
      }
      // With no tool armed, a click is a selection: on a shape it picks it,
      // on empty chart it lets go of whatever was picked.
      if (!tool) {
        markSelected(drawingAt(position.x, position.y)?.drawing.id ?? null)
        return
      }
      const time = timeForLogical(options.bars(), position.logical)
      if (time === null) {
        return
      }
      pending.push({ time, price: position.price })
      pendingPoints.push({ logical: position.logical, price: position.price })

      if (isVariablePointDrawing(tool)) {
        if (pending.length >= DRAWING_MAX_ANCHORS) {
          finishVariableDrawing()
        } else {
          showPreview(tool)
        }
        return
      }
      if (pending.length < DRAWING_ANCHORS[tool]) {
        showPreview(tool)
        return
      }
      clearPreview()
      commit({
        id: createDrawingId(),
        tool,
        anchors: pending,
        color: DRAWING_DEFAULT_COLOR,
        lineWidth: DRAWING_DEFAULT_WIDTH,
        lineStyle: DRAWING_DEFAULT_LINE_STYLE,
      })
      pending = []
      pendingPoints = []
      // One shape per activation, like every charting platform: the tool stays
      // armed only while the operator is placing it.
      activeTool.value = null
    },

    /**
     * Live preview of the segment being drawn.
     *
     * The second point is moved on the existing primitive instead of building
     * and reattaching one. Attaching mutates the chart's model, so recreating
     * per pointer move meant invalidating the whole chart once per mouse pixel
     * — the drawing competing with the candles for the same frame (ADR-0003).
     */
    handleMove(param: MouseEventParams): void {
      const series = options.series()
      // Straight from the event: the preview wants a logical position, and
      // going through a timestamp would cost a search over the bars per pixel.
      const logical = param.logical
      const price = series && param.point
        ? series.coordinateToPrice(param.point.y)
        : null
      if (logical === undefined || price === null || !param.point) {
        cursor = null
      } else if (cursor) {
        cursor.logical = logical
        cursor.price = price
        cursor.x = param.point.x
        cursor.y = param.point.y
      } else {
        cursor = { logical, price, x: param.point.x, y: param.point.y }
      }
      if (drag && cursor) {
        moveDragged(cursor)
        return
      }
      if (!preview || pending.length === 0 || !cursor) {
        return
      }
      /*
       * The cursor drives the point right after the ones already clicked, and
       * every point beyond it follows: a three-point tool has to stay a
       * coherent shape while only its first corner is fixed.
       */
      const tool = activeTool.value
      if (!tool) {
        return
      }
      const expected = isVariablePointDrawing(tool)
        ? pendingPoints.length + 1
        : DRAWING_ANCHORS[tool]
      previewPoints.length = expected
      for (let index = 0; index < expected; index += 1) {
        const source = pendingPoints[index] ?? cursor
        const point = previewPoints[index]
        if (point) {
          point.logical = source.logical
          point.price = source.price
        } else {
          previewPoints[index] = {
            logical: source.logical,
            price: source.price,
          }
        }
      }
      if (preview.updatePoints) {
        preview.updatePoints(...previewPoints)
      } else {
        preview._p1 = previewPoints[0]
        preview._p2 = previewPoints[1]
        preview._p3 = previewPoints[2]
        preview.updateAllViews()
      }
      /*
       * The frame has to be asked for here too. The crosshair paints on its own
       * layer, so a pointer move does not repaint the pane the primitives live
       * on: without this the preview only redrew when something else did — a
       * market tick — and the line followed the cursor in visible steps.
       *
       * Safe per move because the pump defers to the next frame and coalesces:
       * many moves in one frame cost one repaint.
       */
      pump.request()
    },

    /**
     * Rebuilds every primitive from its anchors.
     *
     * Called when the data underneath changes: prepending older candles shifts
     * every logical index, and a primitive holding the old one would drift
     * away from the price it was drawn against.
     */
    rebuild(): void {
      const before = mounted.length
      mountAll(allDrawings())
      markSelected(selected.value?.id ?? null)
      // A drawing the new indexing cannot place left the list; the count the
      // toolbar shows must not keep claiming it.
      if (mounted.length !== before) {
        revision.value += 1
      }
    },

    /** Replaces everything on the chart, for restoring a saved layout. */
    restore(drawings: readonly ChartDrawing[]): void {
      // Whatever was half-drawn belonged to the data being replaced.
      pending = []
      pendingPoints = []
      clearPreview()
      selected.value = null
      mountAll(drawings)
      revision.value += 1
    },

    /** Everything this chart knows about, whether it could be placed or not. */
    drawings(): ChartDrawing[] {
      return allDrawings()
    },

    /** Finishes a variable-point tool with Enter or a final double-click. */
    finishActive(removeDuplicateEnd = false): boolean {
      return finishVariableDrawing(removeDuplicateEnd)
    },

    selectTextAt(x: number, y: number): ChartDrawing | null {
      if (activeTool.value) {
        return null
      }
      const entry = textDrawingAt(x, y)
      if (!entry) {
        return null
      }
      markSelected(entry.drawing.id)
      return entry.drawing
    },

    /** Lets go of the drawing under edit, leaving it on the chart. */
    deselect(): void {
      markSelected(null)
    },

    /** Removes the drawing under edit. */
    removeSelected(): void {
      const id = selected.value?.id
      const index = mounted.findIndex((entry) => entry.drawing.id === id)
      if (index < 0) {
        return
      }
      detach(mounted[index].primitive)
      mounted.splice(index, 1)
      selected.value = null
      revision.value += 1
      persist()
    },

    /**
     * Restyles the drawing under edit.
     *
     * Three of the tools take no options at all, so those are rebuilt from
     * their anchors — a rebuild is fine here because restyling happens on a
     * click, never per pointer move.
     */
    restyleSelected(style: {
      color?: string
      lineWidth?: number
      lineStyle?: DrawingLineStyle
    }): void {
      updateSelectedDrawing((drawing) => ({ ...drawing, ...style }))
    },

    configureSelected(configuration: DrawingConfiguration): void {
      updateSelectedDrawing((drawing) => ({
        ...drawing,
        configuration: {
          ...drawing.configuration,
          ...configuration,
          ...(configuration.levels
            ? { levels: configuration.levels.map((level) => ({ ...level })) }
            : {}),
          ...(configuration.textAppearance
            ? {
                textAppearance: copyTextAppearance(
                  configuration.textAppearance,
                ),
              }
            : {}),
        },
      }))
    },

    clear(): void {
      mounted.forEach((entry) => detach(entry.primitive))
      mounted.length = 0
      unbuilt.length = 0
      pending = []
      pendingPoints = []
      selected.value = null
      locked.value = false
      clearPreview()
      revision.value += 1
      persist()
    },

    toggleVisibility(): void {
      visible.value = !visible.value
      if (visible.value) {
        mounted.forEach((entry) => attach(entry.primitive))
        return
      }
      // Nothing can stay under edit once it leaves the chart, or the style bar
      // would go on offering colours for a shape that is no longer drawn.
      markSelected(null)
      mounted.forEach((entry) => detach(entry.primitive))
    },

    toggleLock(): void {
      locked.value = !locked.value
      if (locked.value) {
        markSelected(null)
      }
    },

    count(): number {
      // Read so the toolbar re-renders on the next change: `mounted` is a
      // plain array on purpose, and cannot report its own length (ADR-0003).
      void revision.value
      // Counts what could not be placed yet: those are the operator's own
      // drawings, only without bars to position themselves against.
      return mounted.length + unbuilt.length
    },

    dispose(): void {
      clearPreview()
      mounted.forEach((entry) => detach(entry.primitive))
      mounted.length = 0
      unbuilt.length = 0
      pending = []
      pendingPoints = []
      drag = null
      selected.value = null
      locked.value = false
      pump.cancel()
      if (pumpAttached) {
        try {
          options.series()?.detachPrimitive(pump)
        } catch {
          // The series went with the chart; nothing to release.
        }
        pumpAttached = false
      }
    },
  }
}

export type ChartDrawings = ReturnType<typeof useChartDrawings>
