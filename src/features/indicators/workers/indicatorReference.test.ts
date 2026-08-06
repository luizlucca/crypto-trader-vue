import { describe, expect, it } from 'vitest'
import {
  calculateADX,
  calculateATR,
  calculateBB,
  calculateEMA,
  calculateMACD,
  calculateOBV,
  calculateRSI,
  calculateSMA,
  calculateStochastic,
  calculateVWAP,
} from 'lightweight-charts-indicators'

/**
 * The ten indicators this platform is most likely to trade on, checked against
 * formulas written here from their definitions rather than against the
 * library's own output.
 *
 * A port from PineScript can be subtly wrong — a seeding convention, a
 * population versus sample standard deviation, a smoothing constant — and
 * still produce a plausible curve. On a screen used to decide buy and sell,
 * plausible is not a standard. These tests exist so a library upgrade cannot
 * change a number without someone noticing.
 *
 * The series is deterministic and small enough to be reasoned about by hand:
 * closes cycle through a fixed sawtooth, so every window is reproducible.
 */

interface Bar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

const bars: Bar[] = Array.from({ length: 60 }, (_, index) => {
  const close = 100 + ((index * 7) % 23) - 11
  return {
    time: 1_700_000_000 + (index * 3600),
    open: close - 1,
    high: close + 3,
    low: close - 3,
    close,
    volume: 10 + (index % 5),
  }
})

const closes = bars.map((bar) => bar.close)
const PRECISION = 8

/** Values the library actually plotted, in order, ignoring the warm-up gaps. */
function drawn(
  result: { plots?: Record<string, { time: number, value: number }[]> },
  plotId: string,
): number[] {
  return (result.plots?.[plotId] ?? [])
    .filter((point) => Number.isFinite(point.value))
    .map((point) => point.value)
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sma(values: number[], length: number): number[] {
  const out: number[] = []
  for (let i = length - 1; i < values.length; i += 1) {
    out.push(mean(values.slice(i - length + 1, i + 1)))
  }
  return out
}

/** Seeded with the simple average of the first window, as PineScript does. */
function ema(values: number[], length: number): number[] {
  const alpha = 2 / (length + 1)
  const out: number[] = [mean(values.slice(0, length))]
  for (let i = length; i < values.length; i += 1) {
    out.push((values[i] * alpha) + (out[out.length - 1] * (1 - alpha)))
  }
  return out
}

/** Wilder's smoothing: the same recursion with alpha = 1/length. */
function rma(values: number[], length: number): number[] {
  const alpha = 1 / length
  const out: number[] = [mean(values.slice(0, length))]
  for (let i = length; i < values.length; i += 1) {
    out.push((values[i] * alpha) + (out[out.length - 1] * (1 - alpha)))
  }
  return out
}

function populationDeviation(values: number[]): number {
  const average = mean(values)
  const variance = mean(values.map((value) => (value - average) ** 2))
  return Math.sqrt(variance)
}

describe('os dez indicadores mais usados contra valores de referência', () => {
  it('SMA é a média simples da janela', () => {
    const esperado = sma(closes, 9)
    const obtido = drawn(calculateSMA(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
    // Âncora legível à mão: a última janela de nove fechamentos.
    expect(obtido.at(-1)).toBeCloseTo(mean(closes.slice(-9)), PRECISION)
  })

  it('EMA usa alpha 2/(n+1) semeada pela média da primeira janela', () => {
    const esperado = ema(closes, 9)
    const obtido = drawn(calculateEMA(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
  })

  it('RSI usa a suavização de Wilder sobre ganhos e perdas', () => {
    const ganhos: number[] = []
    const perdas: number[] = []
    for (let i = 1; i < closes.length; i += 1) {
      const delta = closes[i] - closes[i - 1]
      ganhos.push(Math.max(delta, 0))
      perdas.push(Math.max(-delta, 0))
    }
    const mediaGanhos = rma(ganhos, 14)
    const mediaPerdas = rma(perdas, 14)
    const esperado = mediaGanhos.map((ganho, index) => {
      const perda = mediaPerdas[index]
      if (perda === 0) {
        return 100
      }
      return 100 - (100 / (1 + (ganho / perda)))
    })

    const obtido = drawn(calculateRSI(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
    // Um RSI vive entre 0 e 100 — a garantia mais barata contra um porte solto.
    obtido.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    })
  })

  it('MACD é a diferença de duas EMAs, com sinal e histograma', () => {
    const rapida = ema(closes, 12)
    const lenta = ema(closes, 26)
    // Alinhadas pelo fim: a EMA lenta começa mais tarde.
    const desvio = rapida.length - lenta.length
    const linha = lenta.map((value, index) => rapida[index + desvio] - value)
    const sinal = ema(linha, 9)
    const histograma = sinal.map(
      (value, index) => linha[index + (linha.length - sinal.length)] - value,
    )

    const resultado = calculateMACD(bars)
    const obtidoLinha = drawn(resultado, 'plot1')
    const obtidoSinal = drawn(resultado, 'plot2')
    const obtidoHistograma = drawn(resultado, 'plot0')

    expect(obtidoLinha).toHaveLength(linha.length)
    obtidoLinha.forEach((value, index) => {
      expect(value).toBeCloseTo(linha[index], PRECISION)
    })
    expect(obtidoSinal).toHaveLength(sinal.length)
    obtidoSinal.forEach((value, index) => {
      expect(value).toBeCloseTo(sinal[index], PRECISION)
    })
    obtidoHistograma.forEach((value, index) => {
      expect(value).toBeCloseTo(histograma[index], PRECISION)
    })
  })

  it('Bollinger usa desvio populacional em torno da média', () => {
    const resultado = calculateBB(bars)
    const base = drawn(resultado, 'plot0')
    const superior = drawn(resultado, 'plot1')
    const inferior = drawn(resultado, 'plot2')

    for (let i = 0; i < base.length; i += 1) {
      const janela = closes.slice(i, i + 20)
      const media = mean(janela)
      const desvio = populationDeviation(janela)
      expect(base[i]).toBeCloseTo(media, PRECISION)
      expect(superior[i]).toBeCloseTo(media + (2 * desvio), PRECISION)
      expect(inferior[i]).toBeCloseTo(media - (2 * desvio), PRECISION)
    }
  })

  it('ATR suaviza o true range por RMA', () => {
    const trueRange: number[] = [bars[0].high - bars[0].low]
    for (let i = 1; i < bars.length; i += 1) {
      trueRange.push(Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close),
      ))
    }
    const esperado = rma(trueRange, 14)
    const obtido = drawn(calculateATR(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
  })

  it('Estocástico posiciona o fechamento na faixa da janela', () => {
    const percentK: number[] = []
    for (let i = 13; i < bars.length; i += 1) {
      const janela = bars.slice(i - 13, i + 1)
      const maior = Math.max(...janela.map((bar) => bar.high))
      const menor = Math.min(...janela.map((bar) => bar.low))
      percentK.push(maior === menor
        ? 50
        : (100 * (bars[i].close - menor)) / (maior - menor))
    }
    const percentD = sma(percentK, 3)

    const resultado = calculateStochastic(bars)
    const obtidoK = drawn(resultado, 'plot0')
    const obtidoD = drawn(resultado, 'plot1')
    expect(obtidoK).toHaveLength(percentK.length)
    obtidoK.forEach((value, index) => {
      expect(value).toBeCloseTo(percentK[index], PRECISION)
    })
    expect(obtidoD).toHaveLength(percentD.length)
    obtidoD.forEach((value, index) => {
      expect(value).toBeCloseTo(percentD[index], PRECISION)
    })
  })

  it('OBV acumula o volume com o sinal da variação', () => {
    let acumulado = 0
    const esperado = bars.map((bar, index) => {
      if (index > 0) {
        const anterior = bars[index - 1].close
        if (bar.close > anterior) acumulado += bar.volume
        else if (bar.close < anterior) acumulado -= bar.volume
      }
      return acumulado
    })
    const obtido = drawn(calculateOBV(bars), 'plot0')
    expect(obtido).toEqual(esperado)
  })

  it('VWAP pondera o preço típico pelo volume dentro da âncora diária', () => {
    let somaPreco = 0
    let somaVolume = 0
    let diaAtual = -1
    const esperado = bars.map((bar) => {
      const dia = Math.floor(bar.time / 86_400)
      if (dia !== diaAtual) {
        diaAtual = dia
        somaPreco = 0
        somaVolume = 0
      }
      const tipico = (bar.high + bar.low + bar.close) / 3
      somaPreco += tipico * bar.volume
      somaVolume += bar.volume
      return somaPreco / somaVolume
    })
    const obtido = drawn(calculateVWAP(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
  })

  it('ADX segue a cadeia de Wilder: DM, DI, DX e a média do DX', () => {
    /*
     * A primeira barra entra na cadeia com true range = máxima − mínima e
     * movimento direcional nulo, exatamente como no ATR. É essa convenção que
     * faz o primeiro ADX cair na barra 26 e não na 27.
     */
    const trueRange: number[] = [bars[0].high - bars[0].low]
    const positivo: number[] = [0]
    const negativo: number[] = [0]
    for (let i = 1; i < bars.length; i += 1) {
      const subiu = bars[i].high - bars[i - 1].high
      const caiu = bars[i - 1].low - bars[i].low
      positivo.push(subiu > caiu && subiu > 0 ? subiu : 0)
      negativo.push(caiu > subiu && caiu > 0 ? caiu : 0)
      trueRange.push(Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close),
      ))
    }
    const suavizadoTR = rma(trueRange, 14)
    const suavizadoMais = rma(positivo, 14)
    const suavizadoMenos = rma(negativo, 14)
    const dx = suavizadoTR.map((tr, index) => {
      const diMais = tr === 0 ? 0 : (100 * suavizadoMais[index]) / tr
      const diMenos = tr === 0 ? 0 : (100 * suavizadoMenos[index]) / tr
      const soma = diMais + diMenos
      return soma === 0 ? 0 : (100 * Math.abs(diMais - diMenos)) / soma
    })
    const esperado = rma(dx, 14)

    const obtido = drawn(calculateADX(bars), 'plot0')
    expect(obtido).toHaveLength(esperado.length)
    obtido.forEach((value, index) => {
      expect(value).toBeCloseTo(esperado[index], PRECISION)
    })
    obtido.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    })
  })
})
