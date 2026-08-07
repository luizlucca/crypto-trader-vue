export interface ProviderConnectionDialogEscapeTarget {
  addEventListener(
    type: 'keydown',
    listener: (event: KeyboardEvent) => void,
  ): void
  removeEventListener(
    type: 'keydown',
    listener: (event: KeyboardEvent) => void,
  ): void
}

export function bindProviderConnectionDialogEscape(
  target: ProviderConnectionDialogEscapeTarget,
  close: () => void,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      close()
    }
  }
  target.addEventListener('keydown', listener)
  return () => target.removeEventListener('keydown', listener)
}
