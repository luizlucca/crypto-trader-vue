export interface SecurityAccessDialogEscapeTarget {
  addEventListener(
    type: 'keydown',
    listener: (event: KeyboardEvent) => void,
  ): void
  removeEventListener(
    type: 'keydown',
    listener: (event: KeyboardEvent) => void,
  ): void
}

export function bindSecurityAccessDialogEscape(
  target: SecurityAccessDialogEscapeTarget,
  close: () => void,
  isPending: () => boolean,
): () => void {
  const listener = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !isPending()) {
      close()
    }
  }
  target.addEventListener('keydown', listener)
  return () => target.removeEventListener('keydown', listener)
}
