import { describe, expect, it, vi } from 'vitest'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'
import type { MarketEnvironment } from '@shared/types/market'
import { switchEnvironment } from './environmentSwitch'

const target: ProviderAccountSummary = {
  accountId: 'test-one',
  provider: 'binance',
  environment: 'test',
  label: 'Testnet',
  markets: ['spot'],
  apiKeySuffix: '••••1234',
  connection: 'disconnected',
}

function snapshot(
  connection: SecuritySnapshot['connection'],
  environment: MarketEnvironment = 'test',
): SecuritySnapshot {
  return {
    state: 'unlocked',
    hasVault: true,
    accounts: [target],
    connection,
    environment,
    preferences: {
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 15,
      closeAction: 'quit-and-lock',
    },
  }
}

function effects(overrides: {
  connectionState?: SecuritySnapshot['connection']['state']
} = {}) {
  const connect = vi.fn(async () => snapshot({
    accountId: target.accountId,
    state: overrides.connectionState ?? 'connected',
  }))
  const resetWorkspace = vi.fn(async () => {})
  return { connect, resetWorkspace }
}

describe('environment switch', () => {
  it('connects the sibling and rebuilds the workspace on its environment',
    async () => {
      const spies = effects()

      const outcome = await switchEnvironment(target, spies)

      expect(outcome).toEqual({ status: 'switched' })
      expect(spies.connect).toHaveBeenCalledWith('test-one')
      expect(spies.resetWorkspace).toHaveBeenCalledWith('test')
    })

  /*
   * A wrong testnet key is an ordinary outcome, not an edge case. Resetting
   * first would spend the operator's whole workspace to discover it.
   */
  it('leaves the workspace standing when the credential fails', async () => {
    const spies = effects({ connectionState: 'failed' })

    const outcome = await switchEnvironment(target, spies)

    expect(outcome.status).toBe('connection-failed')
    expect(spies.resetWorkspace).not.toHaveBeenCalled()
  })

  it('treats a connection stuck on connecting as a failure', async () => {
    const spies = effects({ connectionState: 'connecting' })

    const outcome = await switchEnvironment(target, spies)

    expect(outcome.status).toBe('connection-failed')
    expect(spies.resetWorkspace).not.toHaveBeenCalled()
  })

  it('reports the snapshot so the caller can name the cause', async () => {
    const connect = vi.fn(async () => snapshot({
      accountId: target.accountId,
      state: 'failed',
      failureCode: 'credentials',
    }))
    const outcome = await switchEnvironment(target, {
      connect,
      resetWorkspace: vi.fn(async () => {}),
    })

    expect(outcome.status === 'connection-failed'
      && outcome.snapshot.connection.failureCode).toBe('credentials')
  })

  /*
   * The ordering is the whole reason this is a function and not two calls at
   * the call site: the workspace is only razed once the credential answered.
   */
  it('does not touch the workspace until the connection answered', async () => {
    const order: string[] = []
    await switchEnvironment(target, {
      connect: async (accountId) => {
        order.push('connect')
        return snapshot({ accountId, state: 'connected' })
      },
      resetWorkspace: async () => {
        order.push('reset')
      },
    })

    expect(order).toEqual(['connect', 'reset'])
  })
})
