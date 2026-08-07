import type { SecuritySnapshot } from '@shared/contracts/security'

export type PrivateAccessAction
  = | { kind: 'open-providers' }
    | { kind: 'connect-account', accountId: string }
    | { kind: 'choose-account' }

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
