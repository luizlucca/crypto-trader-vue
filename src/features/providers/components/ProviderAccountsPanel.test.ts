// @vitest-environment happy-dom
/* eslint-disable @stylistic/max-len */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
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

function snapshotWith(
  connection: SecuritySnapshot['connection'],
  accounts = [account],
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

function mountPanel(snapshot: SecuritySnapshot) {
  return mount(ProviderAccountsPanel, {
    props: { snapshot },
    global: {
      stubs: {
        ProviderCatalog: {
          emits: ['cancel', 'select'],
          template: '<button class="select-binance" @click="$emit(\'select\', \'binance\')" />',
        },
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
