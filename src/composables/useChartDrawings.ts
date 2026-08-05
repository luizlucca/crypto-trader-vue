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
  DrawingToolId,
} from '@/domain/chartDrawings'
import {
  DRAWING_ANCHORS,
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_WIDTH,
  anchorEditAt,
  createDrawingId,
  logicalForTime,
  timeForLogical,
} from '@/domain/chartDrawings'
import { TrendLine } from '@/plugins/lineTools/trend-line'
import { HorizontalLine } from '@/plugins/lineTools/horizontal-line'
import { HorizontalRay } from '@/plugins/lineTools/horizontal-ray'
import { VerticalLine } from '@/plugins/lineTools/vertical-line'
import { FibRetracement } from '@/plugins/lineTools/fib-retracement'
import { FibExtension } from '@/plugins/lineTools/fib-extension'
import { Rectangle } from '@/plugins/lineTools/rectangle'
import { Circle } from '@/plugins/lineTools/circle'
import { Triangle } from '@/plugins/lineTools/triangle'
import { ParallelChannel } from '@/plugins/lineTools/parallel-channel'
import { LongPosition } from '@/plugins/lineTools/long-position'
import { ShortPosition } from '@/plugins/lineTools/short-position'
import { Measure } from '@/plugins/lineTools/measure'
import { PriceRange } from '@/plugins/lineTools/price-range'
import { DateRange } from '@/plugins/lineTools/date-range'
import { RepaintPump } from '@/plugins/repaintPump'
import type { LogicalPoint } from '@/plugins/lineTools/base-types'

/**
 * Owns the drawings on one chart: the active tool, the clicks that build a
 * shape, and the primitives that render it.
 *
 * The upstream plugin ships a 2.000-line manager with its own floating
 * toolbar, its own theme and its own chart controls. This one keeps the
 * primitives and nothing else, because the app already has a toolbar, a theme
 * and a persistence model — see `src/plugins/lineTools/README.md`.
 *
 * Nothing here is reactive except the two values the toolbar renders. A
 * drawing is created by a click and repainted by the chart's own paint pass;
 * neither belongs in Vue's render queue (ADR-0003).
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
  _p1: LogicalPoint
  _p2?: LogicalPoint
  _p3?: LogicalPoint
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
  updatePoints?: (
    p1: LogicalPoint,
    p2: LogicalPoint,
    p3?: LogicalPoint,
  ) => void
}

interface MountedDrawing {
  drawing: ChartDrawing
  primitive: ISeriesPrimitive<Time>
}

/** Pane coordinates plus the values they map to, as the chart resolved them. */
interface CursorPosition {
  logical: number
  price: number
  x: number
  y: number
}

/** A drag in progress: where it started and the anchors it started from. */
interface DragState {
  id: string
  logical: number
  price: number
  anchors: readonly DrawingAnchor[]
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
const STYLE_OPTION_NAMES: Record<
  DrawingToolId,
  { color: string | null, width: string }
> = {
  'trend-line': { color: 'lineColor', width: 'width' },
  'horizontal-line': { color: 'lineColor', width: 'width' },
  'horizontal-ray': { color: 'lineColor', width: 'width' },
  'vertical-line': { color: 'lineColor', width: 'width' },
  'rectangle': { color: 'lineColor', width: 'width' },
  'circle': { color: 'lineColor', width: 'width' },
  'triangle': { color: 'lineColor', width: 'width' },
  'parallel-channel': { color: 'lineColor', width: 'width' },
  'long-position': { color: 'lineColor', width: 'lineWidth' },
  'short-position': { color: 'lineColor', width: 'lineWidth' },
  'measure': { color: 'borderColor', width: 'borderWidth' },
  'price-range': { color: 'borderColor', width: 'borderWidth' },
  'date-range': { color: 'borderColor', width: 'borderWidth' },
  // Fibonacci carries a colour per level; a single colour has nowhere to go.
  'fib-retracement': { color: null, width: 'width' },
  'fib-extension': { color: null, width: 'width' },
}

/** Translates a drawing into the vocabulary of the tool that renders it. */
export function styleFor(drawing: ChartDrawing): Record<string, unknown> {
  const names = STYLE_OPTION_NAMES[drawing.tool]
  const style: Record<string, unknown> = { [names.width]: drawing.lineWidth }
  if (names.color !== null) {
    style[names.color] = drawing.color
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
  points: 0 | 1 | 2 | 3
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
const PRIMITIVE_SPECS: Record<DrawingToolId, PrimitiveSpec> = {
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
    if (!visible.value) {
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

  function markSelected(id: string | null): void {
    let found: ChartDrawing | null = null
    for (const entry of mounted) {
      const isTarget = entry.drawing.id === id
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
    const entry = current
      ? mounted.find((item) => item.drawing.id === current.id)
      : undefined
    if (!current || !entry) {
      return
    }
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
    const anchors: DrawingAnchor[] = []
    for (const [index, anchor] of current.anchors.entries()) {
      const movesTime = !edit || edit.time === index
      const movesPrice = !edit || edit.price === index
      const logical = movesTime ? logicalForTime(bars, anchor.time) : null
      const time = !movesTime
        ? anchor.time
        : logical === null ? null : timeForLogical(bars, logical + deltaLogical)
      if (time === null) {
        return
      }
      anchors.push({
        time,
        price: movesPrice ? anchor.price + deltaPrice : anchor.price,
      })
    }
    entry.drawing.anchors = anchors
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
    const points: LogicalPoint[] = []
    for (const anchor of entry.drawing.anchors) {
      const point = toPoint(anchor)
      if (!point) {
        return false
      }
      points.push(point)
    }
    const [p1, p2, p3] = points
    const tool = editable(entry.primitive)
    switch (entry.drawing.tool) {
      case 'horizontal-line':
        tool.updatePrice?.(entry.drawing.anchors[0].price)
        break
      case 'horizontal-ray':
        tool.updatePoint?.(p1)
        break
      case 'vertical-line':
        tool.updatePosition?.(p1.logical as Logical)
        break
      default:
        tool.updatePoints?.(p1, p2, p3)
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
    for (let index = 0; index < spec.points; index += 1) {
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

  return {
    activeTool,
    visible,
    revision,

    selected,

    select(tool: DrawingToolId | null): void {
      activeTool.value = tool
      pending = []
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
        id: entry.drawing.id,
        logical: position.logical,
        price: position.price,
        anchors: entry.drawing.anchors.map((anchor) => ({ ...anchor })),
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
      })
      pending = []
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
      cursor = logical === undefined || price === null || !param.point
        ? null
        : { logical, price, x: param.point.x, y: param.point.y }
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
      if (pending.length <= 1) {
        preview._p2 = { logical: cursor.logical, price: cursor.price }
      }
      if (pending.length <= 2 && preview._p3 !== undefined) {
        // A fresh object, never the one just written to `_p2`: the tools keep
        // the points they are given, and two aliased corners are one corner.
        preview._p3 = { logical: cursor.logical, price: cursor.price }
      }
      preview.updateAllViews()
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
      clearPreview()
      selected.value = null
      mountAll(drawings)
      revision.value += 1
    },

    /** Everything this chart knows about, whether it could be placed or not. */
    drawings(): ChartDrawing[] {
      return allDrawings()
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
    restyleSelected(style: { color?: string, lineWidth?: number }): void {
      const id = selected.value?.id
      const index = mounted.findIndex((entry) => entry.drawing.id === id)
      if (index < 0) {
        return
      }
      const entry = mounted[index]
      entry.drawing = {
        ...entry.drawing,
        ...(style.color === undefined ? {} : { color: style.color }),
        ...(style.lineWidth === undefined ? {} : { lineWidth: style.lineWidth }),
      }
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
    },

    clear(): void {
      mounted.forEach((entry) => detach(entry.primitive))
      mounted.length = 0
      unbuilt.length = 0
      pending = []
      selected.value = null
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
      drag = null
      selected.value = null
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
