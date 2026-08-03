import { describe, expect, it } from 'vitest'
import {
  calculateMFIRSIBollingerBands,
  calculateSMA,
  indicatorRegistry,
} from 'lightweight-charts-indicators'
import {
  MIN_GRAPHIC_CONTRAST,
  contrastRatio,
  readableOn,
} from '@/domain/readableColor'
import { themePresets } from '@/services/themeCatalog'

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
  const DRAWING_OUTPUTS = ['lines', 'boxes', 'labels', 'bgColors', 'barColors']
  const UNSUPPORTED_OUTPUTS = ['pivots']

  function hasContent(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.length > 0
    }
    return typeof value === 'object'
      && value !== null
      && Object.keys(value).length > 0
  }

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
    const drawings = DRAWING_OUTPUTS.some((key) => hasContent(output[key]))
    if (
      drew
      || candles
      || drawings
      || ((output.markers ?? []) as unknown[]).length > 0
    ) {
      return 'desenha'
    }
    return UNSUPPORTED_OUTPUTS.some((key) => hasContent(output[key]))
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

  it('reconhece caixas, linhas, rótulos e fundos como desenhos suportados', () => {
    expect(classify('price-volume-profile')).toBe('desenha')
    expect(classify('zigzag')).toBe('desenha')
    expect(classify('auto-key-levels')).toBe('desenha')
  })

  it('reconhece os que simplesmente não produzem valores', () => {
    // Declaram plots e devolvem apenas NaN com os parâmetros padrão: o painel
    // fica vazio por falta de dados, não por limitação do gráfico.
    expect(classify('hott-lott')).toBe('sem-valores')
  })
})

/**
 * The catalog's colours were written for one dark theme. This is the guard that
 * every one of them stays visible on every preset the app ships — the check
 * that turns "trocar de tema mantém os indicadores legíveis" from an intention
 * into a property.
 */
describe('legibilidade do catálogo em todos os temas', () => {
  it('nenhuma cor de linha fica abaixo do limiar em nenhum preset', () => {
    const registry = indicatorRegistry as unknown as {
      plotConfig?: { color?: string }[]
    }[]
    const colors = new Set<string>()
    for (const entry of registry) {
      for (const plot of entry.plotConfig ?? []) {
        if (plot.color) {
          colors.add(plot.color)
        }
      }
    }
    expect(colors.size).toBeGreaterThan(200)

    const falhas: string[] = []
    for (const preset of themePresets) {
      for (const mode of ['dark', 'light'] as const) {
        const surface = preset[mode].chartBackground
        for (const color of colors) {
          const resolved = readableOn(color, surface)
          const ratio = contrastRatio(resolved, surface)
          if (ratio !== null && ratio < MIN_GRAPHIC_CONTRAST) {
            falhas.push(`${color} → ${resolved} em ${preset.id}/${mode}`)
          }
        }
      }
    }
    expect(falhas).toEqual([])
  })
})
