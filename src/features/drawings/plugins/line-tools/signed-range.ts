import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  AutoscaleInfo,
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesOptionsMap,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type {
  HitTestResult,
  LogicalPoint,
  ViewPoint,
} from './base-types'
import { coordinateForLogical, isPointInRectangle } from './base-types'

export type SignedRangeMode = 'measure' | 'price' | 'date-price'

export interface SignedRangeOptions {
  positiveColor: string
  negativeColor: string
  borderWidth: number
  fillOpacity: number
}

const DEFAULT_OPTIONS: SignedRangeOptions = {
  positiveColor: '#2962FF',
  negativeColor: '#EF5350',
  borderWidth: 2,
  fillOpacity: 0.16,
}

const HANDLE_TOLERANCE = 8

interface RangeGeometry {
  x1: number
  y1: number
  x2: number
  y2: number
  left: number
  right: number
  top: number
  bottom: number
  centerX: number
  centerY: number
}

function rangeGeometry(first: ViewPoint, second: ViewPoint): RangeGeometry | null {
  if (
    first.x === null
    || first.y === null
    || second.x === null
    || second.y === null
  ) {
    return null
  }
  return {
    x1: first.x,
    y1: first.y,
    x2: second.x,
    y2: second.y,
    left: Math.min(first.x, second.x),
    right: Math.max(first.x, second.x),
    top: Math.min(first.y, second.y),
    bottom: Math.max(first.y, second.y),
    centerX: (first.x + second.x) / 2,
    centerY: (first.y + second.y) / 2,
  }
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: { x: number, y: number },
  end: { x: number, y: number },
): void {
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  const angle = Math.atan2(end.y - start.y, end.x - start.x)
  const size = 8
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - size * Math.cos(angle - Math.PI / 6),
    end.y - size * Math.sin(angle - Math.PI / 6),
  )
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - size * Math.cos(angle + Math.PI / 6),
    end.y - size * Math.sin(angle + Math.PI / 6),
  )
}

function drawRangeArrows(
  context: CanvasRenderingContext2D,
  range: RangeGeometry,
  mode: SignedRangeMode,
): void {
  context.beginPath()
  if (mode !== 'price') {
    drawArrow(
      context,
      { x: range.x1, y: range.centerY },
      { x: range.x2, y: range.centerY },
    )
  }
  drawArrow(
    context,
    { x: range.centerX, y: range.y1 },
    { x: range.centerX, y: range.y2 },
  )
  context.stroke()
}

function drawLabel(
  context: CanvasRenderingContext2D,
  canvasSize: { width: number, height: number },
  range: RangeGeometry,
  color: string,
  lines: readonly string[],
): void {
  context.save()
  context.font = '600 11px "JetBrains Mono Variable", monospace'
  const paddingX = 8
  const paddingY = 6
  const lineHeight = 15
  let textWidth = 0
  for (const line of lines) {
    textWidth = Math.max(textWidth, context.measureText(line).width)
  }
  const width = textWidth + paddingX * 2
  const height = lines.length * lineHeight + paddingY * 2
  const above = range.top - height - 8
  const preferredTop = above >= 0 ? above : range.bottom + 8
  const top = Math.max(0, Math.min(preferredTop, canvasSize.height - height))
  const left = Math.max(
    0,
    Math.min(range.centerX - width / 2, canvasSize.width - width),
  )

  context.fillStyle = color
  context.beginPath()
  context.roundRect(left, top, width, height, 5)
  context.fill()
  context.fillStyle = '#fff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (let index = 0; index < lines.length; index += 1) {
    context.fillText(
      lines[index],
      left + width / 2,
      top + paddingY + lineHeight * (index + 0.5),
    )
  }
  context.restore()
}

function drawHandles(
  context: CanvasRenderingContext2D,
  range: RangeGeometry,
  color: string,
): void {
  const handles = rangeHandles(range)
  context.save()
  context.fillStyle = '#fff'
  context.strokeStyle = color
  context.lineWidth = 2
  for (const handle of handles) {
    context.beginPath()
    context.arc(handle.x, handle.y, 5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
  context.restore()
}

function rangeHandles(range: RangeGeometry) {
  return [
    { x: range.x1, y: range.y1, index: 0 },
    { x: range.x2, y: range.y2, index: 1 },
    { x: range.x1, y: range.y2, index: 2 },
    { x: range.x2, y: range.y1, index: 3 },
    { x: range.centerX, y: range.top, index: 4 },
    { x: range.centerX, y: range.bottom, index: 5 },
    { x: range.left, y: range.centerY, index: 6 },
    { x: range.right, y: range.centerY, index: 7 },
  ]
}

class SignedRangeRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly source: SignedRangeDrawing,
    private readonly first: ViewPoint,
    private readonly second: ViewPoint,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const range = rangeGeometry(this.first, this.second)
      if (!range) {
        return
      }
      const options = this.source.options()
      const color = this.source.change() >= 0
        ? options.positiveColor
        : options.negativeColor
      const width = range.right - range.left
      const height = range.bottom - range.top

      context.save()
      context.globalAlpha = options.fillOpacity
      context.fillStyle = color
      context.fillRect(range.left, range.top, width, height)
      context.restore()
      context.save()
      context.strokeStyle = color
      context.lineWidth = options.borderWidth
      context.strokeRect(range.left, range.top, width, height)
      drawRangeArrows(context, range, this.source.mode())
      drawLabel(context, mediaSize, range, color, this.source.labels())
      if (this.source.selected()) {
        drawHandles(context, range, color)
      }
      context.restore()
    })
  }
}

class SignedRangePaneView implements IPrimitivePaneView {
  private readonly first: ViewPoint = { x: null, y: null }
  private readonly second: ViewPoint = { x: null, y: null }
  private readonly paneRenderer: SignedRangeRenderer

  constructor(private readonly source: SignedRangeDrawing) {
    this.paneRenderer = new SignedRangeRenderer(
      source,
      this.first,
      this.second,
    )
  }

  update(): void {
    this.writeCoordinate(this.source.firstPoint(), this.first)
    this.writeCoordinate(this.source.secondPoint(), this.second)
  }

  renderer(): SignedRangeRenderer {
    return this.paneRenderer
  }

  private writeCoordinate(point: LogicalPoint, target: ViewPoint): void {
    target.x = coordinateForLogical(
      this.source.chart().timeScale(),
      point.logical,
    )
    target.y = this.source.series().priceToCoordinate(point.price)
  }
}

export class SignedRangeDrawing implements ISeriesPrimitive<Time> {
  private readonly paneView: SignedRangePaneView
  private readonly views: SignedRangePaneView[]
  private readonly drawingOptions: SignedRangeOptions
  private first: LogicalPoint
  private second: LogicalPoint
  private isSelected = false
  private labelLines: readonly string[] | null = null

  constructor(
    private readonly chartApi: IChartApi,
    private readonly seriesApi: ISeriesApi<SeriesType>,
    private readonly rangeMode: SignedRangeMode,
    first: LogicalPoint,
    second: LogicalPoint,
    options: Partial<SignedRangeOptions> = {},
  ) {
    this.first = { ...first }
    this.second = { ...second }
    this.drawingOptions = { ...DEFAULT_OPTIONS, ...options }
    this.paneView = new SignedRangePaneView(this)
    this.views = [this.paneView]
  }

  chart(): IChartApi {
    return this.chartApi
  }

  series(): ISeriesApi<keyof SeriesOptionsMap> {
    return this.seriesApi
  }

  mode(): SignedRangeMode {
    return this.rangeMode
  }

  firstPoint(): LogicalPoint {
    return this.first
  }

  secondPoint(): LogicalPoint {
    return this.second
  }

  options(): Readonly<SignedRangeOptions> {
    return this.drawingOptions
  }

  selected(): boolean {
    return this.isSelected
  }

  change(): number {
    return this.second.price - this.first.price
  }

  labels(): readonly string[] {
    this.labelLines ??= this.createLabels()
    return this.labelLines
  }

  updatePoints(first: LogicalPoint, second: LogicalPoint): void {
    this.writePoint(this.first, first)
    this.writePoint(this.second, second)
    this.invalidateValues()
  }

  updatePointByIndex(index: number, point: LogicalPoint): void {
    if (index === 0 || index === 1) {
      this.writePoint(index === 0 ? this.first : this.second, point)
    } else if (index === 2 || index === 3) {
      const horizontal = index === 2 ? this.first : this.second
      const vertical = index === 2 ? this.second : this.first
      horizontal.logical = point.logical
      vertical.price = point.price
    } else {
      this.updateEdge(index, point)
    }
    this.invalidateValues()
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected
    this.updateAllViews()
  }

  applyOptions(options: Partial<SignedRangeOptions>): void {
    Object.assign(this.drawingOptions, options)
    this.updateAllViews()
  }

  toolHitTest(x: number, y: number): HitTestResult | null {
    const first = this.coordinate(this.first)
    const second = this.coordinate(this.second)
    const range = rangeGeometry(first, second)
    if (!range) {
      return null
    }
    for (const handle of rangeHandles(range)) {
      if (Math.hypot(x - handle.x, y - handle.y) < HANDLE_TOLERANCE) {
        return { hit: true, type: 'point', index: handle.index }
      }
    }
    return isPointInRectangle({ x, y }, {
      x1: range.x1,
      y1: range.y1,
      x2: range.x2,
      y2: range.y2,
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

  paneViews(): SignedRangePaneView[] {
    return this.views
  }

  private coordinate(point: LogicalPoint): ViewPoint {
    return {
      x: coordinateForLogical(this.chartApi.timeScale(), point.logical),
      y: this.seriesApi.priceToCoordinate(point.price),
    }
  }

  private createLabels(): readonly string[] {
    const change = this.change()
    const percentage = this.first.price === 0
      ? 0
      : change / this.first.price * 100
    const priceText = this.seriesApi.priceFormatter().format(change)
    const signedPrice = change > 0 ? `+${priceText}` : priceText
    const signedPercentage = percentage > 0
      ? `+${percentage.toFixed(2)}`
      : percentage.toFixed(2)
    const primary = `${signedPrice} (${signedPercentage}%)`
    if (this.rangeMode === 'price') {
      return [primary]
    }
    const bars = Math.abs(this.second.logical - this.first.logical)
      .toLocaleString('pt-BR', { maximumFractionDigits: 2 })
    return [primary, `${bars} barras`]
  }

  private invalidateValues(): void {
    this.labelLines = null
    this.updateAllViews()
  }

  private writePoint(target: LogicalPoint, source: LogicalPoint): void {
    target.logical = source.logical
    target.price = source.price
  }

  private updateEdge(index: number, point: LogicalPoint): void {
    if (index === 4 || index === 5) {
      const top = this.first.price >= this.second.price
        ? this.first
        : this.second
      const bottom = top === this.first ? this.second : this.first
      const target = index === 4 ? top : bottom
      target.price = point.price
      return
    }
    if (index === 6 || index === 7) {
      const left = this.first.logical <= this.second.logical
        ? this.first
        : this.second
      const right = left === this.first ? this.second : this.first
      const target = index === 6 ? left : right
      target.logical = point.logical
    }
  }
}
