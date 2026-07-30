import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  appTheme,
  appThemePalette,
  appThemePreset,
  initializeTheme,
  setThemePreset,
  toggleTheme,
} from './theme'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme service', () => {
  it('restores, applies and persists the selected theme', async () => {
    const values = new Map([
      ['cryptopro.theme.v1', 'light'],
      ['cryptopro.theme-preset.v1', 'ocean'],
    ])
    const dataset: Record<string, string> = {}
    const properties = new Map<string, string>()
    const style = {
      colorScheme: '',
      setProperty: (key: string, value: string) => {
        properties.set(key, value)
      },
    }
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
      addEventListener: vi.fn(),
    })
    vi.stubGlobal('document', {
      documentElement: { dataset, style },
    })

    initializeTheme()

    expect(appTheme.value).toBe('light')
    expect(appThemePreset.value).toBe('ocean')
    expect(dataset.theme).toBe('light')
    expect(dataset.themePreset).toBe('ocean')
    expect(style.colorScheme).toBe('light')
    expect(properties.get('--blue')).toBe(appThemePalette.value.accent)

    toggleTheme()

    expect(appTheme.value).toBe('dark')
    expect(values.get('cryptopro.theme.v1')).toBe('dark')

    setThemePreset('dracula')

    expect(appThemePreset.value).toBe('dracula')
    expect(dataset.themePreset).toBe('dracula')
    expect(values.get('cryptopro.theme-preset.v1')).toBe('dracula')
    expect(properties.get('--green')).toBe(
      appThemePalette.value.positive,
    )
  })
})
