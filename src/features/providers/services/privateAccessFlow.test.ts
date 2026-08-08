import { describe, expect, it } from 'vitest'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import {
  canRetryProviderConnection,
  nextPrivateAccessAction,
} from './privateAccessFlow'

const accountOne: ProviderAccountSummary = {
  accountId: 'one',
  provider: 'binance',
  environment: 'live',
  label: 'Principal',
  markets: ['spot'],
  apiKeySuffix: '••••1234',
  connection: 'disconnected',
}

const accountTwo: ProviderAccountSummary = {
  ...accountOne,
  accountId: 'two',
  label: 'Reserva',
}

function snapshotWith(
  accounts: readonly ProviderAccountSummary[],
): SecuritySnapshot {
  return {
    state: 'unlocked',
    hasVault: true,
    accounts,
    connection: { state: 'disconnected' },
    environment: 'live',
    preferences: {
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 15,
      closeAction: 'quit-and-lock',
    },
  }
}

describe('nextPrivateAccessAction', () => {
  it('opens provider settings when the unlocked vault has no accounts', () => {
    expect(nextPrivateAccessAction(snapshotWith([]))).toEqual({
      kind: 'open-providers',
    })
  })

  it('connects the only account without asking for a selection', () => {
    expect(nextPrivateAccessAction(snapshotWith([accountOne]))).toEqual({
      kind: 'connect-account',
      accountId: 'one',
    })
  })

  it('asks the user to choose when more than one account is available', () => {
    expect(nextPrivateAccessAction(snapshotWith([accountOne, accountTwo])))
      .toEqual({ kind: 'choose-account' })
  })
})

describe('canRetryProviderConnection', () => {
  it('allows a retry for an account of the unlocked session', () => {
    expect(canRetryProviderConnection(snapshotWith([accountOne]), 'one'))
      .toBe(true)
  })

  it('refuses a retry for an account removed since the failure', () => {
    expect(canRetryProviderConnection(snapshotWith([accountTwo]), 'one'))
      .toBe(false)
    expect(canRetryProviderConnection(snapshotWith([]), 'one')).toBe(false)
  })

  it.each([
    ['locked' as const],
    ['unlocking' as const],
    ['setup-required' as const],
  ])('refuses a retry while the session is %s', (state) => {
    expect(canRetryProviderConnection(
      { ...snapshotWith([accountOne]), state },
      'one',
    )).toBe(false)
  })
})
