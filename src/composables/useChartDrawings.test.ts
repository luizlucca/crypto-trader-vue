import { describe, expect, it, vi } from 'vitest'
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import type { ChartDrawing } from '@/domain/chartDrawings'
import { useChartDrawings } from './useChartDrawings'

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
