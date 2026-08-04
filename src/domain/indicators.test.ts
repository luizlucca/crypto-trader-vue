import { describe, expect, it } from 'vitest'
import type {
  IndicatorDefinition,
  IndicatorInputSpec,
  IndicatorPlotStyle,
} from './indicators'
import {
  coerceInput,
  createInstanceId,
  groupIndicatorInputs,
  inputGroupKind,
  plotColor,
  resolveInputs,
} from './indicators'

function spec(patch: Partial<IndicatorInputSpec>): IndicatorInputSpec {
  return { id: 'x', type: 'int', title: 'X', defval: 0, ...patch }
}

function style(patch: Partial<IndicatorPlotStyle>): IndicatorPlotStyle {
  return {
    color: '#2f9cff',
    lineWidth: 1,
    opacity: 1,
    visible: true,
    ...patch,
  }
}

/**
 * Estes valores chegam do `localStorage` e da digitação do usuário, então nem o
 * tipo nem a faixa podem ser presumidos — um período corrompido não pode
 * alcançar a biblioteca.
 */
describe('validação de parâmetros contra o inputConfig', () => {
  it('mantém um booleano e recorre ao padrão para qualquer outra coisa', () => {
    const flag = spec({ type: 'bool', defval: true })

    expect(coerceInput(flag, false)).toBe(false)
    expect(coerceInput(flag, 'sim')).toBe(true)
    expect(coerceInput(spec({ type: 'bool', defval: false }), null)).toBe(false)
  })

  it('arredonda inteiros e respeita os limites declarados', () => {
    const length = spec({ type: 'int', defval: 14, min: 2, max: 100 })

    expect(coerceInput(length, 20.6)).toBe(21)
    expect(coerceInput(length, '9')).toBe(9)
    expect(coerceInput(length, 0)).toBe(2)
    expect(coerceInput(length, 1000)).toBe(100)
  })

  it('devolve o padrão quando o número não é finito', () => {
    const length = spec({ type: 'int', defval: 14, min: 1 })

    expect(coerceInput(length, 'abc')).toBe(14)
    expect(coerceInput(length, Number.NaN)).toBe(14)
    expect(coerceInput(length, Number.POSITIVE_INFINITY)).toBe(14)
  })

  it('preserva as casas decimais de um parâmetro float', () => {
    const mult = spec({ type: 'float', defval: 2, min: 0.1, max: 50 })

    expect(coerceInput(mult, 2.5)).toBe(2.5)
    expect(coerceInput(mult, 0)).toBe(0.1)
  })

  it('recusa uma opção fora da lista declarada pelo spec', () => {
    const source = spec({
      type: 'source',
      defval: 'close',
      options: ['open', 'close'],
    })

    expect(coerceInput(source, 'open')).toBe('open')
    expect(coerceInput(source, 'vwap')).toBe('close')
    expect(coerceInput(source, 42)).toBe('close')
  })

  it('aceita apenas hexadecimal em um parâmetro de cor', () => {
    const color = spec({ type: 'color', defval: '#ff0000' })

    expect(coerceInput(color, '#00ff00')).toBe('#00ff00')
    expect(coerceInput(color, 'red')).toBe('#ff0000')
  })
})

describe('identidade de uma instância aplicada', () => {
  const rsi: IndicatorDefinition = {
    id: 'rsi',
    name: 'Relative Strength Index',
    shortName: 'RSI',
    description: '',
    category: 'Oscillators',
    overlay: false,
    group: 'standard',
    inputs: [spec({ id: 'length', type: 'int', defval: 14, min: 1 })],
    plots: [],
    hlines: [],
    defaults: { length: 14 },
  }

  it('não deixa dois RSI de períodos diferentes colidirem', () => {
    expect(resolveInputs(rsi, { length: 9 })).toEqual({ length: 9 })
    expect(resolveInputs(rsi, { length: 200 })).toEqual({ length: 200 })
    expect(createInstanceId()).not.toBe(createInstanceId())
  })

  it('preenche pelos defaults e descarta o que não está no spec', () => {
    expect(resolveInputs(rsi)).toEqual({ length: 14 })
    expect(resolveInputs(rsi, { length: 21, inexistente: 5 }))
      .toEqual({ length: 21 })
  })
})

describe('cor de uma linha com opacidade', () => {
  it('devolve a cor intacta quando é opaca', () => {
    expect(plotColor(style({ color: '#abcdef' }))).toBe('#abcdef')
  })

  it('converte hexadecimal de seis e de oito dígitos', () => {
    expect(plotColor(style({ color: '#ff8000', opacity: 0.5 })))
      .toBe('rgba(255, 128, 0, 0.50)')
    expect(plotColor(style({ color: '#ff800080', opacity: 0.5 })))
      .toBe('rgba(255, 128, 0, 0.50)')
  })

  it('expande as formas curtas em vez de lê-las como seis dígitos', () => {
    expect(plotColor(style({ color: '#f80', opacity: 0.5 })))
      .toBe('rgba(255, 136, 0, 0.50)')
    // `#RGBA` lido como seis dígitos produzia uma cor completamente outra.
    expect(plotColor(style({ color: '#f80c', opacity: 0.5 })))
      .toBe('rgba(255, 136, 0, 0.50)')
  })

  it('preserva a cor quando não consegue interpretá-la', () => {
    expect(plotColor(style({ color: 'var(--blue)', opacity: 0.5 })))
      .toBe('var(--blue)')
  })
})

describe('agrupamento de parâmetros de indicador', () => {
  it('classifica cada tipo em sua família', () => {
    expect(inputGroupKind(spec({ type: 'int' }))).toBe('numeric')
    expect(inputGroupKind(spec({ type: 'float' }))).toBe('numeric')
    expect(inputGroupKind(spec({ type: 'source' }))).toBe('choice')
    expect(inputGroupKind(spec({ type: 'bool' }))).toBe('toggle')
    expect(inputGroupKind(spec({ type: 'color' }))).toBe('color')
  })

  it('trata string com opções como seleção e sem opções como texto', () => {
    expect(inputGroupKind(spec({ type: 'string', options: ['a', 'b'] })))
      .toBe('choice')
    expect(inputGroupKind(spec({ type: 'string' }))).toBe('text')
  })

  it('junta os parâmetros do SMA, que o catálogo entrega intercalados', () => {
    // Catalog order: length, source, offset, smoothing type, smoothing
    // length, deviation — four numbers split by two dropdowns.
    const groups = groupIndicatorInputs([
      spec({ id: 'len', type: 'int', title: 'Length' }),
      spec({ id: 'src', type: 'source', title: 'Source' }),
      spec({ id: 'offset', type: 'int', title: 'Offset' }),
      spec({ id: 'maType', type: 'string', title: 'Smoothing', options: ['None'] }),
      spec({ id: 'maLength', type: 'int', title: 'Smoothing Length' }),
      spec({ id: 'bbMult', type: 'float', title: 'BB StdDev' }),
    ])

    expect(groups.map((group) => group.kind)).toEqual(['numeric', 'choice'])
    expect(groups[0].inputs.map((input) => input.id))
      .toEqual(['len', 'offset', 'maLength', 'bbMult'])
    expect(groups[1].inputs.map((input) => input.id)).toEqual(['src', 'maType'])
  })

  it('preserva a ordem do catálogo dentro de cada grupo', () => {
    const groups = groupIndicatorInputs([
      spec({ id: 'terceiro', type: 'int' }),
      spec({ id: 'primeiro', type: 'int' }),
      spec({ id: 'segundo', type: 'int' }),
    ])

    expect(groups[0].inputs.map((input) => input.id))
      .toEqual(['terceiro', 'primeiro', 'segundo'])
  })

  it('não cria grupos vazios', () => {
    const groups = groupIndicatorInputs([spec({ type: 'int' })])

    expect(groups).toHaveLength(1)
    expect(groups[0].kind).toBe('numeric')
  })

  it('devolve lista vazia para um indicador sem parâmetros', () => {
    expect(groupIndicatorInputs([])).toEqual([])
  })
})
