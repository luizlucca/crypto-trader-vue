import { describe, expect, it } from 'vitest'
import type { ProviderAccountRecord } from './vaultCrypto'
import { ProviderConnectionCoordinator } from './providerConnectionCoordinator'
import {
  AccountProviderRegistry,
  type AccountProvider,
} from '../providers/accountProvider'

function account(id: string, markets: ProviderAccountRecord['markets'] = ['spot']): ProviderAccountRecord {
  return {
    accountId: id,
    provider: 'binance',
    label: `Conta ${id}`,
    markets,
    apiKey: `api-key-${id}`,
    apiSecret: `api-secret-${id}`,
  }
}

function createCoordinator(provider: AccountProvider): ProviderConnectionCoordinator {
  return new ProviderConnectionCoordinator(
    new AccountProviderRegistry([provider]),
  )
}

describe('ProviderConnectionCoordinator', () => {
  it('publishes an immutable successful connection snapshot', async () => {
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async () => [{ market: 'spot', state: 'connected' }],
    })
    const snapshots: object[] = []
    coordinator.subscribe((snapshot) => snapshots.push(snapshot))

    await coordinator.connect(account('one'))

    expect(coordinator.snapshot()).toEqual({
      accountId: 'one',
      state: 'connected',
    })
    expect(snapshots).toEqual([
      { accountId: 'one', state: 'connecting' },
      { accountId: 'one', state: 'connected' },
    ])
  })

  it('normalizes a provider validation failure', async () => {
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async () => [{
        market: 'spot',
        state: 'failed',
        failureCode: 'credentials',
      }],
    })

    await coordinator.connect(account('one'))

    expect(coordinator.snapshot()).toEqual({
      accountId: 'one',
      state: 'failed',
      failureCode: 'credentials',
    })
  })

  it.each([
    ['empty', ['spot'], []],
    ['missing', ['spot', 'futures'], [{ market: 'spot', state: 'connected' }]],
    ['extra', ['spot'], [
      { market: 'spot', state: 'connected' },
      { market: 'futures', state: 'connected' },
    ]],
    ['duplicate', ['spot'], [
      { market: 'spot', state: 'connected' },
      { market: 'spot', state: 'connected' },
    ]],
  ] as const)('fails %s provider results structurally', async (
    _name,
    markets,
    results,
  ) => {
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async () => results,
    })

    await coordinator.connect(account('one', markets))

    expect(coordinator.snapshot()).toEqual({
      accountId: 'one',
      state: 'failed',
      failureCode: 'unknown',
    })
  })

  it('keeps a newer account connection when an earlier validation finishes', async () => {
    let releaseOne: (() => void) | undefined
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async (credentials) => {
        if (credentials.apiKey === 'api-key-one') {
          await new Promise<void>((resolve) => {
            releaseOne = resolve
          })
        }
        return [{ market: 'spot', state: 'connected' }]
      },
    })

    const first = coordinator.connect(account('one'))
    await coordinator.connect(account('two'))
    releaseOne?.()
    await first

    expect(coordinator.snapshot()).toEqual({
      accountId: 'two',
      state: 'connected',
    })
  })

  it('ignores a late validation result after disconnecting', async () => {
    let releaseValidation: (() => void) | undefined
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async () => {
        await new Promise<void>((resolve) => {
          releaseValidation = resolve
        })
        return [{ market: 'spot', state: 'connected' }]
      },
    })

    const pending = coordinator.connect(account('one'))
    expect(coordinator.snapshot()).toEqual({
      accountId: 'one',
      state: 'connecting',
    })
    coordinator.disconnect()
    releaseValidation?.()
    await pending

    expect(coordinator.snapshot()).toEqual({ state: 'disconnected' })
  })
})
