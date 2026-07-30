import { afterEach, describe, expect, it, vi } from 'vitest'
import { appTheme, initializeTheme, toggleTheme } from './theme'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('theme service', () => {
  it('restores, applies and persists the selected theme', async () => {
    const values = new Map([['cryptopro.theme.v1', 'light']])
    const dataset: Record<string, string> = {}
    const style: Record<string, string> = {}
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
    expect(dataset.theme).toBe('light')
    expect(style.colorScheme).toBe('light')

    toggleTheme()

    expect(appTheme.value).toBe('dark')
    expect(values.get('cryptopro.theme.v1')).toBe('dark')
  })
})
