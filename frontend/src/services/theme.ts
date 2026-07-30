import { readonly, ref, shallowRef } from 'vue'
import {
  DEFAULT_THEME_PRESET_ID,
  getThemePalette,
  isThemePresetId,
  type ThemeMode,
  type ThemePalette,
  type ThemePresetId,
} from './themeCatalog'

export type AppTheme = ThemeMode

const THEME_STORAGE_KEY = 'cryptopro.theme.v1'
const THEME_PRESET_STORAGE_KEY = 'cryptopro.theme-preset.v1'
const themeState = ref<AppTheme>('dark')
const presetState = ref<ThemePresetId>(DEFAULT_THEME_PRESET_ID)
const paletteState = shallowRef<ThemePalette>(
  getThemePalette(DEFAULT_THEME_PRESET_ID, 'dark'),
)
let initialized = false

const CSS_VARIABLES: readonly [string, keyof ThemePalette][] = [
  ['--bg', 'background'],
  ['--panel', 'panel'],
  ['--panel-raised', 'panelRaised'],
  ['--panel-muted', 'panelMuted'],
  ['--header-bg', 'header'],
  ['--workspace-bg', 'workspace'],
  ['--navigation-bg', 'navigation'],
  ['--control-bg', 'control'],
  ['--input-bg', 'input'],
  ['--hover-bg', 'hover'],
  ['--selected-bg', 'selected'],
  ['--border', 'border'],
  ['--border-soft', 'borderSoft'],
  ['--text', 'text'],
  ['--text-strong', 'textStrong'],
  ['--muted', 'muted'],
  ['--blue', 'accent'],
  ['--accent-hover', 'accentHover'],
  ['--accent-soft', 'accentSoft'],
  ['--accent-contrast', 'accentContrast'],
  ['--green', 'positive'],
  ['--red', 'negative'],
  ['--purple', 'secondary'],
  ['--warning', 'warning'],
  ['--chart-bg', 'chartBackground'],
  ['--chart-grid', 'chartGrid'],
  ['--chart-border', 'chartBorder'],
  ['--chart-text', 'chartText'],
]

function isAppTheme(value: unknown): value is AppTheme {
  return value === 'dark' || value === 'light'
}

function storedTheme(): AppTheme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isAppTheme(value) ? value : 'dark'
  } catch {
    return 'dark'
  }
}

function storedPreset(): ThemePresetId {
  try {
    const value = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)
    return isThemePresetId(value) ? value : DEFAULT_THEME_PRESET_ID
  } catch {
    return DEFAULT_THEME_PRESET_ID
  }
}

function applyAppearance(
  theme: AppTheme,
  preset: ThemePresetId,
): void {
  const palette = getThemePalette(preset, theme)
  themeState.value = theme
  presetState.value = preset
  paletteState.value = palette
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.themePreset = preset
  document.documentElement.style.colorScheme = theme
  CSS_VARIABLES.forEach(([property, key]) => {
    document.documentElement.style.setProperty(property, palette[key])
  })
}

function handleStorage(event: StorageEvent): void {
  if (event.key === THEME_STORAGE_KEY && isAppTheme(event.newValue)) {
    applyAppearance(event.newValue, presetState.value)
  }
  if (
    event.key === THEME_PRESET_STORAGE_KEY
    && isThemePresetId(event.newValue)
  ) {
    applyAppearance(themeState.value, event.newValue)
  }
}

export function initializeTheme(): void {
  if (initialized) {
    return
  }
  initialized = true
  applyAppearance(storedTheme(), storedPreset())
  window.addEventListener('storage', handleStorage)
}

export function setTheme(theme: AppTheme): void {
  applyAppearance(theme, presetState.value)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The current window still keeps the selected theme if storage is denied.
  }
}

export function setThemePreset(preset: ThemePresetId): void {
  applyAppearance(themeState.value, preset)
  try {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, preset)
  } catch {
    // The current window still keeps the selected palette if storage is denied.
  }
}

export function toggleTheme(): void {
  setTheme(themeState.value === 'dark' ? 'light' : 'dark')
}

export const appTheme = readonly(themeState)
export const appThemePreset = readonly(presetState)
export const appThemePalette = readonly(paletteState)
