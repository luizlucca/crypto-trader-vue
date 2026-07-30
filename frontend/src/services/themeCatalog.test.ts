import { describe, expect, it } from 'vitest'
import {
  getThemePalette,
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
  it('offers 30 unique presets with readable light and dark variants', () => {
    expect(themePresets).toHaveLength(30)
    expect(new Set(themePresets.map(({ id }) => id)).size).toBe(30)

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
})
