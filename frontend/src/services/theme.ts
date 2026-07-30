import { readonly, ref } from 'vue'

export type AppTheme = 'dark' | 'light'

const THEME_STORAGE_KEY = 'cryptopro.theme.v1'
const themeState = ref<AppTheme>('dark')
let initialized = false

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

function applyTheme(theme: AppTheme): void {
  themeState.value = theme
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
}

function handleStorage(event: StorageEvent): void {
  if (event.key === THEME_STORAGE_KEY && isAppTheme(event.newValue)) {
    applyTheme(event.newValue)
  }
}

export function initializeTheme(): void {
  if (initialized) {
    return
  }
  initialized = true
  applyTheme(storedTheme())
  window.addEventListener('storage', handleStorage)
}

export function setTheme(theme: AppTheme): void {
  applyTheme(theme)
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The current window still keeps the selected theme if storage is denied.
  }
}

export function toggleTheme(): void {
  setTheme(themeState.value === 'dark' ? 'light' : 'dark')
}

export const appTheme = readonly(themeState)
