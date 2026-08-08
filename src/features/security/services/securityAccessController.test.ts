import { describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import { createSecurityAccessController } from './securityAccessController'

const snapshot: SecuritySnapshot = {
  state: 'unlocked',
  hasVault: true,
  accounts: [],
  connection: { state: 'disconnected' },
  environment: 'live',
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

  it('clears setup fields after different confirmation', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.password.value = 'Abcdef1!'
    controller.confirmation.value = 'Different1!'

    await expect(controller.submitSetup()).resolves.toBeUndefined()

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe('As senhas não coincidem.')
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
  })

  it(
    'sends a password-change request and clears every sensitive field',
    async () => {
      const session = createSession()
      const controller = createSecurityAccessController(session)
      controller.setMode('change-password')
      controller.currentPassword.value = 'Current1!'
      controller.password.value = 'Nextpass1!'
      controller.confirmation.value = 'Nextpass1!'

      await expect(controller.submitPasswordChange())
        .resolves.toEqual(snapshot)

      expect(session.request).toHaveBeenCalledWith({
        kind: 'change-password',
        currentPassword: 'Current1!',
        nextPassword: 'Nextpass1!',
      })
      expect(controller.currentPassword.value).toBe('')
      expect(controller.password.value).toBe('')
      expect(controller.confirmation.value).toBe('')
    },
  )

  it('clears password-change fields when confirmation differs', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.setMode('change-password')
    controller.currentPassword.value = 'Current1!'
    controller.password.value = 'Nextpass1!'
    controller.confirmation.value = 'Different1!'

    await expect(controller.submitPasswordChange()).resolves.toBeUndefined()

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe('As senhas não coincidem.')
    expect(controller.currentPassword.value).toBe('')
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
  })

  it('clears fields after a local password-validation failure', async () => {
    const session = createSession()
    const controller = createSecurityAccessController(session)
    controller.setMode('change-password')
    controller.currentPassword.value = 'Current1!'
    controller.password.value = 'short'
    controller.confirmation.value = 'short'

    await expect(controller.submitPasswordChange()).resolves.toBeUndefined()

    expect(session.request).not.toHaveBeenCalled()
    expect(controller.error.value).toBe(
      'Use uma senha forte com ao menos 8 caracteres.',
    )
    expect(controller.currentPassword.value).toBe('')
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
  })

  it('rejects an invalid current password before it reaches the session',
    async () => {
      const session = createSession()
      const controller = createSecurityAccessController(session)
      controller.setMode('change-password')
      controller.currentPassword.value = 'short'
      controller.password.value = 'Nextpass1!'
      controller.confirmation.value = 'Nextpass1!'

      await expect(controller.submitPasswordChange()).resolves.toBeUndefined()

      expect(session.request).not.toHaveBeenCalled()
      expect(controller.error.value).toBe(
        'Use uma senha forte com ao menos 8 caracteres.',
      )
      expect(controller.currentPassword.value).toBe('')
      expect(controller.password.value).toBe('')
      expect(controller.confirmation.value).toBe('')
    },
  )

  it('clears password-change fields after a rejected request', async () => {
    const session = {
      request: vi.fn().mockRejectedValue(new Error('wrong password')),
    }
    const controller = createSecurityAccessController(session)
    controller.setMode('change-password')
    controller.currentPassword.value = 'Current1!'
    controller.password.value = 'Nextpass1!'
    controller.confirmation.value = 'Nextpass1!'

    await expect(controller.submitPasswordChange()).resolves.toBeUndefined()

    expect(controller.error.value).toBe(
      'Não foi possível concluir a operação de segurança.',
    )
    expect(controller.currentPassword.value).toBe('')
    expect(controller.password.value).toBe('')
    expect(controller.confirmation.value).toBe('')
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
    expect(controller.error.value).toBe(
      'Digite APAGAR para confirmar a remoção.',
    )
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
