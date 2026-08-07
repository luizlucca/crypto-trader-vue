import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { LogicalPoint } from './base-types'
import {
  SignedRangeDrawing,
  type SignedRangeOptions,
} from './signed-range'

export type DatePriceRangeOptions = SignedRangeOptions

export class DatePriceRange extends SignedRangeDrawing {
  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    first: LogicalPoint,
    second: LogicalPoint,
    options: Partial<DatePriceRangeOptions> = {},
  ) {
    super(chart, series, 'date-price', first, second, options)
  }
}
