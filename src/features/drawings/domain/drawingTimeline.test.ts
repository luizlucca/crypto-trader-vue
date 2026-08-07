import { describe, expect, it } from 'vitest'
import type { ChartDrawing } from './chartDrawings'
import { buildDrawingTimeline } from './drawingTimeline'

function drawing(...times: number[]): ChartDrawing {
  return {
    id: `drawing-${times.join('-')}`,
    tool: 'trend-line',
    anchors: times.map((time, index) => ({ time, price: 100 + index })),
    color: '#2962FF',
    lineWidth: 2,
    lineStyle: 0,
  }
}

describe('linha temporal dos desenhos', () => {
  it('adiciona suporte regular apenas para as âncoras externas', () => {
    const result = buildDrawingTimeline(
      [{ time: 100 }, { time: 200 }, { time: 300 }],
      [drawing(50, 150, 350), drawing(50, 250)],
      100,
    )

    expect(result.supportTimes).toEqual([0, 400])
    expect(result.points.map(({ time }) => time)).toEqual([
      0,
      100,
      200,
      300,
      400,
    ])
    expect(result.lastCandleIndex).toBe(3)
  })

  it('mantém a última vela como referência com projeção futura', () => {
    const result = buildDrawingTimeline(
      [{ time: 100 }, { time: 200 }, { time: 300 }],
      [drawing(600, 700)],
      100,
    )

    expect(result.lastCandleIndex).toBe(2)
    expect(result.points.slice(result.lastCandleIndex + 1)).toEqual([
      { time: 400 },
      { time: 500 },
      { time: 600 },
      { time: 700 },
    ])
  })

  it('limita a extensão sem comprimir uma âncora distante', () => {
    const result = buildDrawingTimeline(
      [{ time: 100 }, { time: 200 }, { time: 300 }],
      [drawing(-1_000, 2_000)],
      100,
      2,
    )

    expect(result.points.map(({ time }) => time)).toEqual([
      -100,
      0,
      100,
      200,
      300,
      400,
      500,
    ])
  })

  it('mantém desenhos navegáveis enquanto ainda não há candles', () => {
    const result = buildDrawingTimeline([], [drawing(100, 200)], 100)

    expect(result.points).toEqual([{ time: 100 }, { time: 200 }])
    expect(result.lastCandleIndex).toBe(-1)
  })
})
