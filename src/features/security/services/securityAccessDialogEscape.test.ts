import { describe, expect, it } from 'vitest'
import {
  bindSecurityAccessDialogEscape,
  type SecurityAccessDialogEscapeTarget,
} from './securityAccessDialogEscape'

function createDocumentTarget(): {
  dispatch(key: string): void
  listenerCount(): number
  target: SecurityAccessDialogEscapeTarget
} {
  const listeners = new Set<(event: KeyboardEvent) => void>()
  return {
    target: {
      addEventListener: (
        _type: 'keydown',
        listener: (event: KeyboardEvent) => void,
      ) => listeners.add(listener),
      removeEventListener: (
        _type: 'keydown',
        listener: (event: KeyboardEvent) => void,
      ) => listeners.delete(listener),
    },
    dispatch(key) {
      listeners.forEach((listener) => listener({ key } as KeyboardEvent))
    },
    listenerCount: () => listeners.size,
  }
}

describe('security access dialog Escape binding', () => {
  it('does not close from Escape while a security request is pending', () => {
    const documentTarget = createDocumentTarget()
    let pending = true
    let closes = 0
    bindSecurityAccessDialogEscape(documentTarget.target, () => {
      closes += 1
    }, () => pending)

    documentTarget.dispatch('Escape')
    pending = false
    documentTarget.dispatch('Escape')

    expect(closes).toBe(1)
  })

  it('releases its listener when the dialog closes or unmounts', () => {
    const documentTarget = createDocumentTarget()
    const release = bindSecurityAccessDialogEscape(
      documentTarget.target,
      () => undefined,
      () => false,
    )

    release()
    release()

    expect(documentTarget.listenerCount()).toBe(0)
  })
})
