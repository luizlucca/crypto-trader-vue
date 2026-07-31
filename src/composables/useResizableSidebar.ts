import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

export interface ResizableSidebarOptions {
  storageKey: string
  minWidth: number
  maxWidth: number
  defaultWidth: number
  /** Horizontal space the rest of the workspace needs at a given viewport. */
  reservedWidth: (viewportWidth: number) => number
}

export interface ResizableSidebar {
  width: Ref<number>
  maxWidth: Ref<number>
  /** Called when a drag settles, so the preference survives a restart. */
  persist: (value: number) => void
}

/**
 * Width state for a panel the user can drag, clamped to what the viewport can
 * actually give it.
 *
 * The preferred width is kept outside the reactive graph on purpose: it is the
 * value the user chose, while `width` is what currently fits. Shrinking the
 * window must not overwrite the preference, so that widening it again restores
 * the original choice.
 */
export function useResizableSidebar(
  options: ResizableSidebarOptions,
): ResizableSidebar {
  const { storageKey, minWidth, maxWidth, defaultWidth } = options

  function clamp(value: number, max: number): number {
    return Math.min(max, Math.max(minWidth, Math.round(value)))
  }

  function availableMaxWidth(): number {
    return Math.max(
      minWidth,
      Math.min(maxWidth, window.innerWidth - options.reservedWidth(
        window.innerWidth,
      )),
    )
  }

  function loadPreferredWidth(): number {
    try {
      const stored = Number(window.localStorage.getItem(storageKey))
      return Number.isFinite(stored) && stored > 0 ? stored : defaultWidth
    } catch {
      return defaultWidth
    }
  }

  let preferredWidth = loadPreferredWidth()
  const currentMaxWidth = ref(availableMaxWidth())
  const width = ref(clamp(preferredWidth, currentMaxWidth.value))

  function persist(value: number): void {
    preferredWidth = clamp(value, maxWidth)
    try {
      window.localStorage.setItem(storageKey, String(preferredWidth))
    } catch {
      // The current session still keeps the chosen width if storage is denied.
    }
  }

  function updateBounds(): void {
    currentMaxWidth.value = availableMaxWidth()
    width.value = clamp(preferredWidth, currentMaxWidth.value)
  }

  onMounted(() => window.addEventListener('resize', updateBounds))
  onBeforeUnmount(() => window.removeEventListener('resize', updateBounds))

  return { width, maxWidth: currentMaxWidth, persist }
}
