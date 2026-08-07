import type { SecuritySnapshot } from '@shared/contracts/security'

export function canShowTradingTicket(snapshot: SecuritySnapshot): boolean {
  return snapshot.state === 'unlocked'
    && snapshot.connection.accountId !== undefined
    && snapshot.connection.state === 'connected'
}
