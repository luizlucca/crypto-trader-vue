import { onBeforeUnmount, onMounted, type Ref } from 'vue'

export interface GlobalShortcutHandlers {
  /** Ctrl/Cmd+T — open the symbol picker to create a tab. */
  newTab: () => void
  /** Enter on the workspace — open the symbol picker for the current tab. */
  openSearch: () => void
  /** Ctrl/Cmd+I — open the indicator picker for the active chart. */
  openIndicators: () => void
  /** While true every shortcut is ignored: a modal owns the keyboard. */
  suspended: Ref<boolean>
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'input, textarea, select, [contenteditable="true"]',
  ))
}

export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  function handleKey(event: KeyboardEvent): void {
    if (handlers.suspended.value) {
      return
    }

    const withModifier = (event.ctrlKey || event.metaKey)
      && !event.altKey
      && !event.shiftKey

    if (withModifier && event.key.toLowerCase() === 't') {
      event.preventDefault()
      handlers.newTab()
      return
    }

    if (withModifier && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      handlers.openIndicators()
      return
    }

    // Bare Enter only. `repeat` excludes a held key, and a text field must
    // keep Enter for itself.
    if (
      event.key !== 'Enter'
      || event.repeat
      || event.defaultPrevented
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
      || isTextEditingTarget(event.target)
    ) {
      return
    }

    event.preventDefault()
    handlers.openSearch()
  }

  onMounted(() => document.addEventListener('keydown', handleKey))
  onBeforeUnmount(() => document.removeEventListener('keydown', handleKey))
}
