import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEXT_APPEARANCE,
  TEXT_SIZE_PRESETS,
  estimateTextWidth,
  normalizeTextAppearance,
  sameTextAppearance,
  textBoxHeight,
  textCanvasFont,
} from './textAppearance'

describe('aparência textual compartilhada', () => {
  it('oferece quatro atalhos de tamanho sem duplicatas', () => {
    expect(TEXT_SIZE_PRESETS.map(({ label }) => label))
      .toEqual(['S', 'M', 'L', 'XL'])
    expect(new Set(TEXT_SIZE_PRESETS.map(({ fontSize }) => fontSize)).size)
      .toBe(4)
  })

  it('normaliza dados persistidos sem confiar no armazenamento', () => {
    expect(normalizeTextAppearance({
      fontFamily: 'desconhecida',
      fontSize: 200,
      fontWeight: 999,
      fontStyle: 'oblíquo',
      color: 'cor inválida',
    })).toEqual({
      ...DEFAULT_TEXT_APPEARANCE,
      fontSize: 48,
    })
    expect(normalizeTextAppearance({
      fontFamily: 'mono',
      fontSize: 6,
      fontWeight: 700,
      fontStyle: 'italic',
      color: '#123456',
    })).toEqual({
      fontFamily: 'mono',
      fontSize: 8,
      fontWeight: 700,
      fontStyle: 'italic',
      color: '#123456',
    })
  })

  it('deriva a mesma tipografia para DOM, canvas e hit test', () => {
    const appearance = normalizeTextAppearance({
      ...DEFAULT_TEXT_APPEARANCE,
      fontFamily: 'mono',
      fontSize: 22,
      fontWeight: 700,
      fontStyle: 'italic',
    })

    expect(textCanvasFont(appearance))
      .toContain('italic 700 22px "JetBrains Mono Variable"')
    expect(estimateTextWidth('BTC', appearance)).toBeCloseTo(40.92)
    expect(textBoxHeight(appearance)).toBe(32)
    expect(sameTextAppearance(appearance, { ...appearance })).toBe(true)
    expect(sameTextAppearance(appearance, {
      ...appearance,
      fontSize: 16,
    })).toBe(false)
  })
})
