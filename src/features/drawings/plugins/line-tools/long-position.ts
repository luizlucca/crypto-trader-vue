import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { LogicalPoint } from './base-types'
import {
  PositionDrawing,
  type PositionDrawingOptions,
} from './position-drawing'

export type LongPositionOptions = PositionDrawingOptions

export class LongPosition extends PositionDrawing {
  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    entry: LogicalPoint,
    stop: LogicalPoint,
    target: LogicalPoint,
    options: Partial<LongPositionOptions> = {},
  ) {
    super(chart, series, 'long', entry, stop, target, options)
  }
}
