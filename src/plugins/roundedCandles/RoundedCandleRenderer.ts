import type {
  BitmapCoordinatesRenderingScope,
  CanvasRenderingTarget2D,
} from 'fancy-canvas'
import type {
  ICustomSeriesPaneRenderer,
  PaneRendererCustomData,
  PriceToCoordinateConverter,
  Time,
} from 'lightweight-charts'
import type { RoundedCandleData } from './data'
import type { RoundedCandleSeriesOptions } from './RoundedCandleSeries'
import {
  candlestickWidth,
  gridLineMediaWidth,
  positionsBox,
  positionsLine,
} from './dimensions'

/**
 * Adapted from TradingView's Apache-2.0 rounded-candles example.
 * The hot path intentionally iterates only over the visible range.
 */
export class RoundedCandleRenderer<
  TData extends RoundedCandleData = RoundedCandleData,
> implements ICustomSeriesPaneRenderer {
  private data: PaneRendererCustomData<Time, TData> | null = null
  private options: RoundedCandleSeriesOptions | null = null

  draw(
    target: CanvasRenderingTarget2D,
    priceToCoordinate: PriceToCoordinateConverter,
  ): void {
    target.useBitmapCoordinateSpace((scope) => {
      this.drawVisibleBars(scope, priceToCoordinate)
    })
  }

  update(
    data: PaneRendererCustomData<Time, TData>,
    options: RoundedCandleSeriesOptions,
  ): void {
    this.data = data
    this.options = options
  }

  destroy(): void {
    this.data = null
    this.options = null
  }

  private drawVisibleBars(
    scope: BitmapCoordinatesRenderingScope,
    priceToCoordinate: PriceToCoordinateConverter,
  ): void {
    const data = this.data
    const options = this.options
    const visibleRange = data?.visibleRange
    if (!data || !options || !visibleRange) {
      return
    }

    const {
      context,
      horizontalPixelRatio,
      verticalPixelRatio,
    } = scope
    const effectiveBarSpacing = data.barSpacing * data.conflationFactor
    const bodyWidth = candlestickWidth(effectiveBarSpacing, 1)
    const wickWidth = gridLineMediaWidth(horizontalPixelRatio)
    const radius = Math.max(
      0,
      options.radius(effectiveBarSpacing)
      * Math.min(horizontalPixelRatio, verticalPixelRatio),
    )

    for (let index = visibleRange.from; index < visibleRange.to; index += 1) {
      const bar = data.bars[index]
      if (!bar) {
        continue
      }

      const candle = bar.originalData
      const openY = priceToCoordinate(candle.open)
      const highY = priceToCoordinate(candle.high)
      const lowY = priceToCoordinate(candle.low)
      const closeY = priceToCoordinate(candle.close)
      if (
        openY === null
        || highY === null
        || lowY === null
        || closeY === null
      ) {
        continue
      }

      const isUp = candle.close >= candle.open
      if (options.wickVisible) {
        const wick = positionsLine(
          bar.x,
          horizontalPixelRatio,
          wickWidth,
        )
        const wickHeight = positionsBox(lowY, highY, verticalPixelRatio)
        context.fillStyle = candle.wickColor
          ?? (isUp ? options.wickUpColor : options.wickDownColor)
        context.fillRect(
          wick.position,
          wickHeight.position,
          wick.length,
          wickHeight.length,
        )
      }

      const body = positionsLine(
        bar.x,
        horizontalPixelRatio,
        bodyWidth,
      )
      const bodyHeight = positionsBox(
        Math.min(openY, closeY),
        Math.max(openY, closeY),
        verticalPixelRatio,
      )
      context.fillStyle = candle.color
        ?? (isUp ? options.upColor : options.downColor)
      context.beginPath()
      context.roundRect(
        body.position,
        bodyHeight.position,
        body.length,
        bodyHeight.length,
        radius,
      )
      context.fill()
    }
  }
}
