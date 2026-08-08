import type { SecuritySnapshot } from '@shared/contracts/security'
import type { Market } from '@shared/types/market'

/**
 * The session-wide connection state is not enough: a Spot-only account stays
 * connected while the workspace switches to Futures, and the ticket would be
 * rendered for a market whose credentials were never validated.
 */
export function canShowTradingTicket(
  snapshot: SecuritySnapshot,
  market: Market,
): boolean {
  if (snapshot.state !== 'unlocked') {
    return false
  }
  const { accountId, state } = snapshot.connection
  if (accountId === undefined || state !== 'connected') {
    return false
  }
  const account = snapshot.accounts.find(
    (candidate) => candidate.accountId === accountId,
  )
  return account !== undefined && account.markets.includes(market)
}
