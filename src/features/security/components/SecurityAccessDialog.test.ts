// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import SecurityAccessDialog from './SecurityAccessDialog.vue'

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

const session = vi.hoisted(() => ({
  request: vi.fn(),
}))

vi.mock('@security/services/securitySession', () => ({
  useSecuritySession: () => session,
}))

function mountPasswordChange() {
  return mount(SecurityAccessDialog, {
    attachTo: document.body,
    props: {
      open: true,
      state: 'unlocked',
      mode: 'change-password',
    },
  })
}

function form(): HTMLFormElement {
  const element = document.body.querySelector<HTMLFormElement>(
    '.security-access-form',
  )
  if (!element) {
    throw new Error('Security access form was not rendered')
  }
  return element
}

function inputs(): HTMLInputElement[] {
  return Array.from(document.body.querySelectorAll<HTMLInputElement>(
    '.security-access-form input',
  ))
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined
  const promise = new Promise<Value>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

async function fillPasswords(
  wrapper: ReturnType<typeof mountPasswordChange>,
  currentPassword: string,
  nextPassword: string,
): Promise<void> {
  const passwordInputs = inputs()
  passwordInputs[0].value = currentPassword
  passwordInputs[0].dispatchEvent(new Event('input'))
  passwordInputs[1].value = nextPassword
  passwordInputs[1].dispatchEvent(new Event('input'))
  passwordInputs[2].value = nextPassword
  passwordInputs[2].dispatchEvent(new Event('input'))
  await nextTick()
}

describe('SecurityAccessDialog password rotation', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function resetSession(): void {
    session.request.mockReset().mockResolvedValue(snapshot)
  }

  it('closes and clears a rotation form when the session locks', async () => {
    resetSession()
    const wrapper = mountPasswordChange()
    await fillPasswords(wrapper, 'Current1!', 'Nextpass1!')

    await wrapper.setProps({ state: 'locked' })

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('passwordChanged')).toBeUndefined()
    expect(inputs().map((input) => input.value))
      .toEqual(['', '', ''])
  })

  it('suppresses a pending rotation result after a manual lock', async () => {
    const pendingSnapshot = deferred<SecuritySnapshot>()
    session.request.mockReset().mockReturnValue(pendingSnapshot.promise)
    const wrapper = mountPasswordChange()
    await fillPasswords(wrapper, 'Current1!', 'Nextpass1!')

    form().requestSubmit()
    await nextTick()
    await wrapper.setProps({ state: 'locked' })
    pendingSnapshot.resolve(snapshot)
    await nextTick()

    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('passwordChanged')).toBeUndefined()
    expect(inputs().map((input) => input.value)).toEqual(['', '', ''])
  })

  it('submits a short new password through the controller and clears it',
    async () => {
      resetSession()
      const wrapper = mountPasswordChange()
      await fillPasswords(wrapper, 'Current1!', 'short')

      form().requestSubmit()
      await nextTick()

      expect(session.request).not.toHaveBeenCalled()
      expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
        'Use uma senha forte com ao menos 8 caracteres.',
      )
      expect(inputs().map((input) => input.value))
        .toEqual(['', '', ''])
    },
  )

  it('submits an empty password through the controller and clears it',
    async () => {
      resetSession()
      mountPasswordChange()

      form().requestSubmit()
      await nextTick()

      expect(session.request).not.toHaveBeenCalled()
      expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
        'Use uma senha forte com ao menos 8 caracteres.',
      )
      expect(inputs().map((input) => input.value))
        .toEqual(['', '', ''])
    },
  )
})
