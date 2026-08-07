import { describe, expect, it, vi } from 'vitest'
import type { ProviderAccountRecord } from './vaultCrypto'
import { ProviderConnectionCoordinator } from './providerConnectionCoordinator'
import {
  AccountProviderRegistry,
  type AccountMarketValidation,
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

  it('gives each validation attempt an abort signal', async () => {
    let signal: AbortSignal | undefined
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async (_credentials, _markets, context) => {
        signal = context?.signal
        return [{ market: 'spot', state: 'connected' }]
      },
    })

    await coordinator.connect(account('one'))

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(false)
  })

  it('aborts a pending validation when disconnected without provider release', async () => {
    let signal: AbortSignal | undefined
    let started: (() => void) | undefined
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async (_credentials, _markets, context) => {
        signal = context?.signal
        started?.()
        return new Promise<readonly AccountMarketValidation[]>(() => undefined)
      },
    })
    const validationStarted = new Promise<void>((resolve) => {
      started = resolve
    })

    void coordinator.connect(account('one'))
    await validationStarted
    coordinator.disconnect()

    expect(signal?.aborted).toBe(true)
    expect(coordinator.snapshot()).toEqual({ state: 'disconnected' })
  })

  it('aborts the replaced validation without aborting the replacement', async () => {
    const signals: AbortSignal[] = []
    let firstStarted: (() => void) | undefined
    const coordinator = createCoordinator({
      id: 'binance',
      validateConnection: async (credentials, _markets, context) => {
        const signal = context?.signal
        if (signal) {
          signals.push(signal)
        }
        if (credentials.apiKey === 'api-key-one') {
          firstStarted?.()
          return new Promise<readonly AccountMarketValidation[]>(() => undefined)
        }
        return [{ market: 'spot', state: 'connected' }]
      },
    })
    const validationStarted = new Promise<void>((resolve) => {
      firstStarted = resolve
    })

    void coordinator.connect(account('one'))
    await validationStarted
    await coordinator.connect(account('two'))

    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)
    expect(coordinator.snapshot()).toEqual({
      accountId: 'two',
      state: 'connected',
    })
  })

  it('keeps B connecting when A is replaced before A deadline and finishes late', async () => {
    vi.useFakeTimers()
    try {
      const signals: AbortSignal[] = []
      const snapshots: object[] = []
      let firstStarted: (() => void) | undefined
      let secondStarted: (() => void) | undefined
      let finishFirst: (() => void) | undefined
      let finishSecond: (() => void) | undefined
      const coordinator = createCoordinator({
        id: 'binance',
        validateConnection: async (credentials, _markets, context) => {
          const signal = context?.signal
          if (signal) {
            signals.push(signal)
          }
          if (credentials.apiKey === 'api-key-one') {
            firstStarted?.()
            return new Promise<readonly AccountMarketValidation[]>((resolve) => {
              finishFirst = () => resolve([{ market: 'spot', state: 'connected' }])
            })
          }
          secondStarted?.()
          return new Promise<readonly AccountMarketValidation[]>((resolve) => {
            finishSecond = () => resolve([{ market: 'spot', state: 'connected' }])
          })
        },
      })
      const firstValidationStarted = new Promise<void>((resolve) => {
        firstStarted = resolve
      })
      const secondValidationStarted = new Promise<void>((resolve) => {
        secondStarted = resolve
      })
      coordinator.subscribe((snapshot) => snapshots.push(snapshot))

      const first = coordinator.connect(account('one'))
      await firstValidationStarted
      await vi.advanceTimersByTimeAsync(5_000)

      const second = coordinator.connect(account('two'))
      await secondValidationStarted
      await vi.advanceTimersByTimeAsync(5_000)

      expect(signals[0]?.aborted).toBe(true)
      expect(signals[1]?.aborted).toBe(false)
      expect(coordinator.snapshot()).toEqual({
        accountId: 'two',
        state: 'connecting',
      })

      finishFirst?.()
      await first

      expect(coordinator.snapshot()).toEqual({
        accountId: 'two',
        state: 'connecting',
      })

      finishSecond?.()
      await second

      expect(snapshots).toEqual([
        { accountId: 'one', state: 'connecting' },
        { accountId: 'two', state: 'connecting' },
        { accountId: 'two', state: 'connected' },
      ])
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('fails the current validation as network when its deadline expires', async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      let started: (() => void) | undefined
      const coordinator = createCoordinator({
        id: 'binance',
        validateConnection: async (_credentials, _markets, context) => {
          signal = context?.signal
          started?.()
          return new Promise<readonly AccountMarketValidation[]>(() => undefined)
        },
      })
      const validationStarted = new Promise<void>((resolve) => {
        started = resolve
      })

      const pending = coordinator.connect(account('one'))
      await validationStarted
      await vi.advanceTimersByTimeAsync(10_000)

      expect(signal?.aborted).toBe(true)
      await pending
      expect(coordinator.snapshot()).toEqual({
        accountId: 'one',
        state: 'failed',
        failureCode: 'network',
      })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
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
