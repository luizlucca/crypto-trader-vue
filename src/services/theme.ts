import { readonly, ref, shallowRef } from 'vue'
import {
  createCustomThemePreset,
  DEFAULT_THEME_PRESET_ID,
  getThemePreset,
  isCustomThemeDefinition,
  isCustomThemeId,
  isThemePresetId,
  type CustomThemeDefinition,
  type CustomThemeId,
  type ThemeMode,
  type ThemePalette,
  type ThemePresetId,
  type ThemePreset,
  type ThemeSelectionId,
  type ThemeVariantCustomization,
} from './themeCatalog'

export type AppTheme = ThemeMode

const THEME_STORAGE_KEY = 'cryptopro.theme.v1'
const THEME_PRESET_STORAGE_KEY = 'cryptopro.theme-preset.v1'
const CUSTOM_THEMES_STORAGE_KEY = 'cryptopro.custom-themes.v1'
const MAX_CUSTOM_THEMES = 12
const themeState = ref<AppTheme>('dark')
const presetState = ref<ThemeSelectionId>(DEFAULT_THEME_PRESET_ID)
const customThemeState = shallowRef<
  readonly ThemePreset<CustomThemeId>[]
>([])
let customDefinitions: CustomThemeDefinition[] = []
const paletteState = shallowRef<ThemePalette>(
  getThemePreset(DEFAULT_THEME_PRESET_ID).dark,
)
let initialized = false

const CSS_VARIABLES: readonly [string, keyof ThemePalette][] = [
  ['--bg', 'background'],
  ['--panel', 'panel'],
  ['--panel-raised', 'panelRaised'],
  ['--panel-muted', 'panelMuted'],
  ['--overlay-surface', 'overlaySurface'],
  ['--overlay-border', 'overlayBorder'],
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

function parseCustomDefinitions(
  serialized: string | null,
): CustomThemeDefinition[] {
  if (!serialized) {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed)) {
      return []
    }
    const ids = new Set<string>()
    return parsed
      .filter(isCustomThemeDefinition)
      .filter((definition) => {
        if (ids.has(definition.id)) {
          return false
        }
        ids.add(definition.id)
        return true
      })
      .slice(0, MAX_CUSTOM_THEMES)
  } catch {
    return []
  }
}

function applyCustomDefinitions(
  definitions: CustomThemeDefinition[],
): void {
  customDefinitions = definitions
  customThemeState.value = definitions.map(createCustomThemePreset)
}

function loadCustomDefinitions(): void {
  try {
    applyCustomDefinitions(parseCustomDefinitions(
      window.localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY),
    ))
  } catch {
    applyCustomDefinitions([])
  }
}

function customPreset(id: CustomThemeId): ThemePreset<CustomThemeId> | undefined {
  return customThemeState.value.find((preset) => preset.id === id)
}

function resolvePreset(id: ThemeSelectionId): ThemePreset {
  if (isThemePresetId(id)) {
    return getThemePreset(id)
  }
  if (isCustomThemeId(id)) {
    return customPreset(id) ?? getThemePreset(DEFAULT_THEME_PRESET_ID)
  }
  return getThemePreset(DEFAULT_THEME_PRESET_ID)
}

function storedPreset(): ThemeSelectionId {
  try {
    const value = window.localStorage.getItem(THEME_PRESET_STORAGE_KEY)
    if (isThemePresetId(value)) {
      return value
    }
    if (isCustomThemeId(value) && customPreset(value)) {
      return value
    }
    return DEFAULT_THEME_PRESET_ID
  } catch {
    return DEFAULT_THEME_PRESET_ID
  }
}

function applyAppearance(
  theme: AppTheme,
  presetId: ThemeSelectionId,
): void {
  const preset = resolvePreset(presetId)
  const palette = preset[theme]
  themeState.value = theme
  presetState.value = preset.id as ThemeSelectionId
  paletteState.value = palette
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.themePreset = preset.id
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
    && (
      isThemePresetId(event.newValue)
      || (
        isCustomThemeId(event.newValue)
        && Boolean(customPreset(event.newValue))
      )
    )
  ) {
    applyAppearance(themeState.value, event.newValue)
  }
  if (event.key === CUSTOM_THEMES_STORAGE_KEY) {
    applyCustomDefinitions(parseCustomDefinitions(event.newValue))
    if (
      isCustomThemeId(presetState.value)
      && !customPreset(presetState.value)
    ) {
      applyAppearance(themeState.value, DEFAULT_THEME_PRESET_ID)
    } else {
      applyAppearance(themeState.value, presetState.value)
    }
  }
}

export function initializeTheme(): void {
  if (initialized) {
    return
  }
  initialized = true
  loadCustomDefinitions()
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

export function setThemePreset(preset: ThemeSelectionId): void {
  const resolved = resolvePreset(preset)
  applyAppearance(themeState.value, resolved.id as ThemeSelectionId)
  try {
    window.localStorage.setItem(THEME_PRESET_STORAGE_KEY, resolved.id)
  } catch {
    // The current window still keeps the selected palette if storage is denied.
  }
}

export interface NewCustomTheme {
  name: string
  basePresetId: ThemePresetId
  dark: ThemeVariantCustomization
  light: ThemeVariantCustomization
}

function newCustomThemeId(): CustomThemeId {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `custom:${randomId}`
}

function persistCustomDefinitions(): void {
  try {
    window.localStorage.setItem(
      CUSTOM_THEMES_STORAGE_KEY,
      JSON.stringify(customDefinitions),
    )
  } catch {
    // The custom themes remain available for the current session.
  }
}

export function saveCustomTheme(input: NewCustomTheme): CustomThemeId {
  const definition: CustomThemeDefinition = {
    version: 1,
    id: newCustomThemeId(),
    name: input.name.trim().slice(0, 32),
    basePresetId: input.basePresetId,
    createdAt: Date.now(),
    dark: { ...input.dark },
    light: { ...input.light },
  }
  if (!isCustomThemeDefinition(definition)) {
    throw new Error('Configuração de tema personalizado inválida')
  }
  applyCustomDefinitions([
    definition,
    ...customDefinitions,
  ].slice(0, MAX_CUSTOM_THEMES))
  persistCustomDefinitions()
  setThemePreset(definition.id)
  return definition.id
}

export function deleteCustomTheme(id: CustomThemeId): void {
  if (!customDefinitions.some((definition) => definition.id === id)) {
    return
  }
  applyCustomDefinitions(
    customDefinitions.filter((definition) => definition.id !== id),
  )
  persistCustomDefinitions()
  if (presetState.value === id) {
    setThemePreset(DEFAULT_THEME_PRESET_ID)
  }
}

export function toggleTheme(): void {
  setTheme(themeState.value === 'dark' ? 'light' : 'dark')
}

export const appTheme = readonly(themeState)
export const appThemePreset = readonly(presetState)
export const appThemePalette = readonly(paletteState)
export const customThemePresets = readonly(customThemeState)
