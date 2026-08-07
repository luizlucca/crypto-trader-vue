import type { SecuritySnapshot } from '@shared/contracts/security'

export type PrivateAccessAction
  = | { kind: 'open-providers' }
    | { kind: 'connect-account', accountId: string }
    | { kind: 'choose-account' }

/**
 * A failure toast stays actionable after the session locks or the account is
 * removed. Retrying has to re-check both before any dialog opens, because the
 * connect path bails out on the same conditions without closing it.
 */
export function canRetryProviderConnection(
  snapshot: SecuritySnapshot,
  accountId: string,
): boolean {
  return snapshot.state === 'unlocked'
    && snapshot.accounts.some(
      (account) => account.accountId === accountId,
    )
}

export function nextPrivateAccessAction(
  snapshot: SecuritySnapshot,
): PrivateAccessAction {
  if (snapshot.accounts.length === 0) {
    return { kind: 'open-providers' }
  }
  if (snapshot.accounts.length === 1) {
    return {
      kind: 'connect-account',
      accountId: snapshot.accounts[0].accountId,
    }
  }
  return { kind: 'choose-account' }
}
