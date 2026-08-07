import { describe, expect, it } from 'vitest'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { nextPrivateAccessAction } from './privateAccessFlow'

const accountOne: ProviderAccountSummary = {
  accountId: 'one',
  provider: 'binance',
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
