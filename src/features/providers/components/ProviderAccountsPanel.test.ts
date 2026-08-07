// @vitest-environment happy-dom
/* eslint-disable @stylistic/max-len */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import ProviderAccountsPanel from './ProviderAccountsPanel.vue'

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  request: vi.fn(),
}))

vi.mock('@app/services/notifications', () => ({
  useNotifications: () => ({ notify: mocks.notify }),
}))

vi.mock('@security/services/securitySession', () => ({
  useSecuritySession: () => ({ request: mocks.request }),
}))

const account = {
  accountId: 'account-one',
  provider: 'binance' as const,
  label: 'Principal',
  markets: ['spot'] as const,
  apiKeySuffix: '••••1234',
  connection: 'disconnected' as const,
}

const accountTwo = {
  ...account,
  accountId: 'account-two',
  label: 'Reserva',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function snapshotWith(
  connection: SecuritySnapshot['connection'],
  accounts: readonly ProviderAccountSummary[] = [account],
): SecuritySnapshot {
  return {
    state: 'unlocked',
    hasVault: true,
    accounts,
    connection,
    preferences: {
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 15,
      closeAction: 'quit-and-lock',
    },
  }
}

const catalogStub = {
  emits: ['cancel', 'select'],
  template: '<button class="select-binance" @click="$emit(\'select\', \'binance\')" />',
}

function mountPanel(snapshot: SecuritySnapshot) {
  return mount(ProviderAccountsPanel, {
    props: { snapshot, open: true },
    global: {
      stubs: {
        ProviderCatalog: catalogStub,
        BinanceAccountForm: {
          props: ['account', 'pending'],
          emits: ['cancel', 'save'],
          template: `
            <div>
              <button class="save-account" @click="$emit('save', { label: 'Nova', markets: ['spot'], apiKey: 'key-12345678', apiSecret: 'secret-12345678', validateAndConnect: true })" />
              <button class="save-without-validation" @click="$emit('save', { label: 'Nova', markets: ['spot'], apiKey: 'key-12345678', apiSecret: 'secret-12345678', validateAndConnect: false })" />
            </div>
          `,
        },
      },
    },
  })
}

describe('ProviderAccountsPanel draft lifetime', () => {
  beforeEach(() => {
    mocks.notify.mockReset()
    mocks.request.mockReset()
  })

  it('drops a typed credential draft when the settings layer closes', async () => {
    // The settings layer is hidden with v-show, so nothing unmounts this panel
    // on close: the real form is mounted here to prove the secret is gone.
    const wrapper = mount(ProviderAccountsPanel, {
      props: { snapshot: snapshotWith({ state: 'disconnected' }), open: true },
      global: { stubs: { ProviderCatalog: catalogStub } },
    })

    await wrapper.get('.create-theme-button').trigger('click')
    await wrapper.get('.select-binance').trigger('click')
    const secret = wrapper.get('.provider-account-form input[type="password"]')
    await secret.setValue('super-secret-value')
    expect((secret.element as HTMLInputElement).value).toBe('super-secret-value')

    await wrapper.setProps({ open: false })

    expect(wrapper.find('.provider-account-form').exists()).toBe(false)
    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0)

    await wrapper.setProps({ open: true })

    expect(wrapper.find('.provider-account-form').exists()).toBe(false)
    expect(wrapper.find('.provider-account-list').exists()).toBe(true)
  })
})

describe('ProviderAccountsPanel failure diagnosis', () => {
  beforeEach(() => {
    mocks.notify.mockReset()
    mocks.request.mockReset()
  })

  it.each([
    ['credentials' as const, 'Não foi possível validar as credenciais da conta.'],
    ['permission' as const, 'A conta não tem a permissão necessária para conectar.'],
    ['clock' as const, 'A data e a hora do computador precisam ser ajustadas.'],
    ['network' as const, 'Não foi possível alcançar a Binance. Tente novamente.'],
  ])('names the %s reason instead of the generic failed state', (failureCode, message) => {
    const wrapper = mountPanel(snapshotWith(
      { accountId: 'account-one', state: 'failed', failureCode },
      [{ ...account, connection: 'failed', failureCode }],
    ))

    expect(wrapper.get('.provider-account-failure').text()).toBe(message)
    expect(wrapper.get('.provider-connection').text()).toBe('Falhou')
  })

  it('shows no failure reason for an account that has not failed', () => {
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    expect(wrapper.find('.provider-account-failure').exists()).toBe(false)
    expect(wrapper.get('.provider-connection').text()).toBe('Desconectado')
  })
})

describe('ProviderAccountsPanel connection feedback', () => {
  beforeEach(() => {
    mocks.notify.mockReset()
    mocks.request.mockReset()
  })

  it('notifies a successful explicit connection and clears its loading state', async () => {
    mocks.request.mockResolvedValueOnce(snapshotWith({
      accountId: 'account-one',
      state: 'connected',
    }))
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    await wrapper.get('.provider-connect-button').trigger('click')
    await flushPromises()

    expect(mocks.notify).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Conectado à Binance — Principal',
    })
    expect(wrapper.get('.provider-connect-button').text()).toBe('Conectar')
  })

  it('serializes two account selections while the first request is pending', async () => {
    const first = deferred<SecuritySnapshot>()
    const ignoredSecond = deferred<SecuritySnapshot>()
    mocks.request
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(ignoredSecond.promise)
    const wrapper = mountPanel(snapshotWith(
      { state: 'disconnected' },
      [account, accountTwo],
    ))
    const buttons = wrapper.findAll('.provider-connect-button')

    await buttons[0].trigger('click')
    expect(buttons[0].text()).toBe('Conectando…')
    expect(buttons[1].attributes('disabled')).toBeDefined()
    await buttons[1].trigger('click')

    expect(mocks.request).toHaveBeenCalledTimes(1)

    ignoredSecond.resolve(snapshotWith({
      accountId: 'account-two',
      state: 'connected',
    }, [account, accountTwo]))
    await flushPromises()
    first.resolve(snapshotWith({
      accountId: 'account-one',
      state: 'connected',
    }, [account, accountTwo]))
    await flushPromises()

    expect(mocks.notify).toHaveBeenCalledTimes(1)
    expect(mocks.notify).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Conectado à Binance — Principal',
    })
  })

  it('notifies a failed connection with exact retry and settings actions', async () => {
    const failed = snapshotWith({
      accountId: 'account-one',
      state: 'failed',
      failureCode: 'credentials',
    })
    mocks.request.mockResolvedValue(failed)
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    await wrapper.get('.provider-connect-button').trigger('click')
    await flushPromises()
    const notification = mocks.notify.mock.calls[0][0]

    expect(notification).toMatchObject({
      tone: 'error',
      message: 'Não foi possível validar as credenciais da conta.',
    })
    notification.retry()
    await flushPromises()
    notification.openSettings()
    await wrapper.vm.$nextTick()

    expect(mocks.request).toHaveBeenNthCalledWith(2, {
      kind: 'connect-account',
      accountId: 'account-one',
    })
    expect(wrapper.find('.save-account').exists()).toBe(true)
  })

  it('turns a rejected connect request into unknown feedback without leaving loading', async () => {
    mocks.request.mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    await wrapper.get('.provider-connect-button').trigger('click')
    await flushPromises()

    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      tone: 'error',
      message: 'Não foi possível conectar a conta agora. Tente novamente.',
    }))
    expect(wrapper.get('.provider-connect-button').text()).toBe('Conectar')
  })

  it('suppresses a connection rejection that arrives after the session locks',
    async () => {
      const pending = deferred<SecuritySnapshot>()
      mocks.request.mockReturnValueOnce(pending.promise)
      const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

      await wrapper.get('.provider-connect-button').trigger('click')
      await wrapper.setProps({
        snapshot: {
          ...snapshotWith({ state: 'disconnected' }),
          state: 'locked',
          accounts: [],
        },
      })
      pending.reject(new Error('offline'))
      await flushPromises()

      expect(mocks.notify).not.toHaveBeenCalled()
    },
  )

  it('uses the returned connection account id when saving a new account to validate', async () => {
    mocks.request.mockResolvedValueOnce(snapshotWith({
      accountId: 'new-account',
      state: 'connected',
    }, [{ ...account, accountId: 'new-account', label: 'Nova' }]))
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    await wrapper.get('.create-theme-button').trigger('click')
    await wrapper.get('.select-binance').trigger('click')
    await wrapper.get('.save-account').trigger('click')
    await flushPromises()

    expect(mocks.request).toHaveBeenCalledWith({
      kind: 'save-binance-account',
      draft: expect.objectContaining({ validateAndConnect: true }),
    })
    expect(mocks.notify).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Conectado à Binance — Nova',
    })
  })

  it('does not show connection feedback when saving without validation', async () => {
    mocks.request.mockResolvedValueOnce(snapshotWith({
      accountId: 'account-one',
      state: 'connected',
    }))
    const wrapper = mountPanel(snapshotWith({ state: 'disconnected' }))

    await wrapper.get('.create-theme-button').trigger('click')
    await wrapper.get('.select-binance').trigger('click')
    await wrapper.get('.save-without-validation').trigger('click')
    await flushPromises()

    expect(mocks.notify).not.toHaveBeenCalled()
  })
})
