import { describe, expect, it } from 'vitest'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import type { Market } from '@shared/types/market'
import { canShowTradingTicket } from './privateTradingAccess'

function account(
  markets: readonly Market[],
  accountId = 'one',
): ProviderAccountSummary {
  return {
    accountId,
    provider: 'binance',
    label: 'Principal',
    markets,
    apiKeySuffix: '••••1234',
    connection: 'connected',
  }
}

function snapshot(
  connection: SecuritySnapshot['connection'],
  state: SecuritySnapshot['state'] = 'unlocked',
  accounts: readonly ProviderAccountSummary[] = [account(['spot', 'futures'])],
): SecuritySnapshot {
  return {
    state,
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

describe('canShowTradingTicket', () => {
  it.each([
    [
      'the account is disconnected',
      snapshot({ state: 'disconnected' }),
      'spot' as const,
      false,
    ],
    [
      'the account is still connecting',
      snapshot({ accountId: 'one', state: 'connecting' }),
      'spot' as const,
      false,
    ],
    [
      'the session is locked',
      snapshot({ accountId: 'one', state: 'connected' }, 'locked'),
      'spot' as const,
      false,
    ],
    [
      'the account is connected in an unlocked session',
      snapshot({ accountId: 'one', state: 'connected' }),
      'spot' as const,
      true,
    ],
  ])('shows the ticket only when %s', (_condition, security, market, shown) => {
    expect(canShowTradingTicket(security, market)).toBe(shown)
  })

  it('hides the ticket for a market the connected account does not enable',
    () => {
      const security = snapshot(
        { accountId: 'one', state: 'connected' },
        'unlocked',
        [account(['spot'])],
      )

      expect(canShowTradingTicket(security, 'spot')).toBe(true)
      expect(canShowTradingTicket(security, 'futures')).toBe(false)
    },
  )

  it('hides the ticket when the connected account is no longer listed', () => {
    const security = snapshot(
      { accountId: 'missing', state: 'connected' },
      'unlocked',
      [account(['spot', 'futures'])],
    )

    expect(canShowTradingTicket(security, 'spot')).toBe(false)
  })
})
