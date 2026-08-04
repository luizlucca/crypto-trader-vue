import { describe, expect, it } from 'vitest'
import {
  anchorEditAt,
  logicalForTime,
  parseDrawing,
  timeForLogical,
} from './chartDrawings'

/** Bars every hour, the shape the chart actually holds. */
const bars = Array.from(
  { length: 10 },
  (_, index) => ({ time: 1_700_000_000 + index * 3600 }),
)
const times = bars.map((bar) => bar.time)

describe('posição de um instante entre as barras', () => {
  it('resolve uma barra exata como seu próprio índice', () => {
    expect(logicalForTime(bars, times[0])).toBe(0)
    expect(logicalForTime(bars, times[5])).toBe(5)
    expect(logicalForTime(bars, times[9])).toBe(9)
  })

  it('interpola um instante que não é barra — o caso da troca de período', () => {
    // Meia hora depois da barra 3: um horário de 1h não existe no gráfico de 4h,
    // e sem interpolação o desenho simplesmente sumiria.
    expect(logicalForTime(bars, times[3] + 1800)).toBeCloseTo(3.5, 10)
    expect(logicalForTime(bars, times[3] + 900)).toBeCloseTo(3.25, 10)
  })

  it('extrapola fora do intervalo carregado, nos dois sentidos', () => {
    expect(logicalForTime(bars, times[0] - 3600)).toBeCloseTo(-1, 10)
    expect(logicalForTime(bars, times[9] + 7200)).toBeCloseTo(11, 10)
  })

  it('não inventa posição sem barras para comparar', () => {
    expect(logicalForTime([], 1_700_000_000)).toBeNull()
    expect(logicalForTime([{ time: 1_700_000_000 }], 1_700_000_001)).toBeNull()
  })
})

describe('instante em uma posição do gráfico', () => {
  it('devolve a barra quando a posição é uma barra', () => {
    expect(timeForLogical(bars, 0)).toBe(times[0])
    expect(timeForLogical(bars, 5)).toBe(times[5])
    expect(timeForLogical(bars, 9)).toBe(times[9])
  })

  it('interpola entre duas barras', () => {
    expect(timeForLogical(bars, 3.5)).toBe(times[3] + 1800)
    expect(timeForLogical(bars, 3.25)).toBe(times[3] + 900)
  })

  it('extrapola à frente da última barra — clicar no futuro é normal', () => {
    // A margem vazia à direita é onde se estende uma linha de tendência.
    expect(timeForLogical(bars, 11)).toBe(times[9] + 7200)
    expect(timeForLogical(bars, 12.5)).toBe(times[9] + 12600)
    expect(timeForLogical(bars, -1)).toBe(times[0] - 3600)
  })

  it('desfaz o que logicalForTime fez, em qualquer ponto', () => {
    for (const time of [times[0], times[4] + 900, times[9] + 5400]) {
      const logical = logicalForTime(bars, time)
      expect(logical).not.toBeNull()
      expect(timeForLogical(bars, logical as number)).toBe(time)
    }
  })

  it('não inventa instante sem barras', () => {
    expect(timeForLogical([], 3)).toBeNull()
  })
})

describe('alça agarrada', () => {
  /** Um retângulo: duas âncoras, quatro cantos na tela. */
  const retangulo = [{ x: 100, y: 40 }, { x: 300, y: 180 }]

  it('num vértice, os dois eixos são da mesma âncora', () => {
    expect(anchorEditAt(retangulo, 100, 40)).toEqual({ time: 0, price: 0 })
    expect(anchorEditAt(retangulo, 300, 180)).toEqual({ time: 1, price: 1 })
  })

  it('num canto derivado, cada eixo é de uma âncora', () => {
    // Canto superior direito: o instante de p2 com o preço de p1.
    expect(anchorEditAt(retangulo, 300, 40)).toEqual({ time: 1, price: 0 })
    expect(anchorEditAt(retangulo, 100, 180)).toEqual({ time: 0, price: 1 })
  })

  it('aceita a folga de oito pixels das ferramentas', () => {
    expect(anchorEditAt(retangulo, 106, 46)).toEqual({ time: 0, price: 0 })
    expect(anchorEditAt(retangulo, 100, 400)).toEqual({ time: 0, price: null })
  })

  it('numa ferramenta de um eixo só, o outro fica de fora', () => {
    // A linha horizontal tem preço e nenhum instante que se possa arrastar.
    expect(anchorEditAt([{ x: -999, y: 90 }], 250, 90))
      .toEqual({ time: null, price: 0 })
  })

  it('longe de tudo não é alça alguma', () => {
    expect(anchorEditAt(retangulo, 200, 110)).toBeNull()
    expect(anchorEditAt([], 10, 10)).toBeNull()
  })
})

describe('leitura de um desenho salvo', () => {
  const valid = {
    id: 'd1',
    tool: 'trend-line',
    anchors: [
      { time: 1, price: 10 },
      { time: 2, price: 20 },
    ],
    color: '#2962FF',
    lineWidth: 2,
  }

  it('aceita um desenho íntegro', () => {
    expect(parseDrawing(valid)).toEqual(valid)
  })

  it('recusa o que não pode ser desenhado', () => {
    // Armazenamento sobrevive ao código que o escreveu: um desenho de uma
    // versão antiga não pode derrubar a montagem do gráfico.
    expect(parseDrawing(null)).toBeNull()
    expect(parseDrawing({ ...valid, tool: 'inexistente' })).toBeNull()
    expect(parseDrawing({ ...valid, anchors: [valid.anchors[0]] })).toBeNull()
    expect(parseDrawing({ ...valid, anchors: [{ time: 1 }, { time: 2 }] }))
      .toBeNull()
  })

  it('repõe cor e espessura ausentes em vez de descartar o desenho', () => {
    const parsed = parseDrawing({ tool: 'horizontal-line', anchors: [{ time: 1, price: 5 }] })
    expect(parsed?.color).toBe('#2962FF')
    expect(parsed?.lineWidth).toBe(2)
  })
})
