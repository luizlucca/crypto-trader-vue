import { describe, expect, it } from 'vitest'
import type { SecuritySnapshot } from '@shared/contracts/security'
import { canShowTradingTicket } from './privateTradingAccess'

function snapshot(
  connection: SecuritySnapshot['connection'],
  state: SecuritySnapshot['state'] = 'unlocked',
): SecuritySnapshot {
  return {
    state,
    hasVault: true,
    accounts: [],
    connection,
    preferences: {
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 15,
      closeAction: 'quit-and-lock',
    },
  }
}

describe('canShowTradingTicket', () => {
  it.each([
    ['the account is disconnected', snapshot({ state: 'disconnected' }), false],
    ['the account is still connecting', snapshot({
      accountId: 'one',
      state: 'connecting',
    }), false],
    ['the session is locked', snapshot({
      accountId: 'one',
      state: 'connected',
    }, 'locked'), false],
    ['the account is connected in an unlocked session', snapshot({
      accountId: 'one',
      state: 'connected',
    }), true],
  ])('shows the ticket only when %s', (_condition, security, visible) => {
    expect(canShowTradingTicket(security)).toBe(visible)
  })
})
