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
import {
  drawAnchor,
  scaleCoordinate,
  setLineStyle,
} from './base-types'

const LINE_HIT_TOLERANCE = 5
const ANCHOR_HIT_TOLERANCE = 8

class CrossLinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly source: CrossLine,
    private readonly point: ViewPoint,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { x, y } = this.point
    if (x === null || y === null) {
      return
    }
    target.useBitmapCoordinateSpace((scope) => {
      const context = scope.context
      const options = this.source.options()
      const scaledX = scaleCoordinate(x, scope.horizontalPixelRatio)
      const scaledY = scaleCoordinate(y, scope.verticalPixelRatio)
      const width = scope.mediaSize.width * scope.horizontalPixelRatio
      const height = scope.mediaSize.height * scope.verticalPixelRatio

      context.save()
      context.lineWidth = options.width * scope.verticalPixelRatio
      context.strokeStyle = options.lineColor
      setLineStyle(context, options.lineStyle)

      context.beginPath()
      context.moveTo(0, scaledY)
      context.lineTo(width, scaledY)
      context.moveTo(scaledX, 0)
      context.lineTo(scaledX, height)
      context.stroke()

      if (this.source.selected()) {
        drawAnchor(scope, scaledX, scaledY)
      }
      context.restore()
    })
  }
}

class CrossLinePaneView implements IPrimitivePaneView {
  private readonly point: ViewPoint = { x: null, y: null }
  private readonly paneRenderer: CrossLinePaneRenderer

  constructor(private readonly source: CrossLine) {
    this.paneRenderer = new CrossLinePaneRenderer(source, this.point)
  }

  update(): void {
    const point = this.source.point()
    this.point.x = this.source.chart().timeScale().logicalToCoordinate(
      point.logical as Logical,
    )
    this.point.y = this.source.series().priceToCoordinate(point.price)
  }

  renderer(): CrossLinePaneRenderer {
    return this.paneRenderer
  }
}

export interface CrossLineOptions {
  lineColor: string
  width: number
  /** 0 solid, 1 dotted, 2 dashed. */
  lineStyle: number
}

const DEFAULT_OPTIONS: CrossLineOptions = {
  lineColor: '#2962FF',
  width: 2,
  lineStyle: 0,
}

export class CrossLine implements ISeriesPrimitive<Time> {
  private readonly paneView: CrossLinePaneView
  private readonly views: CrossLinePaneView[]
  private readonly drawingOptions: CrossLineOptions
  private logicalPoint: LogicalPoint
  private isSelected = false

  constructor(
    private readonly chartApi: IChartApi,
    private readonly seriesApi: ISeriesApi<SeriesType>,
    point: LogicalPoint,
    options: Partial<CrossLineOptions> = {},
  ) {
    this.logicalPoint = { ...point }
    this.drawingOptions = { ...DEFAULT_OPTIONS, ...options }
    this.paneView = new CrossLinePaneView(this)
    this.views = [this.paneView]
  }

  chart(): IChartApi {
    return this.chartApi
  }

  series(): ISeriesApi<keyof SeriesOptionsMap> {
    return this.seriesApi
  }

  point(): Readonly<LogicalPoint> {
    return this.logicalPoint
  }

  options(): Readonly<CrossLineOptions> {
    return this.drawingOptions
  }

  selected(): boolean {
    return this.isSelected
  }

  updatePoint(point: LogicalPoint): void {
    this.logicalPoint.logical = point.logical
    this.logicalPoint.price = point.price
    this.updateAllViews()
  }

  applyOptions(options: Partial<CrossLineOptions>): void {
    Object.assign(this.drawingOptions, options)
    this.updateAllViews()
    this.chartApi.timeScale().applyOptions({})
  }

  setSelected(selected: boolean): void {
    this.isSelected = selected
    this.updateAllViews()
  }

  toolHitTest(x: number, y: number): HitTestResult | null {
    const xCoordinate = this.chartApi.timeScale().logicalToCoordinate(
      this.logicalPoint.logical as Logical,
    )
    const yCoordinate = this.seriesApi.priceToCoordinate(
      this.logicalPoint.price,
    )
    if (xCoordinate === null || yCoordinate === null) {
      return null
    }
    if (
      Math.hypot(x - xCoordinate, y - yCoordinate)
      < ANCHOR_HIT_TOLERANCE
    ) {
      return { hit: true, type: 'point', index: 0 }
    }
    if (
      Math.abs(y - yCoordinate) < LINE_HIT_TOLERANCE
      || Math.abs(x - xCoordinate) < LINE_HIT_TOLERANCE
    ) {
      return { hit: true, type: 'line' }
    }
    return null
  }

  autoscaleInfo(): AutoscaleInfo | null {
    return null
  }

  updateAllViews(): void {
    this.paneView.update()
  }

  paneViews(): CrossLinePaneView[] {
    return this.views
  }
}
