import type {
  AccountConnectionState,
  AccountFailureCode,
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import type { AppNotifications } from '@app/services/notifications'

export interface ProviderConnectionFeedback {
  tone: 'success' | 'error'
  message: string
  failureCode?: AccountFailureCode
}

export interface ProviderConnectionFeedbackActions {
  retry(accountId: string): void
  openSettings(accountId: string): void
}

export function normalizeAccountFailureCode(
  failureCode: AccountFailureCode | undefined,
): AccountFailureCode {
  return failureCode ?? 'unknown'
}

export function providerConnectionFailureMessage(
  failureCode: AccountFailureCode,
): string {
  switch (failureCode) {
    case 'credentials':
      return 'Não foi possível validar as credenciais da conta.'
    case 'permission':
      return 'A conta não tem a permissão necessária para conectar.'
    case 'clock':
      return 'A data e a hora do computador precisam ser ajustadas.'
    case 'network':
      return 'Não foi possível alcançar a Binance. Tente novamente.'
    case 'unknown':
      return 'Não foi possível conectar a conta agora. Tente novamente.'
  }
}

export function providerConnectionStateLabel(
  state: AccountConnectionState,
): string {
  switch (state) {
    case 'disconnected':
      return 'Desconectado'
    case 'connecting':
      return 'Conectando…'
    case 'connected':
      return 'Conectado'
    case 'failed':
      return 'Falhou'
  }
}

/**
 * The account list outlives the toast that announced the failure, so the row
 * has to carry the normalized reason itself: "falhou" alone does not tell the
 * operator whether to re-enter keys, grant a permission or fix the clock.
 */
export function providerAccountFailureMessage(
  account: Pick<ProviderAccountSummary, 'connection' | 'failureCode'>,
): string | undefined {
  if (account.connection !== 'failed') {
    return undefined
  }
  return providerConnectionFailureMessage(
    normalizeAccountFailureCode(account.failureCode),
  )
}

export function providerConnectionFeedback(
  snapshot: SecuritySnapshot,
  accountId: string,
): ProviderConnectionFeedback | undefined {
  const connection = snapshot.connection
  if (snapshot.state !== 'unlocked' || connection.accountId !== accountId) {
    return undefined
  }

  const account = snapshot.accounts.find(
    (candidate) => candidate.accountId === accountId,
  )
  if (!account) {
    return undefined
  }

  if (connection.state === 'connected') {
    return {
      tone: 'success',
      message: `Conectado à Binance — ${account.label}`,
    }
  }
  if (connection.state === 'failed') {
    const failureCode = normalizeAccountFailureCode(connection.failureCode)
    return {
      tone: 'error',
      message: providerConnectionFailureMessage(failureCode),
      failureCode,
    }
  }
  return undefined
}

export function notifyProviderConnectionFeedback(
  snapshot: SecuritySnapshot,
  accountId: string,
  notifications: Pick<AppNotifications, 'notify'>,
  actions: ProviderConnectionFeedbackActions,
): ProviderConnectionFeedback | undefined {
  const feedback = providerConnectionFeedback(snapshot, accountId)
  if (!feedback) {
    return undefined
  }

  notifyProviderConnectionOutcome(
    accountId,
    feedback,
    notifications,
    actions,
  )
  return feedback
}

export function notifyProviderConnectionFailure(
  accountId: string,
  failureCode: AccountFailureCode | undefined,
  notifications: Pick<AppNotifications, 'notify'>,
  actions: ProviderConnectionFeedbackActions,
): void {
  const normalizedFailureCode = normalizeAccountFailureCode(failureCode)
  notifyProviderConnectionOutcome(accountId, {
    tone: 'error',
    message: providerConnectionFailureMessage(normalizedFailureCode),
    failureCode: normalizedFailureCode,
  }, notifications, actions)
}

function notifyProviderConnectionOutcome(
  accountId: string,
  feedback: ProviderConnectionFeedback,
  notifications: Pick<AppNotifications, 'notify'>,
  actions: ProviderConnectionFeedbackActions,
): void {
  notifications.notify({
    tone: feedback.tone,
    message: feedback.message,
    ...(feedback.tone === 'error'
      ? {
          retry: () => actions.retry(accountId),
          openSettings: () => actions.openSettings(accountId),
        }
      : {}),
  })
}
