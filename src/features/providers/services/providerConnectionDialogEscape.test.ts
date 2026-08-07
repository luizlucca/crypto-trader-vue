import { describe, expect, it } from 'vitest'
import {
  bindProviderConnectionDialogEscape,
  type ProviderConnectionDialogEscapeTarget,
} from './providerConnectionDialogEscape'

function createDocumentTarget(): {
  dispatch(key: string): void
  listenerCount(): number
  target: ProviderConnectionDialogEscapeTarget
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

describe('provider connection dialog Escape binding', () => {
  it('closes from document Escape without focus inside the dialog', () => {
    const documentTarget = createDocumentTarget()
    let closes = 0
    bindProviderConnectionDialogEscape(documentTarget.target, () => {
      closes += 1
    })

    documentTarget.dispatch('Escape')

    expect(closes).toBe(1)
  })

  it('removes its document listener when the dialog closes', () => {
    const documentTarget = createDocumentTarget()
    const release = bindProviderConnectionDialogEscape(
      documentTarget.target,
      () => undefined,
    )

    release()

    expect(documentTarget.listenerCount()).toBe(0)
  })
})
