import { describe, expect, it } from 'vitest'
import {
  MIN_GRAPHIC_CONTRAST,
  contrastRatio,
  readableOn,
} from './readableColor'

const DARK = '#0e1821'
const LIGHT = '#f8fbfc'

describe('legibilidade de cor sobre o fundo do gráfico', () => {
  it('devolve a cor intacta quando ela já se lê', () => {
    // Turquesa sobre fundo escuro: o autor do catálogo escolheu bem.
    expect(readableOn('#2dd4bf', DARK)).toBe('#2dd4bf')
    expect(readableOn('#0f766e', LIGHT)).toBe('#0f766e')
  })

  it('clareia sobre fundo escuro e escurece sobre fundo claro', () => {
    const noEscuro = readableOn('#000080', DARK)
    const noClaro = readableOn('#fafad2', LIGHT)
    expect(noEscuro).not.toBe('#000080')
    expect(noClaro).not.toBe('#fafad2')
    expect(contrastRatio(noEscuro, DARK)!).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST)
    expect(contrastRatio(noClaro, LIGHT)!).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST)
  })

  it('preserva o matiz, movendo apenas a luminosidade', () => {
    // Azul-marinho continua azul depois de clareado.
    const ajustado = readableOn('#000080', DARK)
    const value = Number.parseInt(ajustado.slice(1), 16)
    const red = (value >> 16) & 255
    const green = (value >> 8) & 255
    const blue = value & 255
    expect(blue).toBeGreaterThan(red)
    expect(blue).toBeGreaterThan(green)
  })

  it('move o mínimo necessário para cruzar o limiar', () => {
    const ajustado = readableOn('#1f1559', DARK)
    const alcancado = contrastRatio(ajustado, DARK)!
    expect(alcancado).toBeGreaterThanOrEqual(MIN_GRAPHIC_CONTRAST)
    // Um passo de sobra, não um branco genérico.
    expect(alcancado).toBeLessThan(MIN_GRAPHIC_CONTRAST + 1)
  })

  it('ignora o que não sabe ler', () => {
    expect(readableOn('rgba(1,2,3,0.5)', DARK)).toBe('rgba(1,2,3,0.5)')
  })
})
