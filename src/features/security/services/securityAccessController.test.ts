import { describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import { createSecurityAccessController } from './securityAccessController'

const snapshot: SecuritySnapshot = {
  state: 'unlocked',
  hasVault: true,
  accounts: [],
  connection: { state: 'disconnected' },
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
  it('returns the setup snapshot after confirmation and clears values', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'
    controller.confirmation.value = 'Abcdef1!'

    await expect(controller.submitSetup()).resolves.toEqual(snapshot)

    expect(session.request).toHaveBeenCalledWith({
      kind: 'setup',
      password: 'Abcdef1!',
    })
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
  })

  it('returns the unlock snapshot after a password is provided', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'

    await expect(controller.submitUnlock()).resolves.toEqual(snapshot)

    expect(session.request).toHaveBeenCalledWith({
      kind: 'unlock',
      password: 'Abcdef1!',
    })
    expect(controller.password.value).toBe('')
  })

  it('keeps values after different confirmation', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'
    controller.confirmation.value = 'Different1!'

    await expect(controller.submitSetup()).resolves.toBeUndefined()

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe('As senhas não coincidem.')
  })

  it('resets the vault when APAGAR is confirmed', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.setMode('reset')
    controller.confirmation.value = 'APAGAR'

    await expect(controller.submitReset()).resolves.toEqual(snapshot)

    expect(session.request).toHaveBeenCalledWith({
      kind: 'reset-vault',
      confirmation: 'APAGAR',
    })
    expect(controller.confirmation.value).toBe('')
  })

  it('does not reset the vault without the explicit confirmation', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.setMode('reset')
    controller.confirmation.value = 'apagar'

    await expect(controller.submitReset()).resolves.toBeUndefined()

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe('Digite APAGAR para confirmar a remoção.')
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
