import { describe, expect, it, vi } from 'vitest'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type {
  CatalogDrawingToolId,
  DrawingLevel,
} from '@drawings/domain/chartDrawings'
import {
  CATALOG_DRAWING_TOOL_IDS,
  DRAWING_ANCHORS,
} from '@drawings/domain/chartDrawings'
import { CatalogDrawing } from './catalog-drawing'
import {
  DEFAULT_TEXT_APPEARANCE,
  DEFAULT_TEXT_BACKGROUND_COLOR,
} from '@renderer-shared/domain/textAppearance'

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

function renderingTargetStub(
  onAssignment?: (property: PropertyKey, value: unknown) => void,
): CanvasRenderingTarget2D {
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
      onAssignment?.(property, value)
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

function radiiRenderingTarget(radii: number[]): CanvasRenderingTarget2D {
  const values: Record<PropertyKey, unknown> = {
    arc: (...args: unknown[]) => radii.push(args[2] as number),
  }
  const context = new Proxy(values, {
    get(target, property) {
      if (property === 'measureText') {
        return (text: string) => ({ width: text.length * 7 })
      }
      return property in target ? target[property] : vi.fn()
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
      textBackgroundColor: DEFAULT_TEXT_BACKGROUND_COLOR,
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

  it('não seleciona o retângulo vazio ao redor de uma linha diagonal', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'arrow', [
      { logical: 1, price: 100 },
      { logical: 10, price: 10 },
    ])

    expect(drawing.toolHitTest(90, 90)).toBeNull()
    expect(drawing.toolHitTest(50, 60)?.type).toBe('shape')
  })

  it('mantém selecionável o interior realmente pintado de uma projeção', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'forecast', [
      { logical: 1, price: 100 },
      { logical: 10, price: 50 },
    ])

    expect(drawing.toolHitTest(90, 50)?.type).toBe('shape')
  })

  it('não seleciona o espaço vazio entre segmentos descontínuos', () => {
    const { chart, series } = chartStub()
    const drawing = new CatalogDrawing(chart, series, 'disjoint-channel', [
      { logical: 1, price: 100 },
      { logical: 3, price: 100 },
      { logical: 7, price: 50 },
      { logical: 9, price: 50 },
    ])

    expect(drawing.toolHitTest(50, 75)).toBeNull()
    expect(drawing.toolHitTest(20, 100)?.type).toBe('shape')
  })

  it('seleciona a geometria pintada das ferramentas compostas', () => {
    const { chart, series } = chartStub()
    const levels: DrawingLevel[] = [{ value: 0.5, color: '#2962FF' }]
    const cases: Array<{
      tool: CatalogDrawingToolId
      anchors: { logical: number, price: number }[]
      target: [number, number]
      levels?: DrawingLevel[]
    }> = [
      {
        tool: 'regression-trend' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 10, price: 10 }],
        target: [55, 55],
      },
      {
        tool: 'andrews-pitchfork' as const,
        anchors: [
          { logical: 1, price: 100 },
          { logical: 3, price: 70 },
          { logical: 3, price: 130 },
        ],
        target: [80, 100],
      },
      {
        tool: 'fib-channel' as const,
        anchors: [
          { logical: 1, price: 100 },
          { logical: 10, price: 100 },
          { logical: 1, price: 50 },
        ],
        target: [55, 75],
      },
      {
        tool: 'fib-time-zone' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 5, price: 100 }],
        target: [30, 220],
      },
      {
        tool: 'fib-speed-fan' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 10, price: 50 }],
        target: [55, 87.5],
      },
      {
        tool: 'fib-circles' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 2, price: 100 }],
        target: [30, 100],
        levels: [{ value: 2, color: '#2962FF' }],
      },
      {
        tool: 'fib-arcs' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 2, price: 100 }],
        target: [10, 80],
        levels: [{ value: 2, color: '#2962FF' }],
      },
      {
        tool: 'fib-wedge' as const,
        anchors: [
          { logical: 1, price: 100 },
          { logical: 3, price: 100 },
          { logical: 1, price: 120 },
        ],
        target: [17, 107],
      },
      {
        tool: 'pitchfan' as const,
        anchors: [
          { logical: 1, price: 100 },
          { logical: 10, price: 50 },
          { logical: 10, price: 150 },
        ],
        target: [55, 100],
      },
      {
        tool: 'gann-fan' as const,
        anchors: [{ logical: 1, price: 100 }, { logical: 10, price: 50 }],
        target: [55, 75],
      },
    ]

    for (const entry of cases) {
      const drawing = new CatalogDrawing(
        chart,
        series,
        entry.tool,
        entry.anchors,
        { levels: entry.levels ?? levels },
      )
      expect(drawing.toolHitTest(...entry.target), entry.tool).toMatchObject({
        hit: true,
        type: 'shape',
      })
    }
  })

  it('nunca passa raios Fibonacci negativos ou infinitos ao canvas', () => {
    const { chart, series } = chartStub()
    const radii: number[] = []
    const levels = [
      { value: -0.5, color: '#2962FF' },
      { value: Number.MAX_VALUE, color: '#EF5350' },
    ]
    const circles = new CatalogDrawing(chart, series, 'fib-circles', [
      { logical: 1, price: 100 },
      { logical: 5, price: 100 },
    ], { levels })
    const wedge = new CatalogDrawing(chart, series, 'fib-wedge', [
      { logical: 1, price: 100 },
      { logical: 5, price: 100 },
      { logical: 1, price: 120 },
    ], { levels })

    circles.updateAllViews()
    wedge.updateAllViews()
    circles.paneViews()[0].renderer()?.draw(radiiRenderingTarget(radii))
    wedge.paneViews()[0].renderer()?.draw(radiiRenderingTarget(radii))

    expect(radii).toHaveLength(2)
    expect(radii.every((radius) => (
      Number.isFinite(radius) && radius >= 0
    ))).toBe(true)
  })

  it('pinta borda, texto e fundo da anotação de forma independente', () => {
    const { chart, series } = chartStub()
    const assignments: [PropertyKey, unknown][] = []
    const drawing = new CatalogDrawing(
      chart,
      series,
      'text-annotation',
      [{ logical: 1, price: 100 }],
      {
        lineColor: '#112233',
        width: 4,
        lineStyle: 2,
        text: 'Rompimento',
        textAppearance: {
          ...DEFAULT_TEXT_APPEARANCE,
          color: '#AABBCC',
        },
        textBackgroundColor: '#445566',
      },
    )
    drawing.updateAllViews()

    drawing.paneViews()[0].renderer()?.draw(renderingTargetStub(
      (property, value) => assignments.push([property, value]),
    ))

    expect(assignments).toContainEqual(['strokeStyle', '#112233'])
    expect(assignments).toContainEqual(['lineWidth', 4])
    expect(assignments).toContainEqual(['fillStyle', '#445566'])
    expect(assignments).toContainEqual(['fillStyle', '#AABBCC'])
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
