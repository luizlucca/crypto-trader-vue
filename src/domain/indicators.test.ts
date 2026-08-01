import { describe, expect, it } from 'vitest'
import type { IndicatorInputSpec } from './indicators'
import { groupIndicatorInputs, inputGroupKind } from './indicators'

function spec(patch: Partial<IndicatorInputSpec>): IndicatorInputSpec {
  return { id: 'x', type: 'int', title: 'X', defval: 0, ...patch }
}

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
