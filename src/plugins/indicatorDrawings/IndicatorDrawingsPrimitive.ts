import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { MediaCoordinatesRenderingScope } from 'fancy-canvas'
import type {
  DrawingLineStyle,
  IndicatorDrawings,
} from '@/domain/indicatorDrawings'
import { EMPTY_DRAWINGS } from '@/domain/indicatorDrawings'

/**
 * Draws the free-form output of an indicator: segments, boxes and labels.
 *
 * One primitive serves one indicator instance. It holds the shapes in chart
 * coordinates and converts them per frame, which is what makes panning and
 * zooming work without asking the worker for anything.
 *
 * **This runs on the chart's paint path**, alongside the candles and the order
 * book commit (ADR-0003). Two rules follow from that, and both are load-bearing:
 * nothing is allocated per frame beyond the canvas calls themselves, and shapes
 * outside the visible range are skipped before any conversion.
 */

const DASH_PATTERNS: Record<DrawingLineStyle, number[]> = {
  solid: [],
  dashed: [6, 4],
  dotted: [2, 3],
}

const LABEL_FONT_SIZE: Record<string, number> = {
  tiny: 9,
  small: 10,
  normal: 12,
  large: 14,
}

const LABEL_PADDING = 4
const LABEL_GAP = 6

interface Anchor {
  x: number
  y: number
}

class DrawingsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly primitive: IndicatorDrawingsPrimitive) {}

  draw(target: { useMediaCoordinateSpace: <T>(
    f: (scope: MediaCoordinatesRenderingScope) => T,
  ) => T }): void {
    target.useMediaCoordinateSpace((scope) => {
      this.primitive.render(scope)
    })
  }
}

class DrawingsPaneView implements IPrimitivePaneView {
  private readonly _renderer: DrawingsRenderer

  constructor(primitive: IndicatorDrawingsPrimitive) {
    this._renderer = new DrawingsRenderer(primitive)
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class BandsRenderer implements IPrimitivePaneRenderer {
  constructor(private readonly primitive: IndicatorDrawingsPrimitive) {}

  draw(target: { useMediaCoordinateSpace: <T>(
    f: (scope: MediaCoordinatesRenderingScope) => T,
  ) => T }): void {
    target.useMediaCoordinateSpace((scope) => {
      this.primitive.renderBands(scope)
    })
  }
}

/** Bands sit behind the candles: they are context, never the subject. */
class BandsPaneView implements IPrimitivePaneView {
  private readonly _renderer: BandsRenderer

  constructor(primitive: IndicatorDrawingsPrimitive) {
    this._renderer = new BandsRenderer(primitive)
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

export class IndicatorDrawingsPrimitive implements ISeriesPrimitive<Time> {
  private drawings: IndicatorDrawings = EMPTY_DRAWINGS
  /**
   * Text widths, measured once per label instead of once per frame. Measuring
   * is not free, and this renderer runs on the same paint pass as the candles.
   */
  private textWidths = new Map<string, number>()
  private chart: IChartApi | undefined
  private series: ISeriesApi<SeriesType> | undefined
  private requestUpdate: (() => void) | undefined
  // Kept as a stable array: the library caches pane views by reference.
  private readonly views: IPrimitivePaneView[] = [
    new BandsPaneView(this),
    new DrawingsPaneView(this),
  ]

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart as IChartApi
    this.series = param.series as ISeriesApi<SeriesType>
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = undefined
    this.series = undefined
    this.requestUpdate = undefined
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views
  }

  /** Replaces every shape. The catalog recomputes them whole, never in parts. */
  setDrawings(drawings: IndicatorDrawings): void {
    this.drawings = drawings
    this.textWidths.clear()
    this.requestUpdate?.()
  }

  /**
   * Full-height vertical bands. Each one spans a run of bars, so its edges sit
   * half a bar outside the first and last bar it covers — otherwise the band
   * would stop at the centre of the bar and leave a visible seam.
   */
  renderBands(scope: MediaCoordinatesRenderingScope): void {
    const chart = this.chart
    if (!chart || this.drawings.bands.length === 0) {
      return
    }
    const { context, mediaSize } = scope
    const timeScale = chart.timeScale()
    const halfBar = timeScale.options().barSpacing / 2

    for (const band of this.drawings.bands) {
      const x1 = timeScale.timeToCoordinate(band.time1 as UTCTimestamp)
      const x2 = timeScale.timeToCoordinate(band.time2 as UTCTimestamp)
      if (x1 === null || x2 === null) {
        continue
      }
      const left = Math.min(x1, x2) - halfBar
      const right = Math.max(x1, x2) + halfBar
      if (right < 0 || left > mediaSize.width) {
        continue
      }
      context.fillStyle = band.color
      context.fillRect(left, 0, Math.max(right - left, 1), mediaSize.height)
    }
  }

  render(scope: MediaCoordinatesRenderingScope): void {
    const chart = this.chart
    const series = this.series
    if (!chart || !series) {
      return
    }
    const { context, mediaSize } = scope
    const timeScale = chart.timeScale()
    const width = mediaSize.width
    const height = mediaSize.height

    const x = (time: number): number | null => (
      timeScale.timeToCoordinate(time as UTCTimestamp)
    )
    const y = (price: number): number | null => series.priceToCoordinate(price)

    context.save()
    try {
      this.renderBoxes(context, x, y, width, height)
      this.renderLines(context, x, y, width)
      this.renderLabels(context, x, y, width, height)
    } finally {
      context.restore()
    }
  }

  private renderBoxes(
    context: CanvasRenderingContext2D,
    x: (time: number) => number | null,
    y: (price: number) => number | null,
    width: number,
    height: number,
  ): void {
    for (const box of this.drawings.boxes) {
      const x1 = x(box.time1)
      const x2 = x(box.time2)
      const y1 = y(box.price1)
      const y2 = y(box.price2)
      if (x1 === null || x2 === null || y1 === null || y2 === null) {
        continue
      }
      const left = Math.min(x1, x2)
      const right = Math.max(x1, x2)
      const top = Math.min(y1, y2)
      const bottom = Math.max(y1, y2)
      if (right < 0 || left > width || bottom < 0 || top > height) {
        continue
      }
      // A zero-height box is a level, not a rectangle: keep it visible.
      const boxHeight = Math.max(bottom - top, 1)
      const boxWidth = Math.max(right - left, 1)

      context.fillStyle = box.bgColor
      context.fillRect(left, top, boxWidth, boxHeight)

      if (box.borderColor && (box.borderWidth ?? 0) > 0) {
        context.strokeStyle = box.borderColor
        context.lineWidth = box.borderWidth ?? 1
        context.setLineDash(DASH_PATTERNS[box.borderStyle ?? 'solid'])
        context.strokeRect(left, top, boxWidth, boxHeight)
        context.setLineDash(DASH_PATTERNS.solid)
      }

      if (box.text && boxHeight >= 10 && boxWidth >= 16) {
        context.fillStyle = box.textColor ?? '#FFFFFF'
        context.font = `${LABEL_FONT_SIZE.tiny}px sans-serif`
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(box.text, left + boxWidth / 2, top + boxHeight / 2)
      }
    }
  }

  private renderLines(
    context: CanvasRenderingContext2D,
    x: (time: number) => number | null,
    y: (price: number) => number | null,
    width: number,
  ): void {
    for (const line of this.drawings.lines) {
      const x1 = x(line.time1)
      const x2 = x(line.time2)
      const y1 = y(line.price1)
      const y2 = y(line.price2)
      if (x1 === null || x2 === null || y1 === null || y2 === null) {
        continue
      }
      let startX = x1
      let endX = x2
      let startY = y1
      let endY = y2

      if (line.extend === 'left' || line.extend === 'both') {
        const projected = projectTo(x1, y1, x2, y2, 0)
        startX = 0
        startY = projected
      }
      if (line.extend === 'right' || line.extend === 'both') {
        const projected = projectTo(x1, y1, x2, y2, width)
        endX = width
        endY = projected
      }

      context.strokeStyle = line.color
      context.lineWidth = line.width || 1
      context.setLineDash(DASH_PATTERNS[line.style] ?? DASH_PATTERNS.solid)
      context.beginPath()
      context.moveTo(startX, startY)
      context.lineTo(endX, endY)
      context.stroke()
    }
    context.setLineDash(DASH_PATTERNS.solid)
  }

  private renderLabels(
    context: CanvasRenderingContext2D,
    x: (time: number) => number | null,
    y: (price: number) => number | null,
    width: number,
    height: number,
  ): void {
    for (const label of this.drawings.labels) {
      const anchorX = x(label.time)
      const anchorY = y(label.price)
      if (anchorX === null || anchorY === null) {
        continue
      }
      const size = LABEL_FONT_SIZE[label.size ?? 'small'] ?? LABEL_FONT_SIZE.small
      context.font = `${size}px sans-serif`
      const key = `${size}|${label.text}`
      let textWidth = this.textWidths.get(key)
      if (textWidth === undefined) {
        textWidth = context.measureText(label.text).width
        this.textWidths.set(key, textWidth)
      }
      const boxWidth = textWidth + LABEL_PADDING * 2
      const boxHeight = size + LABEL_PADDING * 2
      const placed = placeLabel(
        label.style,
        { x: anchorX, y: anchorY },
        boxWidth,
        boxHeight,
      )
      if (placed.y + boxHeight < 0 || placed.y > height) {
        continue
      }
      // A label anchored on the last bar would otherwise run off the pane and
      // lose its last characters — exactly the ones that carry the value.
      const left = Math.max(0, Math.min(placed.x, width - boxWidth))
      const top = placed.y
      if (left + boxWidth < 0 || left > width) {
        continue
      }

      if (label.color) {
        context.fillStyle = label.color
        context.fillRect(left, top, boxWidth, boxHeight)
      }
      context.fillStyle = label.textColor
      context.textAlign = 'left'
      context.textBaseline = 'middle'
      context.fillText(label.text, left + LABEL_PADDING, top + boxHeight / 2)
    }
  }
}

/** Where the line would cross a given x, so `extend` reaches the pane edge. */
function projectTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  targetX: number,
): number {
  if (x2 === x1) {
    return y2
  }
  return y1 + ((y2 - y1) * (targetX - x1)) / (x2 - x1)
}

/** Top-left corner of the label box for each anchoring style. */
function placeLabel(
  style: string,
  anchor: Anchor,
  boxWidth: number,
  boxHeight: number,
): Anchor {
  if (style === 'label_left') {
    return { x: anchor.x - boxWidth - LABEL_GAP, y: anchor.y - boxHeight / 2 }
  }
  if (style === 'label_right') {
    return { x: anchor.x + LABEL_GAP, y: anchor.y - boxHeight / 2 }
  }
  if (style === 'label_down') {
    return { x: anchor.x - boxWidth / 2, y: anchor.y + LABEL_GAP }
  }
  if (style === 'label_center') {
    return { x: anchor.x - boxWidth / 2, y: anchor.y - boxHeight / 2 }
  }
  // label_up and anything unknown: above the anchor.
  return { x: anchor.x - boxWidth / 2, y: anchor.y - boxHeight - LABEL_GAP }
}
