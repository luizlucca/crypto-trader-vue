import { describe, expect, it } from 'vitest'
import {
  createCustomThemePreset,
  customizeThemePalette,
  defaultThemeCustomization,
  getThemePalette,
  getThemePreset,
  isCustomThemeDefinition,
  isThemePresetId,
  themePresets,
} from './themeCatalog'

function luminance(hex: string): number {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return (
    (0.2126 * channels[0]!)
    + (0.7152 * channels[1]!)
    + (0.0722 * channels[2]!)
  )
}

function contrast(first: string, second: string): number {
  const lighter = Math.max(luminance(first), luminance(second))
  const darker = Math.min(luminance(first), luminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme catalog', () => {
  it('offers 38 unique presets with readable light and dark variants', () => {
    expect(themePresets).toHaveLength(38)
    expect(new Set(themePresets.map(({ id }) => id)).size).toBe(38)

    themePresets.forEach((preset) => {
      expect(isThemePresetId(preset.id)).toBe(true)
      expect(preset.dark.chartBackground).not.toBe(
        preset.light.chartBackground,
      )
      expect(preset.dark.candleUp).not.toBe(preset.dark.candleDown)
      expect(preset.light.candleUp).not.toBe(preset.light.candleDown)
      expect(contrast(preset.dark.text, preset.dark.panel)).toBeGreaterThan(4.5)
      expect(contrast(preset.light.text, preset.light.panel)).toBeGreaterThan(4.5)
    })
  })

  it('resolves every mode through the public palette lookup', () => {
    const preset = themePresets[12]!
    expect(getThemePalette(preset.id, 'dark')).toBe(preset.dark)
    expect(getThemePalette(preset.id, 'light')).toBe(preset.light)
    expect(isThemePresetId('not-a-theme')).toBe(false)
  })

  it('creates transparent custom candle and chart colors', () => {
    const customization = defaultThemeCustomization('cryptopro', 'dark')
    customization.candleUp = '#10b981'
    customization.candleDown = '#f43f5e'
    customization.chartBackground = '#102030'
    customization.candleOpacity = 0.65
    customization.backgroundOpacity = 0.35
    const palette = customizeThemePalette(
      getThemePalette('cryptopro', 'dark'),
      customization,
      'dark',
    )

    expect(palette.candleUp).toBe('rgba(16, 185, 129, 0.65)')
    expect(palette.candleDown).toBe('rgba(244, 63, 94, 0.65)')
    expect(palette.chartBackground).toBe('rgba(16, 32, 48, 0.35)')
    expect(palette.positive).toBe('#10b981')
  })

  it('validates and materializes a persisted custom preset', () => {
    const definition = {
      version: 1 as const,
      id: 'custom:theme-test-123' as const,
      name: 'Tema de teste',
      basePresetId: 'ocean' as const,
      createdAt: 123,
      dark: defaultThemeCustomization('ocean', 'dark'),
      light: defaultThemeCustomization('ocean', 'light'),
    }

    expect(isCustomThemeDefinition(definition)).toBe(true)
    const preset = createCustomThemePreset(definition)
    expect(preset.id).toBe(definition.id)
    expect(preset.dark.accent).toBe(definition.dark.accent)
  })
})

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

describe('temas neutros e o padrão TradingView', () => {
  const NEUTRAL = ['onyx', 'carbon', 'ash'] as const
  /** Chrome that must carry no hue at all in a neutral theme. */
  const SURFACES = [
    'background', 'panel', 'panelRaised', 'panelMuted', 'overlaySurface',
    'header', 'workspace', 'navigation', 'control', 'input', 'border',
    'text', 'textStrong', 'muted', 'chartBackground', 'chartGrid',
  ] as const

  it('mantém os neutros em escala de cinza nas duas luminosidades', () => {
    NEUTRAL.forEach((id) => {
      const preset = getThemePreset(id)
      ;(['dark', 'light'] as const).forEach((mode) => {
        SURFACES.forEach((token) => {
          const [red, green, blue] = channels(preset[mode][token])
          // One step of rounding is tolerated; a hue is not.
          expect(Math.max(red, green, blue) - Math.min(red, green, blue))
            .toBeLessThanOrEqual(1)
        })
      })
    })
  })

  it('separa os três neutros por profundidade, não por matiz', () => {
    const depths = NEUTRAL.map(
      (id) => channels(getThemePreset(id).dark.background)[0],
    )
    expect(depths[0]).toBeLessThan(depths[1])
    expect(depths[1]).toBeLessThan(depths[2])
  })

  it('reproduz as cores oficiais da TradingView', () => {
    const preset = getThemePreset('tradingview')
    expect(preset.dark.candleUp).toBe('#26a69a')
    expect(preset.dark.candleDown).toBe('#ef5350')
    expect(preset.dark.accent).toBe('#2962ff')
    // O fundo escuro fica na vizinhança de #131722, o gráfico da plataforma.
    const [red, green, blue] = channels(preset.dark.chartBackground)
    expect(blue).toBeGreaterThan(red)
    expect(red + green + blue).toBeLessThan(120)
  })
})

describe('superfície de modais (F-015)', () => {
  const channels = (hex: string): [number, number, number] => {
    const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const luminance = (hex: string): number => {
    const [r, g, b] = channels(hex).map((channel) => {
      const scaled = channel / 255
      return scaled <= 0.03928
        ? scaled / 12.92
        : ((scaled + 0.055) / 1.055) ** 2.4
    })
    return (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
  }
  /** Perceived separation between two surfaces, 1 = identical. */
  const contrast = (first: string, second: string): number => {
    const [brighter, darker] = [luminance(first), luminance(second)]
      .sort((left, right) => right - left)
    return (brighter + 0.05) / (darker + 0.05)
  }

  it('define os tokens em todos os presets, nas duas luminosidades', () => {
    for (const preset of themePresets) {
      for (const mode of ['dark', 'light'] as const) {
        expect(preset[mode].overlaySurface, `${preset.id}/${mode}`)
          .toMatch(/^#[0-9a-f]{6}$/i)
        expect(preset[mode].overlayBorder, `${preset.id}/${mode}`)
          .toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('separa a superfície do modal do painel do workspace', () => {
    // Without a dimmed backdrop this separation is the only thing telling the
    // user where the dialog ends, so it has to hold in every preset.
    for (const preset of themePresets) {
      for (const mode of ['dark', 'light'] as const) {
        expect(
          contrast(preset[mode].overlaySurface, preset[mode].panel),
          `${preset.id}/${mode}`,
        ).toBeGreaterThan(1.12)
      }
    }
  })

  it('eleva no escuro e adensa no claro', () => {
    for (const preset of themePresets) {
      expect(
        luminance(preset.dark.overlaySurface),
        `${preset.id}/dark`,
      ).toBeGreaterThan(luminance(preset.dark.panel))
      expect(
        luminance(preset.light.overlaySurface),
        `${preset.id}/light`,
      ).toBeLessThan(luminance(preset.light.panel))
    }
  })

  it('dá ao contorno do modal mais presença que a borda comum', () => {
    for (const preset of themePresets) {
      for (const mode of ['dark', 'light'] as const) {
        expect(
          contrast(preset[mode].overlayBorder, preset[mode].overlaySurface),
          `${preset.id}/${mode}`,
        ).toBeGreaterThan(
          contrast(preset[mode].border, preset[mode].panel),
        )
      }
    }
  })
})
