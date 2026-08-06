import {
  ColorType,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type ITextWatermarkPluginApi,
  type SeriesType,
  type TextWatermarkLineOptions,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { Candle } from '@shared/types/market'
import type { ThemePalette } from '@settings/services/themeCatalog'

/**
 * Everything about how the chart is painted, apart from what it paints.
 *
 * Split out of `MarketChart.vue` because it is a translation table and nothing
 * else: palette in, chart options out. It touches the chart on a theme change
 * and on nothing else — never on a tick, never on a pointer move — so it sits
 * outside the hot path even though the chart it writes to is the hot path's
 * own.
 */

export interface ChartThemeOptions {
  chart: () => IChartApi | null
  candleSeries: () => ISeriesApi<SeriesType> | null
  volumeSeries: () => ISeriesApi<SeriesType> | null
  watermark: () => ITextWatermarkPluginApi<Time> | undefined
  /** Live array, never a copy: the volume series is repainted from it. */
  candles: () => readonly Candle[]
  /** What the watermark spells out, resolved when it is written. */
  symbol: () => string
  interval: () => string
  /** The indicator palette is resolved against the surface it lands on. */
  onRetheme?: () => void
}

/** Volume bars take their colour from the candle's own direction. */
export function volumePoint(
  candle: Candle,
  palette: ThemePalette,
): HistogramData<UTCTimestamp> {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open
      ? palette.volumeUp
      : palette.volumeDown,
  }
}

export function useChartTheme(options: ChartThemeOptions) {
  function watermarkLines(palette: ThemePalette): TextWatermarkLineOptions[] {
    return [
      {
        text: options.symbol(),
        color: palette.watermarkPrimary,
        fontSize: 46,
        lineHeight: 54,
        fontFamily: '"Inter Variable", Inter, sans-serif',
        fontStyle: '700',
      },
      {
        text: options.interval().toUpperCase(),
        color: palette.watermarkSecondary,
        fontSize: 22,
        lineHeight: 30,
        fontFamily: '"JetBrains Mono Variable", monospace',
        fontStyle: '600',
      },
    ]
  }

  function apply(palette: ThemePalette): void {
    options.chart()?.applyOptions({
      layout: {
        background: {
          type: ColorType.Solid,
          color: palette.chartBackground,
        },
        textColor: palette.chartText,
      },
      grid: {
        vertLines: { color: palette.chartGrid },
        horzLines: { color: palette.chartGrid },
      },
      crosshair: {
        vertLine: {
          color: palette.chartCrosshair,
          labelBackgroundColor: palette.chartCrosshairLabel,
        },
        horzLine: {
          color: palette.chartCrosshair,
          labelBackgroundColor: palette.chartCrosshairLabel,
        },
      },
      rightPriceScale: { borderColor: palette.chartBorder },
      timeScale: { borderColor: palette.chartBorder },
    })
    options.candleSeries()?.applyOptions({
      color: palette.candleUp,
      upColor: palette.candleUp,
      downColor: palette.candleDown,
      wickUpColor: palette.candleUp,
      wickDownColor: palette.candleDown,
      priceLineColor: palette.positive,
    })
    options.watermark()?.applyOptions({ lines: watermarkLines(palette) })

    const volume = options.volumeSeries()
    const candles = options.candles()
    if (volume && candles.length > 0) {
      /*
       * Repainting the volume replaces its data, and `setData` resets the
       * visible range. Restoring it keeps the operator looking at the same
       * candles across a theme change.
       */
      const visibleRange = options.chart()?.timeScale().getVisibleLogicalRange()
      volume.setData(candles.map((candle) => volumePoint(candle, palette)))
      if (visibleRange) {
        options.chart()?.timeScale().setVisibleLogicalRange(visibleRange)
      }
    }

    // The catalog's own colours are resolved against the surface they land on,
    // so a new theme can turn a readable line into an invisible one.
    options.onRetheme?.()
  }

  return { apply, watermarkLines }
}
