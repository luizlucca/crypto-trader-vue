import { describe, expect, it } from 'vitest'
import { DRAWING_ANCHORS } from '@/domain/chartDrawings'
import { DRAWING_TOOL_ICONS } from './drawingToolIcons'

describe('ícones das ferramentas de desenho', () => {
  it('possui um glifo não vazio para cada ferramenta suportada', () => {
    expect(new Set(Object.keys(DRAWING_TOOL_ICONS)))
      .toEqual(new Set(Object.keys(DRAWING_ANCHORS)))

    for (const icon of Object.values(DRAWING_TOOL_ICONS)) {
      const shapeCount = Object.values(icon)
        .reduce((total, shapes) => total + shapes.length, 0)

      expect(shapeCount).toBeGreaterThan(0)
    }
  })

  it('não reduz o catálogo a poucos ícones genéricos repetidos', () => {
    const uniqueGlyphs = new Set(
      Object.values(DRAWING_TOOL_ICONS).map((icon) => JSON.stringify(icon)),
    )

    expect(uniqueGlyphs.size).toBeGreaterThanOrEqual(64)
  })
})
