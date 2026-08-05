import { describe, expect, it } from 'vitest'
import {
  contrastRatio,
  hexChannels,
  linearChannel,
  relativeLuminance,
  toHex,
} from './color'

describe('aritmética de cor', () => {
  it('lê hex de três e de seis dígitos, e recusa o resto', () => {
    expect(hexChannels('#f80')).toEqual([255, 136, 0])
    expect(hexChannels('#ff8800')).toEqual([255, 136, 0])
    expect(hexChannels('ff8800')).toEqual([255, 136, 0])
    expect(hexChannels('var(--blue)')).toBeNull()
    expect(hexChannels('#ff88')).toBeNull()
  })

  it('fecha a volta de canais para hex', () => {
    expect(toHex([255, 136, 0])).toBe('#ff8800')
    expect(toHex([-10, 300, 7.6])).toBe('#00ff08')
  })

  it('os dois limiares sRGB concordam para todo canal de 8 bits', () => {
    // Era a razão de as duas implementações poderem virar uma: `0.03928` e
    // `0.04045` só discordam entre 10,016 e 10,315, e nenhum inteiro cai ali.
    const outroLimiar = (canal: number) => {
      const escala = canal / 255
      return escala <= 0.04045
        ? escala / 12.92
        : ((escala + 0.055) / 1.055) ** 2.4
    }
    for (let canal = 0; canal <= 255; canal += 1) {
      expect(linearChannel(canal)).toBeCloseTo(outroLimiar(canal), 12)
    }
  })

  it('mede contraste e não inventa quando não sabe ler', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#000000', '#000000')).toBeCloseTo(1, 5)
    expect(contrastRatio('#ffffff', 'var(--bg)')).toBeNull()
  })

  it('pesa o verde acima do vermelho e do azul, como o olho', () => {
    const verde = relativeLuminance([0, 255, 0])
    const vermelho = relativeLuminance([255, 0, 0])
    const azul = relativeLuminance([0, 0, 255])
    expect(verde).toBeGreaterThan(vermelho)
    expect(vermelho).toBeGreaterThan(azul)
  })
})
