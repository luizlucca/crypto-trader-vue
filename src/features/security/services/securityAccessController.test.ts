import { describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import { createSecurityAccessController } from './securityAccessController'

const snapshot: SecuritySnapshot = {
  state: 'unlocked',
  hasVault: true,
  accounts: [],
  preferences: {
    lockOnMinimize: true,
    lockOnSuspend: true,
    idleTimeoutMinutes: 15,
    closeAction: 'quit-and-lock',
  },
}

function createSession() {
  return { request: vi.fn().mockResolvedValue(snapshot) }
}

describe('createSecurityAccessController', () => {
  it('sends setup only after confirmation and clears values', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'
    controller.confirmation.value = 'Abcdef1!'

    await expect(controller.submitSetup()).resolves.toBe(true)

    expect(session.request).toHaveBeenCalledWith({
      kind: 'setup',
      password: 'Abcdef1!',
    })
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
  })

  it('keeps values after different confirmation', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'
    controller.confirmation.value = 'Different1!'

    await expect(controller.submitSetup()).resolves.toBe(false)

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe('As senhas não coincidem.')
  })

  it('sends a lock command and clears local form values', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'

    await controller.lock()

    expect(session.request).toHaveBeenCalledWith({ kind: 'lock' })
    expect(controller.password.value).toBe('')
  })
})
