import { describe, expect, it } from 'vitest'
import type {
  ProviderAccountSummary,
  ProviderConnectionSnapshot,
} from '@shared/contracts/security'
import type { MarketEnvironment } from '@shared/types/market'
import {
  activeEnvironment,
  environmentLabel,
  oppositeEnvironment,
  siblingAccount,
} from './providerEnvironment'

function account(
  accountId: string,
  environment: MarketEnvironment,
): ProviderAccountSummary {
  return {
    accountId,
    provider: 'binance',
    environment,
    label: `Conta ${accountId}`,
    markets: ['spot'],
    apiKeySuffix: '••••1234',
    connection: 'disconnected',
  }
}

const live = account('live-one', 'live')
const test = account('test-one', 'test')

function connection(
  accountId: string | undefined,
  state: ProviderConnectionSnapshot['state'] = 'connected',
): ProviderConnectionSnapshot {
  return accountId ? { accountId, state } : { state: 'disconnected' }
}

describe('opposite environment', () => {
  it('pairs the two environments', () => {
    expect(oppositeEnvironment('live')).toBe('test')
    expect(oppositeEnvironment('test')).toBe('live')
  })

  it('is its own inverse', () => {
    expect(oppositeEnvironment(oppositeEnvironment('live'))).toBe('live')
    expect(oppositeEnvironment(oppositeEnvironment('test'))).toBe('test')
  })
})

describe('active environment', () => {
  it('is production when nothing is connected', () => {
    expect(activeEnvironment([live, test], connection(undefined)))
      .toBe('live')
  })

  it('follows the connected account', () => {
    expect(activeEnvironment([live, test], connection('test-one')))
      .toBe('test')
    expect(activeEnvironment([live, test], connection('live-one')))
      .toBe('live')
  })

  /*
   * The case that protects the operator. Deriving this from a *healthy*
   * connection would send the app back to production the instant a testnet
   * connection dropped — reopening live streams and taking the badge down
   * while the operator still believes they are in a sandbox.
   */
  it('stays on test while the test connection is failed or connecting', () => {
    expect(activeEnvironment([live, test], connection('test-one', 'failed')))
      .toBe('test')
    expect(
      activeEnvironment([live, test], connection('test-one', 'connecting')),
    ).toBe('test')
  })

  it('falls back to production when the account is gone', () => {
    expect(activeEnvironment([live], connection('test-one'))).toBe('live')
  })
})

describe('sibling account', () => {
  it('finds the account registered for the other environment', () => {
    expect(siblingAccount([live, test], 'live')?.accountId).toBe('test-one')
    expect(siblingAccount([live, test], 'test')?.accountId).toBe('live-one')
  })

  it('is undefined when only one environment is registered', () => {
    expect(siblingAccount([live], 'live')).toBeUndefined()
    expect(siblingAccount([], 'live')).toBeUndefined()
  })

  it('never returns an account from the environment already active', () => {
    const two = account('live-two', 'live')
    expect(siblingAccount([live, two], 'live')).toBeUndefined()
  })

  /*
   * Provider-blind: the question is whether there is anywhere to switch to,
   * and an account at another exchange answers it. Filtering by provider —
   * which this used to do, defaulting to Binance — would report "no sibling"
   * to an operator holding one, and offer to register a duplicate.
   */
  it('accepts an account of another provider as the sibling', () => {
    const foreign = {
      ...account('other', 'test'),
      provider: 'kraken' as ProviderAccountSummary['provider'],
    }
    expect(siblingAccount([live, foreign], 'live')?.accountId).toBe('other')
  })
})

describe('environment label', () => {
  it('names both environments in Portuguese', () => {
    expect(environmentLabel('live')).toBe('Produção')
    expect(environmentLabel('test')).toBe('Testes')
  })
})
