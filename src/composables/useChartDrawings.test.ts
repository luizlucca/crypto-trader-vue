import { describe, expect, it, vi } from 'vitest'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { ChartDrawing } from '@/domain/chartDrawings'
import {
  CATALOG_DRAWING_TOOL_IDS,
  DRAWING_ANCHORS,
  defaultDrawingLevels,
  defaultDrawingText,
  drawingStyleCapabilities,
} from '@/domain/chartDrawings'
import { styleFor, useChartDrawings } from './useChartDrawings'

/**
 * Enough chart for the manager to build primitives against. The vendored tools
 * only read the two scales while constructing, so nothing here needs to draw.
 */
function chartStub() {
  const chart = {
    timeScale: () => ({
      logicalToCoordinate: (logical: number) => logical * 10,
      coordinateToLogical: (x: number) => x / 10,
    }),
    addPane: vi.fn(),
    applyOptions: vi.fn(),
  } as unknown as IChartApi
  const series = {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    priceToCoordinate: (price: number) => price,
    coordinateToPrice: (y: number) => y,
    getPane: () => ({ getHTMLElement: () => null }),
  } as unknown as ISeriesApi<SeriesType>
  return { chart, series }
}

/** A manager over a stub chart, plus the two things every case looks at. */
function drawingsOver(bars: () => readonly { time: number }[]) {
  const { chart, series } = chartStub()
  const gravado = vi.fn()
  const drawings = useChartDrawings({
    chart: () => chart,
    series: () => series,
    bars,
    onChange: gravado,
  })
  return { drawings, series, gravado }
}

const trendLine: ChartDrawing = {
  id: 'd1',
  tool: 'trend-line',
  anchors: [
    { time: 1_700_000_000, price: 100 },
    { time: 1_700_003_600, price: 110 },
  ],
  color: '#2962FF',
  lineWidth: 2,
}

const bars = [
  { time: 1_700_000_000 },
  { time: 1_700_003_600 },
  { time: 1_700_007_200 },
]

describe('desenhos que ainda não podem ser colocados', () => {
  it('não sabe onde pôr o desenho enquanto não há barras', () => {
    const { drawings, series } = drawingsOver(() => [])

    drawings.restore([trendLine])

    // Ele conta, porque é um desenho do operador — só não tem contra o que se
    // posicionar. Some da tela, não da existência.
    expect(drawings.count()).toBe(1)
    expect(series.attachPrimitive).not.toHaveBeenCalled()
  })

  it('não apaga do armazenamento o que não conseguiu colocar', () => {
    // Era a perda de verdade: `persist` gravava só o que estava montado, então
    // o próximo desenho feito pelo operador apagava do localStorage todos os
    // que a falta de barras impediu de montar.
    const { drawings, gravado } = drawingsOver(() => [])

    drawings.restore([trendLine])

    // É exatamente esta lista que `persist` grava.
    expect(drawings.drawings()).toEqual([trendLine])

    // E limpar apaga tudo, inclusive o que nunca chegou à tela.
    drawings.clear()
    expect(gravado).toHaveBeenCalledWith([])
    expect(drawings.drawings()).toEqual([])
  })

  it('coloca na tela quando as barras finalmente chegam', () => {
    let barras: { time: number }[] = []
    const { drawings, series } = drawingsOver(() => barras)

    drawings.restore([trendLine])
    expect(series.attachPrimitive).not.toHaveBeenCalled()

    barras = bars
    drawings.rebuild()

    expect(series.attachPrimitive).toHaveBeenCalled()
    expect(drawings.count()).toBe(1)
    expect(drawings.drawings()).toEqual([trendLine])
  })
})

describe('controles globais dos desenhos', () => {
  it('desbloqueia a edição quando todos os desenhos são apagados', () => {
    const { drawings } = drawingsOver(() => bars)

    drawings.toggleLock()
    expect(drawings.locked.value).toBe(true)

    drawings.clear()
    expect(drawings.locked.value).toBe(false)
  })

  it('monta as novas ferramentas vindas do plugin', () => {
    const { drawings, series } = drawingsOver(() => bars)
    const tools: ChartDrawing[] = [
      {
        ...trendLine,
        id: 'cross',
        tool: 'cross-line',
        anchors: [trendLine.anchors[0]],
      },
      {
        ...trendLine,
        id: 'combined-range',
        tool: 'date-price-range',
      },
    ]

    drawings.restore(tools)

    expect(series.attachPrimitive).toHaveBeenCalledTimes(3)
    expect(drawings.drawings()).toEqual(tools)
  })

  it(
    'constrói as 51 ferramentas adicionais sem uma dependência externa',
    () => {
      const { drawings, series } = drawingsOver(() => bars)
      const tools: ChartDrawing[] = CATALOG_DRAWING_TOOL_IDS.map((tool) => ({
        ...trendLine,
        id: tool,
        tool,
        anchors: Array.from(
          { length: DRAWING_ANCHORS[tool] },
          (_, index) => ({
            time: bars[0].time + index * 3600,
            price: 100 + index * 10,
          }),
        ),
      }))

      drawings.restore(tools)

      // One invisible RepaintPump plus one primitive for every drawing.
      expect(series.attachPrimitive).toHaveBeenCalledTimes(tools.length + 1)
      expect(drawings.drawings()).toEqual(tools)
    },
  )

  it('traduz o estilo visual de todo o catálogo para a primitive local', () => {
    for (const tool of CATALOG_DRAWING_TOOL_IDS) {
      const style = styleFor({ ...trendLine, tool })
      expect(style).toMatchObject({
        lineColor: trendLine.color,
        width: trendLine.lineWidth,
        lineStyle: 0,
      })
      const capabilities = drawingStyleCapabilities(tool)
      if (capabilities.levels) {
        expect(style.levels).toEqual(defaultDrawingLevels(tool))
      }
      if (capabilities.text) {
        expect(style.text).toBe(defaultDrawingText(tool))
      }
    }
  })

  it('traduz configurações avançadas para as primitives', () => {
    const levels = [
      { value: 0, color: '#111111' },
      { value: 0.75, color: '#222222' },
    ]

    expect(styleFor({
      ...trendLine,
      tool: 'fib-channel',
      configuration: { levels },
    }).levels).toEqual(levels)
    expect(styleFor({
      ...trendLine,
      tool: 'measure',
      configuration: {
        positiveColor: '#0000FF',
        negativeColor: '#FF0000',
      },
    })).toMatchObject({
      borderWidth: 2,
      positiveColor: '#0000FF',
      negativeColor: '#FF0000',
    })
    expect(styleFor({
      ...trendLine,
      tool: 'text-annotation',
      configuration: {
        text: 'Rompimento',
        textAppearance: {
          fontFamily: 'mono',
          fontSize: 22,
          fontWeight: 700,
          fontStyle: 'italic',
          color: '#00FF00',
        },
      },
    })).toMatchObject({
      text: 'Rompimento',
      textAppearance: {
        fontFamily: 'mono',
        fontSize: 22,
        fontWeight: 700,
        fontStyle: 'italic',
        color: '#00FF00',
      },
    })
  })

  it('seleciona o texto pelo corpo visível, além da âncora', () => {
    const { drawings, gravado } = drawingsOver(() => bars)
    const annotation: ChartDrawing = {
      ...trendLine,
      id: 'annotation',
      tool: 'text-annotation',
      anchors: [trendLine.anchors[0]],
      configuration: { text: 'Texto suficientemente longo' },
    }
    drawings.restore([annotation])

    // A âncora está em x=0. Este ponto cai sobre o texto, mas longe demais
    // para o hit test circular da primitive importada.
    expect(drawings.selectTextAt(80, 100)?.id).toBe('annotation')

    drawings.configureSelected({ text: 'Texto editado diretamente' })
    expect(gravado).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: 'annotation',
        configuration: { text: 'Texto editado diretamente' },
      }),
    ])
  })
})
