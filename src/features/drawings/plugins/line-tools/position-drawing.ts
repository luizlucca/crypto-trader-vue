import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  AutoscaleInfo,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Logical,
  SeriesOptionsMap,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type {
  HitTestResult,
  LogicalPoint,
  ViewPoint,
} from './base-types'
import { isPointInRectangle } from './base-types'

export type PositionDirection = 'long' | 'short'

export interface PositionDrawingOptions {
  lineColor: string
  profitColor: string
  lossColor: string
  profitLineColor: string
  lossLineColor: string
  lineWidth: number
  zoneOpacity: number
  textColor: string
  locked?: boolean
}

export interface PositionMetrics {
  profit: number
  profitPercentage: number
  loss: number
  lossPercentage: number
}

const DEFAULT_OPTIONS: PositionDrawingOptions = {
  lineColor: '#787B86',
  profitColor: '#26A69A',
  lossColor: '#EF5350',
  profitLineColor: '#26A69A',
  lossLineColor: '#EF5350',
  lineWidth: 1,
  zoneOpacity: 0.18,
  textColor: '#FFFFFF',
  locked: false,
}

const HANDLE_TOLERANCE = 8
const MINIMUM_WIDTH = 50

interface PositionGeometry {
  entry: { x: number, y: number }
  stop: { x: number, y: number }
  target: { x: number, y: number }
  left: number
  right: number
  top: number
  bottom: number
}

function geometry(
  entry: ViewPoint,
  stop: ViewPoint,
  target: ViewPoint,
): PositionGeometry | null {
  if (
    entry.x === null || entry.y === null
    || stop.x === null || stop.y === null
    || target.x === null || target.y === null
  ) {
    return null
  }
  const left = Math.min(entry.x, stop.x, target.x)
  const right = left + Math.max(
    Math.max(entry.x, stop.x, target.x) - left,
    MINIMUM_WIDTH,
  )
  return {
    entry: { x: entry.x, y: entry.y },
    stop: { x: stop.x, y: stop.y },
    target: { x: target.x, y: target.y },
    left,
    right,
    top: Math.min(entry.y, stop.y, target.y),
    bottom: Math.max(entry.y, stop.y, target.y),
  }
}

function drawHorizontalLine(
  context: CanvasRenderingContext2D,
  left: number,
  right: number,
  y: number,
  color: string,
  width: number,
): void {
  context.strokeStyle = color
  context.lineWidth = width
  context.beginPath()
  context.moveTo(left, y)
  context.lineTo(right, y)
  context.stroke()
}

function drawMetricBadge(
  context: CanvasRenderingContext2D,
  canvasSize: { width: number, height: number },
  x: number,
  y: number,
  color: string,
  textColor: string,
  text: string,
): void {
  context.save()
  context.font = '600 11px "JetBrains Mono Variable", monospace'
  const horizontalPadding = 7
  const height = 23
  const width = context.measureText(text).width + horizontalPadding * 2
  const left = Math.max(0, Math.min(x - width / 2, canvasSize.width - width))
  const top = Math.max(0, Math.min(y - height / 2, canvasSize.height - height))
  context.fillStyle = color
  context.beginPath()
  context.roundRect(left, top, width, height, 4)
  context.fill()
  context.fillStyle = textColor
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, left + width / 2, top + height / 2)
  context.restore()
}

function drawHandle(
  context: CanvasRenderingContext2D,
  point: { x: number, y: number },
  color: string,
): void {
  context.fillStyle = '#FFFFFF'
  context.strokeStyle = color
  context.lineWidth = 2
  context.beginPath()
  context.arc(point.x, point.y, 5, 0, Math.PI * 2)
  context.fill()
  context.stroke()
}

class PositionRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly source: PositionDrawing,
    private readonly entry: ViewPoint,
    private readonly stop: ViewPoint,
    private readonly target: ViewPoint,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const shape = geometry(this.entry, this.stop, this.target)
      if (!shape) {
        return
      }
      const options = this.source.options()
      const width = shape.right - shape.left

      context.save()
      context.globalAlpha = options.zoneOpacity
      context.fillStyle = options.profitColor
      context.fillRect(
        shape.left,
        Math.min(shape.entry.y, shape.target.y),
        width,
        Math.abs(shape.target.y - shape.entry.y),
      )
      context.fillStyle = options.lossColor
      context.fillRect(
        shape.left,
        Math.min(shape.entry.y, shape.stop.y),
        width,
        Math.abs(shape.stop.y - shape.entry.y),
      )
      context.restore()

      context.save()
      drawHorizontalLine(
        context,
        shape.left,
        shape.right,
        shape.entry.y,
        options.lineColor,
        options.lineWidth,
      )
      drawHorizontalLine(
        context,
        shape.left,
        shape.right,
        shape.target.y,
        options.profitLineColor,
        options.lineWidth,
      )
      drawHorizontalLine(
        context,
        shape.left,
        shape.right,
        shape.stop.y,
        options.lossLineColor,
        options.lineWidth,
      )

      const labels = this.source.labels()
      drawMetricBadge(
        context,
        mediaSize,
        (shape.left + shape.right) / 2,
        (shape.entry.y + shape.target.y) / 2,
        options.profitLineColor,
        options.textColor,
        labels.profit,
      )
      drawMetricBadge(
        context,
        mediaSize,
        (shape.left + shape.right) / 2,
        (shape.entry.y + shape.stop.y) / 2,
        options.lossLineColor,
        options.textColor,
        labels.loss,
      )

      if (this.source.selected()) {
        drawHandle(context, shape.entry, options.lineColor)
        drawHandle(context, shape.stop, options.lossLineColor)
        drawHandle(context, shape.target, options.profitLineColor)
      }
      context.restore()
    })
  }
}

class PositionPaneView implements IPrimitivePaneView {
  private readonly entry: ViewPoint = { x: null, y: null }
  private readonly stop: ViewPoint = { x: null, y: null }
  private readonly target: ViewPoint = { x: null, y: null }
  private readonly paneRenderer: PositionRenderer

  constructor(private readonly source: PositionDrawing) {
    this.paneRenderer = new PositionRenderer(
      source,
      this.entry,
      this.stop,
      this.target,
    )
  }

  update(): void {
    this.writeCoordinate(this.source.entryPoint(), this.entry)
    this.writeCoordinate(this.source.stopPoint(), this.stop)
    this.writeCoordinate(this.source.targetPoint(), this.target)
  }

  renderer(): PositionRenderer {
    return this.paneRenderer
  }

  private writeCoordinate(point: LogicalPoint, target: ViewPoint): void {
    target.x = this.source.chart().timeScale().logicalToCoordinate(
      point.logical as Logical,
    )
    target.y = this.source.series().priceToCoordinate(point.price)
  }
}

export class PositionDrawing implements ISeriesPrimitive<Time> {
  private readonly paneView: PositionPaneView
  private readonly views: PositionPaneView[]
  private readonly drawingOptions: PositionDrawingOptions
  private entry: LogicalPoint
  private stop: LogicalPoint
  private target: LogicalPoint
  private isSelected = false
  private cachedMetrics: PositionMetrics | null = null
  private cachedLabels: { profit: string, loss: string } | null = null

  constructor(
    private readonly chartApi: IChartApi,
    private readonly seriesApi: ISeriesApi<SeriesType>,
    private readonly positionDirection: PositionDirection,
    entry: LogicalPoint,
    stop: LogicalPoint,
    target: LogicalPoint,
    options: Partial<PositionDrawingOptions> = {},
  ) {
    this.entry = { ...entry }
    this.stop = { ...stop }
    this.target = { ...target }
    this.drawingOptions = { ...DEFAULT_OPTIONS, ...options }
    this.paneView = new PositionPaneView(this)
    this.views = [this.paneView]
  }

  chart(): IChartApi {
    return this.chartApi
  }

  series(): ISeriesApi<keyof SeriesOptionsMap> {
    return this.seriesApi
  }

  entryPoint(): LogicalPoint {
    return this.entry
  }

  stopPoint(): LogicalPoint {
    return this.stop
  }

  targetPoint(): LogicalPoint {
    return this.target
  }

  options(): Readonly<PositionDrawingOptions> {
    return this.drawingOptions
  }

  selected(): boolean {
    return this.isSelected
  }

  metrics(): PositionMetrics {
    this.cachedMetrics ??= this.createMetrics()
    return this.cachedMetrics
  }

  labels(): { profit: string, loss: string } {
    this.cachedLabels ??= this.createLabels()
    return this.cachedLabels
  }

  updatePoints(
    entry: LogicalPoint,
    stop: LogicalPoint,
    target: LogicalPoint,
  ): void {
    this.writePoint(this.entry, entry)
    this.writePoint(this.stop, stop)
    this.writePoint(this.target, target)
    this.invalidateValues()
  }

  updatePointByIndex(index: number, point: LogicalPoint): void {
    if (index === 0) {
      const logicalDelta = point.logical - this.entry.logical
      const priceDelta = point.price - this.entry.price
      this.writePoint(this.entry, point)
      this.stop.logical += logicalDelta
      this.stop.price += priceDelta
      this.target.logical += logicalDelta
      this.target.price += priceDelta
    } else if (index === 1) {
      this.writePoint(this.stop, point)
    } else if (index === 2) {
      this.writePoint(this.target, point)
    }
    this.invalidateValues()
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected
    this.updateAllViews()
  }

  applyOptions(options: Partial<PositionDrawingOptions>): void {
    Object.assign(this.drawingOptions, options)
    this.updateAllViews()
  }

  toolHitTest(x: number, y: number): HitTestResult | null {
    const shape = geometry(
      this.coordinate(this.entry),
      this.coordinate(this.stop),
      this.coordinate(this.target),
    )
    if (!shape) {
      return null
    }
    const handles = [shape.entry, shape.stop, shape.target]
    for (let index = 0; index < handles.length; index += 1) {
      if (Math.hypot(x - handles[index].x, y - handles[index].y) < HANDLE_TOLERANCE) {
        return { hit: true, type: 'point', index }
      }
    }
    return isPointInRectangle({ x, y }, {
      x1: shape.left,
      y1: shape.top,
      x2: shape.right,
      y2: shape.bottom,
    })
      ? { hit: true, type: 'shape' }
      : null
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return null
  }

  updateAllViews(): void {
    this.paneView.update()
  }

  paneViews(): PositionPaneView[] {
    return this.views
  }

  private coordinate(point: LogicalPoint): ViewPoint {
    return {
      x: this.chartApi.timeScale().logicalToCoordinate(point.logical as Logical),
      y: this.seriesApi.priceToCoordinate(point.price),
    }
  }

  private createMetrics(): PositionMetrics {
    const direction = this.positionDirection === 'long' ? 1 : -1
    const base = this.entry.price
    const profit = (this.target.price - base) * direction
    const loss = (this.stop.price - base) * direction
    return {
      profit,
      profitPercentage: base === 0 ? 0 : profit / base * 100,
      loss,
      lossPercentage: base === 0 ? 0 : loss / base * 100,
    }
  }

  private createLabels(): { profit: string, loss: string } {
    const metrics = this.metrics()
    return {
      profit: `TP ${formatSigned(metrics.profitPercentage)}% · ${this.formatSignedPrice(metrics.profit)}`,
      loss: `SL ${formatSigned(metrics.lossPercentage)}% · ${this.formatSignedPrice(metrics.loss)}`,
    }
  }

  private formatSignedPrice(value: number): string {
    const formatted = this.seriesApi.priceFormatter().format(value)
    return value > 0 ? `+${formatted}` : formatted
  }

  private invalidateValues(): void {
    this.cachedMetrics = null
    this.cachedLabels = null
    this.updateAllViews()
  }

  private writePoint(target: LogicalPoint, source: LogicalPoint): void {
    target.logical = source.logical
    target.price = source.price
  }
}

function formatSigned(value: number): string {
  const formatted = value.toFixed(2)
  return value > 0 ? `+${formatted}` : formatted
}
