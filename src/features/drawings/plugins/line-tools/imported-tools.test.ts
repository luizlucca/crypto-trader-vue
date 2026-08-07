import { describe, expect, it, vi } from 'vitest'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { CrossLine } from './cross-line'
import { coordinateForLogical } from './base-types'
import { DatePriceRange } from './date-price-range'
import { LongPosition } from './long-position'
import { ShortPosition } from './short-position'
import { TrendLine } from './trend-line'

function chartStub() {
  const applyOptions = vi.fn()
  const chart = {
    timeScale: () => ({
      logicalToCoordinate: (logical: number) => logical * 10,
      applyOptions,
    }),
  } as unknown as IChartApi
  const series = {
    priceToCoordinate: (price: number) => price,
    priceFormatter: () => ({ format: (price: number) => price.toFixed(2) }),
  } as unknown as ISeriesApi<SeriesType>
  return { chart, series, applyOptions }
}

function renderingTargetStub(
  values: Record<PropertyKey, unknown> = {},
): CanvasRenderingTarget2D {
  const context = new Proxy(values, {
    get(target, property) {
      if (property === 'measureText') {
        return (text: string) => ({ width: text.length * 7 })
      }
      return property in target ? target[property] : vi.fn()
    },
    set(target, property, value) {
      target[property] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    useMediaCoordinateSpace: (callback) => callback({
      context,
      mediaSize: { width: 800, height: 500 } as never,
    }),
    useBitmapCoordinateSpace: (callback) => callback({
      context,
      horizontalPixelRatio: 2,
      verticalPixelRatio: 2,
      mediaSize: { width: 800, height: 500 } as never,
      bitmapSize: { width: 1600, height: 1000 } as never,
    }),
  } as CanvasRenderingTarget2D
}

describe('primitives incorporadas de line-tools', () => {
  it('interpola uma âncora entre candles sem enviá-la à API como índice fracionário', () => {
    const logicalToCoordinate = vi.fn((logical: number) => {
      if (logical === 8) {
        return 100
      }
      if (logical === 9) {
        return 148
      }
      // Simula o comportamento do Lightweight Charts 5.2 para frações.
      return 0
    })

    expect(coordinateForLogical({ logicalToCoordinate }, 8.25))
      .toBe(112)
    expect(logicalToCoordinate).toHaveBeenCalledWith(8)
    expect(logicalToCoordinate).toHaveBeenCalledWith(9)
    expect(logicalToCoordinate).not.toHaveBeenCalledWith(8.25)
  })

  it('reutiliza o renderer e prioriza a alça da linha cruzada', () => {
    const { chart, series } = chartStub()
    const drawing = new CrossLine(chart, series, {
      logical: 1,
      price: 100,
    })
    drawing.updateAllViews()
    const [view] = drawing.paneViews()
    const renderer = view.renderer()

    expect(drawing.toolHitTest(10, 100)).toEqual({
      hit: true,
      type: 'point',
      index: 0,
    })
    expect(view.renderer()).toBe(renderer)
    expect(() => renderer.draw(renderingTargetStub())).not.toThrow()
  })

  it('reutiliza o renderer e invalida o rótulo da faixa ao mover', () => {
    const { chart, series } = chartStub()
    const drawing = new DatePriceRange(
      chart,
      series,
      { logical: 1, price: 100 },
      { logical: 3, price: 110 },
    )
    drawing.updateAllViews()
    const [view] = drawing.paneViews()
    const renderer = view.renderer()
    const initialLabels = drawing.labels()

    drawing.updatePoints(
      { logical: 2, price: 120 },
      { logical: 6, price: 90 },
    )

    expect(view.renderer()).toBe(renderer)
    expect(drawing.labels()).not.toBe(initialLabels)
    expect(drawing.toolHitTest(20, 120)?.type).toBe('point')
    expect(() => renderer.draw(renderingTargetStub())).not.toThrow()
  })

  it('calcula ganho e perda percentuais para posições long e short', () => {
    const { chart, series } = chartStub()
    const long = new LongPosition(
      chart,
      series,
      { logical: 1, price: 100 },
      { logical: 3, price: 90 },
      { logical: 4, price: 120 },
    )
    const short = new ShortPosition(
      chart,
      series,
      { logical: 1, price: 100 },
      { logical: 3, price: 110 },
      { logical: 4, price: 80 },
    )

    expect(long.metrics()).toEqual({
      profit: 20,
      profitPercentage: 20,
      loss: -10,
      lossPercentage: -10,
    })
    expect(short.metrics()).toEqual({
      profit: 20,
      profitPercentage: 20,
      loss: -10,
      lossPercentage: -10,
    })
    expect(long.labels().profit).toContain('+20.00%')
    expect(short.labels().loss).toContain('-10.00%')

    long.updateAllViews()
    expect(() => long.paneViews()[0].renderer().draw(renderingTargetStub()))
      .not.toThrow()
  })

  it('escala espessura e tracejado no bitmap HiDPI', () => {
    const { chart, series } = chartStub()
    const setLineDash = vi.fn()
    const canvasState: Record<PropertyKey, unknown> = { setLineDash }
    const line = new TrendLine(
      chart,
      series,
      { logical: 1, price: 100 },
      { logical: 3, price: 80 },
      { width: 2, lineStyle: 2 },
    )
    line.updateAllViews()

    line.paneViews()[0].renderer().draw(renderingTargetStub(canvasState))

    expect(canvasState.lineWidth).toBe(4)
    expect(setLineDash).toHaveBeenCalledWith([12, 12])
  })
})
