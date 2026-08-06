import {
  customSeriesDefaultOptions,
  type CustomSeriesOptions,
  type CustomSeriesPricePlotValues,
  type ICustomSeriesPaneView,
  type ISeriesApi,
  type PaneRendererCustomData,
  type SeriesPartialOptions,
  type Time,
  type WhitespaceData,
} from 'lightweight-charts'
import type { RoundedCandleData } from './data'
import { RoundedCandleRenderer } from './RoundedCandleRenderer'

export interface RoundedCandleSeriesOptions extends CustomSeriesOptions {
  upColor: string
  downColor: string
  wickVisible: boolean
  wickUpColor: string
  wickDownColor: string
  radius: (barSpacing: number) => number
}

const defaultOptions: RoundedCandleSeriesOptions = {
  ...customSeriesDefaultOptions,
  upColor: '#24c7ad',
  downColor: '#ef6671',
  wickVisible: true,
  wickUpColor: '#24c7ad',
  wickDownColor: '#ef6671',
  radius: (barSpacing) => barSpacing < 4
    ? 0
    : Math.min(4, barSpacing / 3),
}

export type RoundedCandleSeriesApi = ISeriesApi<
  'Custom',
  Time,
  RoundedCandleData | WhitespaceData<Time>,
  RoundedCandleSeriesOptions,
  SeriesPartialOptions<RoundedCandleSeriesOptions>
>

export class RoundedCandleSeries implements ICustomSeriesPaneView<
  Time,
  RoundedCandleData,
  RoundedCandleSeriesOptions
> {
  private readonly customRenderer = new RoundedCandleRenderer()

  priceValueBuilder(
    candle: RoundedCandleData,
  ): CustomSeriesPricePlotValues {
    return [candle.high, candle.low, candle.close]
  }

  renderer(): RoundedCandleRenderer {
    return this.customRenderer
  }

  isWhitespace(
    data: RoundedCandleData | WhitespaceData<Time>,
  ): data is WhitespaceData<Time> {
    return (data as Partial<RoundedCandleData>).close === undefined
  }

  update(
    data: PaneRendererCustomData<Time, RoundedCandleData>,
    options: RoundedCandleSeriesOptions,
  ): void {
    this.customRenderer.update(data, options)
  }

  defaultOptions(): RoundedCandleSeriesOptions {
    return defaultOptions
  }

  destroy(): void {
    this.customRenderer.destroy()
  }
}
