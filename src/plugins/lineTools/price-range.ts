import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { LogicalPoint } from './base-types'
import {
  SignedRangeDrawing,
  type SignedRangeOptions,
} from './signed-range'

export type PriceRangeOptions = SignedRangeOptions

export class PriceRange extends SignedRangeDrawing {
  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType>,
    first: LogicalPoint,
    second: LogicalPoint,
    options: Partial<PriceRangeOptions> = {},
  ) {
    super(chart, series, 'price', first, second, options)
  }
}
