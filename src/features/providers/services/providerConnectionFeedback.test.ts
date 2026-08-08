import { describe, expect, it } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import { createNotifications } from '@app/services/notifications'
import {
  notifyProviderConnectionFeedback,
  providerAccountFailureMessage,
  providerConnectionFeedback,
  providerConnectionStateLabel,
} from './providerConnectionFeedback'

function snapshotWith(
  connection: SecuritySnapshot['connection'],
): SecuritySnapshot {
  return {
    state: 'unlocked',
    hasVault: true,
    accounts: [{
      accountId: 'account-one',
      provider: 'binance',
      environment: 'live',
      label: 'Principal',
      markets: ['spot'],
      apiKeySuffix: '••••1234',
      connection: connection.state,
    }],
    connection,
    environment: 'live',
    preferences: {
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 15,
      closeAction: 'quit-and-lock',
    },
  }
}

describe('provider account status', () => {
  it.each([
    ['disconnected' as const, 'Desconectado'],
    ['connecting' as const, 'Conectando…'],
    ['connected' as const, 'Conectado'],
    ['failed' as const, 'Falhou'],
  ])('labels the %s state in the operator language', (state, label) => {
    expect(providerConnectionStateLabel(state)).toBe(label)
  })

  it.each([
    [
      'credentials' as const,
      'Não foi possível validar as credenciais da conta.',
    ],
    [
      'permission' as const,
      'A conta não tem a permissão necessária para conectar.',
    ],
    [
      'clock' as const,
      'A data e a hora do computador precisam ser ajustadas.',
    ],
    [
      'network' as const,
      'Não foi possível alcançar a Binance. Tente novamente.',
    ],
  ])('explains a %s failure on the account itself', (failureCode, message) => {
    expect(providerAccountFailureMessage({
      connection: 'failed',
      failureCode,
    })).toBe(message)
  })

  it('falls back to the unknown reason when the code is absent', () => {
    expect(providerAccountFailureMessage({ connection: 'failed' }))
      .toBe('Não foi possível conectar a conta agora. Tente novamente.')
  })

  it.each([
    ['disconnected' as const],
    ['connecting' as const],
    ['connected' as const],
  ])('explains nothing while the account is %s', (connection) => {
    expect(providerAccountFailureMessage({
      connection,
      failureCode: 'credentials',
    })).toBeUndefined()
  })
})

describe('provider connection feedback', () => {
  it('reports a successful connection only for its exact account', () => {
    expect(providerConnectionFeedback(snapshotWith({
      accountId: 'account-one',
      state: 'connected',
    }), 'account-one')).toEqual({
      tone: 'success',
      message: 'Conectado à Binance — Principal',
    })

    expect(providerConnectionFeedback(snapshotWith({
      accountId: 'another-account',
      state: 'connected',
    }), 'account-one')).toBeUndefined()
  })

  it.each([
    ['credentials', 'Não foi possível validar as credenciais da conta.'],
    ['permission', 'A conta não tem a permissão necessária para conectar.'],
    ['clock', 'A data e a hora do computador precisam ser ajustadas.'],
    ['network', 'Não foi possível alcançar a Binance. Tente novamente.'],
    ['unknown', 'Não foi possível conectar a conta agora. Tente novamente.'],
    [undefined, 'Não foi possível conectar a conta agora. Tente novamente.'],
  ] as const)(
    'normalizes the %s connection failure',
    (failureCode, message) => {
      expect(providerConnectionFeedback(snapshotWith({
        accountId: 'account-one',
        state: 'failed',
        ...(failureCode === undefined ? {} : { failureCode }),
      }), 'account-one')).toEqual({
        tone: 'error',
        message,
        failureCode: failureCode ?? 'unknown',
      })
    },
  )

  it(
    'binds retry and settings actions to the exact failed account once',
    () => {
      const notifications = createNotifications()
      const retried: string[] = []
      const opened: string[] = []
      const feedback = notifyProviderConnectionFeedback(
        snapshotWith({
          accountId: 'account-one',
          state: 'failed',
          failureCode: 'credentials',
        }),
        'account-one',
        notifications,
        {
          retry: (accountId) => retried.push(accountId),
          openSettings: (accountId) => opened.push(accountId),
        },
      )
      const notificationId = notifications.notifications.value[0]?.id

      expect(feedback?.failureCode).toBe('credentials')
      expect(notificationId).toBeDefined()
      notifications.retry(notificationId!)
      notifications.retry(notificationId!)

      expect(retried).toEqual(['account-one'])
      expect(opened).toEqual([])

      notifyProviderConnectionFeedback(
        snapshotWith({
          accountId: 'account-one',
          state: 'failed',
          failureCode: 'credentials',
        }),
        'account-one',
        notifications,
        {
          retry: (accountId) => retried.push(accountId),
          openSettings: (accountId) => opened.push(accountId),
        },
      )
      const settingsNotificationId = notifications.notifications.value[0]?.id
      notifications.openSettings(settingsNotificationId!)
      notifications.openSettings(settingsNotificationId!)

      expect(opened).toEqual(['account-one'])
    },
  )
})
