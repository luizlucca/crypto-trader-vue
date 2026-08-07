import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { LogicalPoint } from './base-types'
import {
  SignedRangeDrawing,
  type SignedRangeOptions,
} from './signed-range'

export type MeasureOptions = SignedRangeOptions

export class Measure extends SignedRangeDrawing {
  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    first: LogicalPoint,
    second: LogicalPoint,
    options: Partial<MeasureOptions> = {},
  ) {
    super(chart, series, 'measure', first, second, options)
  }
}
