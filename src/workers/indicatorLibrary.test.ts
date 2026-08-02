import { describe, expect, it } from 'vitest'
import {
  calculateMFIRSIBollingerBands,
  calculateSMA,
  indicatorRegistry,
} from 'lightweight-charts-indicators'

const bars = Array.from({ length: 500 }, (_, index) => {
  const close = 60_000 + Math.sin(index / 8) * 500 + index
  return {
    time: 1_700_000_000 + index * 3_600,
    open: close - 10,
    high: close + 50,
    low: close - 50,
    close,
    volume: 100 + index,
  }
})

describe('MFI/RSI Bollinger Bands integration', () => {
  it('stays deterministic through repeated calculate/remove/add cycles', () => {
    let reference: number[] | undefined
    for (let cycle = 0; cycle < 250; cycle += 1) {
      calculateSMA(bars)
      const result = calculateMFIRSIBollingerBands(bars)
      const counts = Object.values(result.plots).map(
        (points) => points.filter((point) => Number.isFinite(point.value)).length,
      )
      reference ??= counts
      expect(counts).toEqual(reference)
      expect(counts.every((count) => count > 400)).toBe(true)
    }
  })
})

/**
 * The classification behind the message shown when a pane stays blank. Getting
 * it wrong means telling the operator a reason that is not the real one, so the
 * rule is checked against the library itself rather than against a stub.
 */
describe('classificação de saídas do catálogo', () => {
  const UNSUPPORTED = [
    'lines', 'boxes', 'labels', 'bgColors', 'barColors', 'pivots',
  ]

  function classify(id: string): 'desenha' | 'nao-suportado' | 'sem-valores' {
    const registry = indicatorRegistry as unknown as {
      id: string
      defaultInputs?: Record<string, unknown>
      calculate: (b: unknown[], i: unknown) => Record<string, unknown>
    }[]
    const entry = registry.find((candidate) => candidate.id === id)
    if (!entry) {
      throw new Error(`Indicador ausente do catálogo: ${id}`)
    }
    const output = entry.calculate(bars, entry.defaultInputs ?? {})
    const plots = (output.plots ?? {}) as Record<
      string,
      { time: number, value: number }[]
    >
    const drew = Object.values(plots).some((points) => points.some(
      (point) => Number.isFinite(point?.value) && Number.isFinite(point?.time),
    ))
    const candles = Object.values(
      (output.plotCandles ?? {}) as Record<string, { time: number }[]>,
    ).some((points) => points.length > 0)
    if (drew || candles || ((output.markers ?? []) as unknown[]).length > 0) {
      return 'desenha'
    }
    return UNSUPPORTED.some((key) => {
      const value = output[key]
      return Array.isArray(value)
        ? value.length > 0
        : typeof value === 'object' && value !== null
          && Object.keys(value).length > 0
    })
      ? 'nao-suportado'
      : 'sem-valores'
  }

  it('reconhece os indicadores que desenham por séries', () => {
    expect(classify('rsi')).toBe('desenha')
    expect(classify('macd')).toBe('desenha')
    expect(classify('mfi-rsi-bb')).toBe('desenha')
  })

  it('reconhece os que desenham por velas próprias', () => {
    // Saída OHLC do próprio indicador, como na TradingView.
    expect(classify('cvd')).toBe('desenha')
    expect(classify('volume-delta')).toBe('desenha')
    expect(classify('cm-heikin-ashi')).toBe('desenha')
  })

  it('reconhece os que dependem de recursos gráficos ausentes', () => {
    // Caixas, linhas livres e rótulos: sem contrapartida no protocolo.
    expect(classify('price-volume-profile')).toBe('nao-suportado')
    expect(classify('zigzag')).toBe('nao-suportado')
    expect(classify('auto-key-levels')).toBe('nao-suportado')
  })

  it('reconhece os que simplesmente não produzem valores', () => {
    // Declaram plots e devolvem apenas NaN com os parâmetros padrão: o painel
    // fica vazio por falta de dados, não por limitação do gráfico.
    expect(classify('hott-lott')).toBe('sem-valores')
  })
})
