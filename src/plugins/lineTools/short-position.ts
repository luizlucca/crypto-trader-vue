import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { LogicalPoint } from './base-types'
import {
  PositionDrawing,
  type PositionDrawingOptions,
} from './position-drawing'

export type ShortPositionOptions = PositionDrawingOptions

export class ShortPosition extends PositionDrawing {
  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    entry: LogicalPoint,
    stop: LogicalPoint,
    target: LogicalPoint,
    options: Partial<ShortPositionOptions> = {},
  ) {
    super(chart, series, 'short', entry, stop, target, options)
  }
}
