import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesType,
  Time,
} from 'lightweight-charts'
import type {
  CatalogDrawingToolId,
  DrawingLevel,
  DrawingLineStyle,
} from '@drawings/domain/chartDrawings'
import type { TextAppearance } from '@renderer-shared/domain/textAppearance'
import {
  DEFAULT_TEXT_APPEARANCE,
  DEFAULT_TEXT_BACKGROUND_COLOR,
  copyTextAppearance,
} from '@renderer-shared/domain/textAppearance'
import {
  coordinateForLogical,
  type HitTestResult,
  type LogicalPoint,
} from '@drawings/plugins/line-tools/base-types'
import {
  colorWithAlpha,
  drawHandles,
  drawTool,
  hitsDrawing,
} from './catalog-renderer'
import type { ViewPoint } from './catalog-renderer'

export interface CatalogDrawingOptions {
  lineColor: string
  width: number
  lineStyle: DrawingLineStyle
  levels: readonly DrawingLevel[]
  text: string
  textAppearance: TextAppearance
  textBackgroundColor: string
}

const DEFAULT_OPTIONS: CatalogDrawingOptions = {
  lineColor: '#2962FF',
  width: 2,
  lineStyle: 0,
  levels: [],
  text: '',
  textAppearance: copyTextAppearance(DEFAULT_TEXT_APPEARANCE),
  textBackgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
}

const LINE_DASH: Record<DrawingLineStyle, number[]> = {
  0: [],
  1: [2, 3],
  2: [8, 5],
}

/**
 * One local primitive contract for the extra catalog tools.
 *
 * It intentionally receives logical points, not timestamps. The app remains
 * the owner of time interpolation, so drawings survive period changes and
 * historical prepends exactly like the original line-tools primitives.
 * Geometry is painted by Lightweight Charts' canvas pass and never enters a
 * Vue ref or component render.
 */
export class CatalogDrawing implements ISeriesPrimitive<Time> {
  readonly _chart: IChartApi
  readonly _series: ISeriesApi<SeriesType>

  private _points: LogicalPoint[]
  private _options: CatalogDrawingOptions
  private _selected = false
  private readonly _paneView: CatalogDrawingPaneView
  private readonly _paneViews: IPrimitivePaneView[]

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    readonly tool: CatalogDrawingToolId,
    points: readonly LogicalPoint[],
    options: Partial<CatalogDrawingOptions> = {},
  ) {
    this._chart = chart
    this._series = series
    this._points = points.map(copyPoint)
    this._options = copyOptions({ ...DEFAULT_OPTIONS, ...options })
    this._paneView = new CatalogDrawingPaneView(this)
    this._paneViews = [this._paneView]
  }

  logicalPoints(): readonly LogicalPoint[] {
    return this._points
  }

  options(): Readonly<CatalogDrawingOptions> {
    return this._options
  }

  selected(): boolean {
    return this._selected
  }

  updatePoints(...points: LogicalPoint[]): void {
    this._points.length = points.length
    for (let index = 0; index < points.length; index += 1) {
      const source = points[index]
      const point = this._points[index]
      if (point) {
        point.logical = source.logical
        point.price = source.price
      } else {
        this._points[index] = copyPoint(source)
      }
    }
    this.updateAllViews()
  }

  setSelected(selected: boolean): void {
    this._selected = selected
    this.updateAllViews()
  }

  applyOptions(options: Partial<CatalogDrawingOptions>): void {
    this._options = copyOptions({ ...this._options, ...options })
    this.updateAllViews()
  }

  toolHitTest(x: number, y: number): HitTestResult | null {
    const points = this.viewPoints()
    if (!points) {
      return null
    }
    for (let index = 0; index < points.length; index += 1) {
      if (Math.hypot(x - points[index].x, y - points[index].y) <= 8) {
        return { hit: true, type: 'point', index }
      }
    }
    return hitsDrawing(this.tool, { x, y }, points, this._options.levels)
      ? { hit: true, type: points.length === 1 ? 'point' : 'shape' }
      : null
  }

  autoscaleInfo(): null {
    return null
  }

  updateAllViews(): void {
    this._paneView.update()
  }

  paneViews(): IPrimitivePaneView[] {
    return this._paneViews
  }

  viewPoints(): ViewPoint[] | null {
    const points: ViewPoint[] = []
    return this.writeViewPoints(points) ? points : null
  }

  /** Writes into a caller-owned buffer so chart repaints allocate nothing. */
  writeViewPoints(points: ViewPoint[]): boolean {
    const scale = this._chart.timeScale()
    points.length = this._points.length
    for (let index = 0; index < this._points.length; index += 1) {
      const source = this._points[index]
      const x = coordinateForLogical(scale, source.logical)
      const y = this._series.priceToCoordinate(source.price)
      if (x === null || y === null) {
        points.length = 0
        return false
      }
      const point = points[index]
      if (point) {
        point.x = x
        point.y = y
      } else {
        points[index] = { x, y }
      }
    }
    return true
  }
}

class CatalogDrawingPaneView implements IPrimitivePaneView {
  private readonly _points: ViewPoint[] = []
  private readonly _renderer: CatalogDrawingRenderer

  constructor(private readonly source: CatalogDrawing) {
    this._renderer = new CatalogDrawingRenderer(source, this._points)
  }

  update(): void {
    this._renderer.setVisible(this.source.writeViewPoints(this._points))
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer
  }
}

class CatalogDrawingRenderer implements IPrimitivePaneRenderer {
  private visible = false

  constructor(
    private readonly source: CatalogDrawing,
    private readonly points: readonly ViewPoint[],
  ) {}

  setVisible(visible: boolean): void {
    this.visible = visible
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.visible) {
      return
    }
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const options = this.source.options()
      context.save()
      context.strokeStyle = options.lineColor
      context.fillStyle = colorWithAlpha(
        options.lineColor,
        0.12,
      )
      context.lineWidth = options.width
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.setLineDash(LINE_DASH[options.lineStyle])
      drawTool(
        context,
        mediaSize,
        this.source.tool,
        this.points,
        this.source.logicalPoints(),
        options,
      )
      if (this.source.selected()) {
        drawHandles(context, this.points, options.lineColor)
      }
      context.restore()
    })
  }
}

function copyPoint(point: LogicalPoint): LogicalPoint {
  return { logical: point.logical, price: point.price }
}

function copyOptions(options: CatalogDrawingOptions): CatalogDrawingOptions {
  return {
    ...options,
    levels: options.levels.map((level) => ({ ...level })),
    textAppearance: copyTextAppearance(options.textAppearance),
  }
}
