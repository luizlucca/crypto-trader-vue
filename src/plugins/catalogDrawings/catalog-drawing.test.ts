import { describe, expect, it, vi } from 'vitest'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import {
  CATALOG_DRAWING_TOOL_IDS,
  DRAWING_ANCHORS,
} from '@/domain/chartDrawings'
import { CatalogDrawing } from './catalog-drawing'
import { DEFAULT_TEXT_APPEARANCE } from '@/domain/textAppearance'

function chartStub() {
  const chart = {
    timeScale: () => ({
      logicalToCoordinate: (logical: number) => logical * 10,
    }),
  } as unknown as IChartApi
  const series = {
    attachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => price,
  } as unknown as ISeriesApi<SeriesType>
  return { chart, series }
}

function renderingTargetStub(): CanvasRenderingTarget2D {
  const values: Record<PropertyKey, unknown> = {}
  const context = new Proxy(values, {
    get(target, property) {
      if (property === 'measureText') {
        return (text: string) => ({ width: text.length * 7 })
      }
      if (property in target) {
        return target[property]
      }
      return vi.fn()
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
  } as CanvasRenderingTarget2D
}

describe('primitive do catálogo de desenhos', () => {
  it('prioriza uma âncora no hit test', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'ray', [
      { logical: 1, price: 100 },
      { logical: 3, price: 80 },
    ])

    expect(drawing.toolHitTest(10, 100)).toEqual({
      hit: true,
      type: 'point',
      index: 0,
    })
  })

  it('atualiza todos os pontos no mesmo objeto de primitive', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'curve', [
      { logical: 1, price: 100 },
      { logical: 2, price: 90 },
      { logical: 3, price: 110 },
      { logical: 4, price: 80 },
    ])
    const original = drawing
    const pointBuffer = drawing.logicalPoints()

    drawing.updatePoints(
      { logical: 5, price: 120 },
      { logical: 6, price: 100 },
      { logical: 7, price: 130 },
      { logical: 8, price: 90 },
    )

    expect(drawing).toBe(original)
    expect(drawing.logicalPoints()).toBe(pointBuffer)
    expect(drawing.logicalPoints()).toEqual([
      { logical: 5, price: 120 },
      { logical: 6, price: 100 },
      { logical: 7, price: 130 },
      { logical: 8, price: 90 },
    ])
  })

  it('aplica estilo sem tocar no Vue ou reanexar a primitive', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'text-annotation', [
      { logical: 1, price: 100 },
    ])
    const attach = vi.spyOn(series, 'attachPrimitive')

    drawing.applyOptions({ lineColor: '#EF5350', width: 4, lineStyle: 2 })

    expect(drawing.options()).toEqual({
      lineColor: '#EF5350',
      width: 4,
      lineStyle: 2,
      levels: [],
      text: '',
      textAppearance: DEFAULT_TEXT_APPEARANCE,
    })
    expect(attach).not.toHaveBeenCalled()
  })

  it('testa todos os segmentos de uma polilinha', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'polyline', [
      { logical: 1, price: 100 },
      { logical: 3, price: 80 },
      { logical: 5, price: 120 },
      { logical: 7, price: 90 },
    ])

    expect(drawing.logicalPoints()).toHaveLength(4)
    expect(drawing.toolHitTest(40, 100)).toEqual({
      hit: true,
      type: 'shape',
    })
  })

  it('reutiliza view e renderer entre repaints do gráfico', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'ray', [
      { logical: 1, price: 100 },
      { logical: 3, price: 80 },
    ])
    const [view] = drawing.paneViews()
    const renderer = view.renderer()

    drawing.updatePoints(
      { logical: 2, price: 110 },
      { logical: 4, price: 90 },
    )

    expect(drawing.paneViews()[0]).toBe(view)
    expect(view.renderer()).toBe(renderer)
  })

  it('possui um caminho de pintura válido para as 51 ferramentas', () => {
    const { chart, series } = chartStub()
    const target = renderingTargetStub()

    for (const tool of CATALOG_DRAWING_TOOL_IDS) {
      const points = Array.from(
        { length: DRAWING_ANCHORS[tool] },
        (_, index) => ({
          logical: index + 1,
          price: 100 + (index % 2 === 0 ? index * 10 : -index * 10),
        }),
      )
      const drawing = new CatalogDrawing(chart, series, tool, points)
      drawing.updateAllViews()

      const render = () => drawing.paneViews()[0].renderer()?.draw(target)
      expect(render).not.toThrow()
    }
  })
})
