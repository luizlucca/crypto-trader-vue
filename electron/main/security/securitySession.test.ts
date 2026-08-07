import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_SECURITY_PREFERENCES,
  type SecurityPreferences,
  type SecuritySnapshot,
} from '@shared/contracts/security'
import type {
  EncryptedCredentialVaultV1,
  ProviderAccountRecord,
} from './vaultCrypto'
import { VaultCrypto } from './vaultCrypto'
import { VaultRepository } from './vaultRepository'
import { SecurityPreferencesStore } from './securityPreferences'
import { SecuritySession } from './securitySession'
import { ProviderConnectionCoordinator } from './providerConnectionCoordinator'
import {
  AccountProviderRegistry,
  type AccountProvider,
} from '../providers/accountProvider'

const password = 'Abcdef1!'
const temporaryDirectories: string[] = []

interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason?: unknown): void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

interface WriteGate {
  started: Deferred<void>
  completion: Deferred<void>
}

class DeferredVaultRepository extends VaultRepository {
  private readonly writeGates: WriteGate[] = []

  pauseNextWrite(): WriteGate {
    const gate = { started: deferred<void>(), completion: deferred<void>() }
    this.writeGates.push(gate)
    return gate
  }

  async write(envelope: EncryptedCredentialVaultV1): Promise<void> {
    const gate = this.writeGates.shift()
    gate?.started.resolve()
    await gate?.completion.promise
    await super.write(envelope)
  }
}

interface UnlockGate {
  started: Deferred<void>
  wasStarted: boolean
  completion: Deferred<void>
}

class DeferredVaultCrypto extends VaultCrypto {
  private readonly unlockGates: UnlockGate[] = []

  pauseNextUnlock(): UnlockGate {
    const gate = {
      started: deferred<void>(),
      wasStarted: false,
      completion: deferred<void>(),
    }
    this.unlockGates.push(gate)
    return gate
  }

  async unlock(
    nextPassword: string,
    envelope: EncryptedCredentialVaultV1,
  ) {
    const gate = this.unlockGates.shift()
    if (gate) {
      gate.wasStarted = true
      gate.started.resolve()
      await gate.completion.promise
    }
    return super.unlock(nextPassword, envelope)
  }
}

function account(id: string): ProviderAccountRecord {
  return {
    accountId: id,
    provider: 'binance',
    label: `Conta ${id}`,
    markets: ['spot'],
    apiKey: `api-key-${id}`,
    apiSecret: `api-secret-${id}`,
  }
}

function connectedProvider(): AccountProvider {
  return {
    id: 'binance',
    validateConnection: async (_credentials, markets) => (
      markets.map((market) => ({ market, state: 'connected' as const }))
    ),
  }
}

class InjectedPreferencesStore extends SecurityPreferencesStore {
  override async read(): Promise<SecurityPreferences> {
    return {
      ...DEFAULT_SECURITY_PREFERENCES,
      apiSecret: 'must-not-reach-snapshot',
    } as SecurityPreferences
  }
}

async function createSession(options: {
  accounts?: ProviderAccountRecord[]
  provider?: AccountProvider
  repository?: VaultRepository
  crypto?: VaultCrypto
  getSystemIdleTime?: () => number
  setInterval?: typeof setInterval
  clearInterval?: typeof clearInterval
  preferences?: SecurityPreferencesStore
} = {}): Promise<SecuritySession> {
  const directory = await mkdtemp(join(tmpdir(), 'cryptopro-session-'))
  temporaryDirectories.push(directory)
  const repository = options.repository
    ?? new VaultRepository(join(directory, 'credentials.v1.enc'))
  const crypto = options.crypto ?? new VaultCrypto()
  if (options.accounts) {
    const unlocked = await crypto.create(password, {
      version: 1,
      accounts: options.accounts,
    })
    try {
      await repository.write(unlocked.envelope)
    } finally {
      unlocked.key.fill(0)
    }
  }

  const providers = new AccountProviderRegistry([
    options.provider ?? connectedProvider(),
  ])
  const session = new SecuritySession({
    repository,
    crypto,
    preferences: options.preferences ?? new SecurityPreferencesStore(
      join(directory, 'security-preferences.v1.json'),
    ),
    connections: new ProviderConnectionCoordinator(providers),
    getSystemIdleTime: options.getSystemIdleTime,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
    createAccountId: () => 'new-account-id',
  })
  await session.initialize()
  return session
}

async function createDeferredSession(
  accounts: ProviderAccountRecord[] = [],
  crypto: VaultCrypto = new VaultCrypto(),
): Promise<{
  session: SecuritySession
  repository: DeferredVaultRepository
}> {
  const directory = await mkdtemp(join(tmpdir(), 'cryptopro-deferred-session-'))
  temporaryDirectories.push(directory)
  const repository = new DeferredVaultRepository(
    join(directory, 'credentials.v1.enc'),
  )
  const session = await createSession({
    accounts: accounts.length > 0 ? accounts : undefined,
    crypto,
    repository,
  })
  return { session, repository }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('SecuritySession', () => {
  it('projects injected preferences out of public snapshots', async () => {
    const session = await createSession({
      preferences: new InjectedPreferencesStore('not-read-by-this-test'),
    })

    expect(session.getSnapshot().preferences)
      .toEqual(DEFAULT_SECURITY_PREFERENCES)
  })

  it('starts public and never discloses accounts while locked', async () => {
    const publicSession = await createSession()
    const lockedSession = await createSession({ accounts: [account('one')] })

    expect(publicSession.getSnapshot()).toMatchObject({
      state: 'setup-required',
      hasVault: false,
      accounts: [],
    })
    expect(lockedSession.getSnapshot()).toMatchObject({
      state: 'locked',
      hasVault: true,
      accounts: [],
    })
  })

  it('unlocks accounts disconnected and validates only the account connected explicitly',
    async () => {
      const validateConnection = vi.fn().mockResolvedValue([
        { market: 'spot', state: 'connected' },
      ])
      const provider: AccountProvider = {
        id: 'binance',
        validateConnection,
      }
      const session = await createSession({
        accounts: [account('one'), account('two'), account('three')],
        provider,
      })

      await session.unlock(password)

      expect(validateConnection).not.toHaveBeenCalled()
      expect(session.getSnapshot().connection).toEqual({
        state: 'disconnected',
      })
      await session.connectAccount('two')

      expect(validateConnection).toHaveBeenCalledOnce()
      expect(session.getSnapshot()).toMatchObject({
        state: 'unlocked',
        connection: { accountId: 'two', state: 'connected' },
        accounts: [
          {
            accountId: 'one',
            connection: 'disconnected',
            apiKeySuffix: '••••-one',
          },
          {
            accountId: 'two',
            connection: 'connected',
            apiKeySuffix: '••••-two',
          },
          {
            accountId: 'three',
            connection: 'disconnected',
            apiKeySuffix: '••••hree',
          },
        ],
      })
    },
  )

  it('returns locked after an invalid unlock password', async () => {
    const session = await createSession({ accounts: [account('one')] })

    await expect(session.unlock('InvalidPassword1!'))
      .rejects.toThrow('Não foi possível abrir o cofre de credenciais')

    expect(session.getSnapshot()).toMatchObject({
      state: 'locked',
      accounts: [],
    })
  })

  it('aborts the provider request when locking an active connection',
    async () => {
      let validationStarted: (() => void) | undefined
      let signal: AbortSignal | undefined
      const provider: AccountProvider = {
        id: 'binance',
        validateConnection: async (credentials, markets, context) => {
          expect(credentials.apiSecret).toBe('api-secret-one')
          signal = context?.signal
          validationStarted?.()
          return new Promise((resolve) => {
            signal?.addEventListener('abort', () => {
              resolve(markets.map((market) => ({
                market,
                state: 'connected' as const,
              })))
            }, { once: true })
          })
        },
      }
      const session = await createSession({
        accounts: [account('one')],
        provider,
      })
      const started = new Promise<void>((resolve) => {
        validationStarted = resolve
      })

      await session.unlock(password)
      const connecting = session.connectAccount('one')
      await started
      session.lock('manual')
      await connecting

      expect(signal?.aborted).toBe(true)
      expect(session.getSnapshot()).toMatchObject({
        state: 'locked',
        accounts: [],
        connection: { state: 'disconnected' },
      })
    },
  )

  it('aborts the provider request when resetting the vault', async () => {
    let validationStarted: (() => void) | undefined
    let signal: AbortSignal | undefined
    const provider: AccountProvider = {
      id: 'binance',
      validateConnection: async (_credentials, markets, context) => {
        signal = context?.signal
        validationStarted?.()
        return new Promise((resolve) => {
          signal?.addEventListener('abort', () => {
            resolve(markets.map((market) => ({
              market,
              state: 'connected' as const,
            })))
          }, { once: true })
        })
      },
    }
    const session = await createSession({
      accounts: [account('one')],
      provider,
    })
    const started = new Promise<void>((resolve) => {
      validationStarted = resolve
    })

    await session.unlock(password)
    const connecting = session.connectAccount('one')
    await started
    await session.resetVault('APAGAR')
    await connecting

    expect(signal?.aborted).toBe(true)
    expect(session.getSnapshot()).toMatchObject({
      state: 'setup-required',
      connection: { state: 'disconnected' },
    })
  })

  it('encrypts accounts, masks API keys and connects with explicit save intent',
    async () => {
      const validateConnection = vi.fn().mockResolvedValue([
        { market: 'futures', state: 'connected' },
      ])
      const provider: AccountProvider = { id: 'binance', validateConnection }
      const session = await createSession({ provider })
      await session.setup(password)

      await session.saveBinanceAccount({
        label: 'Futuros principal',
        markets: ['futures'],
        apiKey: 'binance-api-key-ABCD',
        apiSecret: 'binance-api-secret',
        validateAndConnect: true,
      })

      expect(validateConnection).toHaveBeenCalledWith(
        {
          apiKey: 'binance-api-key-ABCD',
          apiSecret: 'binance-api-secret',
        },
        ['futures'],
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
      expect(session.getSnapshot().accounts).toEqual([
        expect.objectContaining({
          accountId: 'new-account-id',
          apiKeySuffix: '••••ABCD',
          connection: 'connected',
        }),
      ])
    },
  )

  it('never serializes credentials through a security event', async () => {
    const session = await createSession()
    const snapshots: SecuritySnapshot[] = []
    const apiKey = 'binance-api-key-ABCD'
    const apiSecret = 'binance-api-secret'
    session.subscribe((nextSnapshot) => snapshots.push(nextSnapshot))
    await session.setup(password)

    await session.saveBinanceAccount({
      label: 'Spot',
      markets: ['spot'],
      apiKey,
      apiSecret,
      validateAndConnect: false,
    })

    const serialized = JSON.stringify(snapshots.at(-1))
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain(apiSecret)
  })

  it('locks after idle time and stops its timer', async () => {
    let scheduled: (() => void) | undefined
    const clearInterval = vi.fn()
    const session = await createSession({
      getSystemIdleTime: () => 61,
      setInterval: ((callback: () => void) => {
        scheduled = callback
        return 1 as unknown as ReturnType<typeof setInterval>
      }) as typeof setInterval,
      clearInterval: clearInterval as typeof clearInterval,
    })
    await session.setup(password)
    await session.updatePreferences({
      lockOnMinimize: true,
      lockOnSuspend: true,
      idleTimeoutMinutes: 1,
      closeAction: 'quit-and-lock',
    })

    scheduled?.()

    expect(session.getSnapshot()).toMatchObject({ state: 'locked' })
    expect(clearInterval).toHaveBeenCalled()
  })

  it('rotates encryption, removes accounts and requires reset confirmation',
    async () => {
      const session = await createSession()
      await session.setup(password)
      await session.saveBinanceAccount({
        label: 'Spot',
        markets: ['spot'],
        apiKey: 'binance-api-key-ABCD',
        apiSecret: 'binance-api-secret',
        validateAndConnect: false,
      })

      await expect(session.resetVault('INVALIDAR' as never))
        .rejects.toThrow('Confirmação de reset inválida')
      await session.changePassword(password, 'NewPassword1!')
      await session.removeAccount('new-account-id')
      await session.resetVault('APAGAR')

      expect(session.getSnapshot()).toMatchObject({
        state: 'setup-required',
        hasVault: false,
        accounts: [],
      })
    },
  )

  it('rejects an explicit connection for an unknown account', async () => {
    const session = await createSession({ accounts: [account('one')] })
    await session.unlock(password)

    await expect(session.connectAccount('missing'))
      .rejects.toThrow('Conta de provider não encontrada')
    expect(session.getSnapshot().connection).toEqual({ state: 'disconnected' })
  })

  it('disconnects the active account when it is removed', async () => {
    const session = await createSession()
    await session.setup(password)
    await session.saveBinanceAccount({
      label: 'Spot',
      markets: ['spot'],
      apiKey: 'binance-api-key-ABCD',
      apiSecret: 'binance-api-secret',
      validateAndConnect: false,
    })
    await session.connectAccount('new-account-id')

    await session.removeAccount('new-account-id')

    expect(session.getSnapshot().connection).toEqual({ state: 'disconnected' })
  })

  it('disconnects before resetting an active connection', async () => {
    const session = await createSession()
    await session.setup(password)
    await session.saveBinanceAccount({
      label: 'Spot',
      markets: ['spot'],
      apiKey: 'binance-api-key-ABCD',
      apiSecret: 'binance-api-secret',
      validateAndConnect: false,
    })
    await session.connectAccount('new-account-id')

    await session.resetVault('APAGAR')

    expect(session.getSnapshot().connection).toEqual({ state: 'disconnected' })
  })

  it('disconnects an edited active account when validation is not requested',
    async () => {
      const session = await createSession()
      await session.setup(password)
      await session.saveBinanceAccount({
        label: 'Spot',
        markets: ['spot'],
        apiKey: 'binance-api-key-OLD',
        apiSecret: 'binance-api-secret-OLD',
        validateAndConnect: false,
      })
      await session.connectAccount('new-account-id')

      await session.saveBinanceAccount({
        accountId: 'new-account-id',
        label: 'Spot editada',
        markets: ['spot'],
        apiKey: 'binance-api-key-NEW',
        apiSecret: 'binance-api-secret-NEW',
        validateAndConnect: false,
      })

      expect(session.getSnapshot().connection).toEqual({ state: 'disconnected' })
      expect(session.getSnapshot().accounts).toEqual([
        expect.objectContaining({
          accountId: 'new-account-id',
          connection: 'disconnected',
        }),
      ])
    },
  )

  it('disconnects before reconnecting an edited active account when requested',
    async () => {
      const validateConnection = vi.fn().mockResolvedValue([
        { market: 'spot', state: 'connected' },
      ])
      const session = await createSession({
        provider: { id: 'binance', validateConnection },
      })
      await session.setup(password)
      await session.saveBinanceAccount({
        label: 'Spot',
        markets: ['spot'],
        apiKey: 'binance-api-key-OLD',
        apiSecret: 'binance-api-secret-OLD',
        validateAndConnect: false,
      })
      await session.connectAccount('new-account-id')
      validateConnection.mockClear()
      const snapshots: SecuritySnapshot[] = []
      session.subscribe((snapshot) => snapshots.push(snapshot))

      await session.saveBinanceAccount({
        accountId: 'new-account-id',
        label: 'Spot editada',
        markets: ['spot'],
        apiKey: 'binance-api-key-NEW',
        apiSecret: 'binance-api-secret-NEW',
        validateAndConnect: true,
      })

      expect(snapshots[0].connection).toEqual({ state: 'disconnected' })
      expect(validateConnection).toHaveBeenCalledWith({
        apiKey: 'binance-api-key-NEW',
        apiSecret: 'binance-api-secret-NEW',
      }, ['spot'], expect.objectContaining({ signal: expect.any(AbortSignal) }))
      expect(session.getSnapshot().connection).toEqual({
        accountId: 'new-account-id',
        state: 'connected',
      })
    },
  )
})

describe('SecuritySession credential vault mutation queue', () => {
  it(
    'restores the envelope before queued unlocks after interrupted rotation',
    async () => {
      const { session, repository } = await createDeferredSession()
      await session.setup(password)
      const rotationWrite = repository.pauseNextWrite()

      const rotation = session.changePassword(password, 'NewPassword1!')
      await rotationWrite.started.promise
      session.lock('manual')
      const unlockWithNewPassword = session.unlock('NewPassword1!')
      const unlockWithOriginalPassword = session.unlock(password)

      rotationWrite.completion.resolve()

      await expect(rotation).resolves.toMatchObject({ state: 'locked' })
      await expect(unlockWithNewPassword).rejects.toThrow(
        'Não foi possível abrir o cofre de credenciais',
      )
      await expect(unlockWithOriginalPassword).resolves.toMatchObject({
        state: 'unlocked',
      })
    },
  )

  it(
    'keeps rotation rollback failures from exposing the next password',
    async () => {
      const { session, repository } = await createDeferredSession()
      await session.setup(password)
      const rotationWrite = repository.pauseNextWrite()

      const rotation = session.changePassword(password, 'NewPassword1!')
      await rotationWrite.started.promise
      session.lock('manual')
      const rollbackWrite = repository.pauseNextWrite()
      rotationWrite.completion.resolve()
      await rollbackWrite.started.promise
      rollbackWrite.completion.reject(new Error('NewPassword1!'))

      await expect(rotation).rejects.toThrow(
        'Não foi possível restaurar o cofre de credenciais',
      )
      await expect(rotation).rejects.not.toThrow('NewPassword1!')
    },
  )

  it('preserves both accounts when two saves overlap', async () => {
    const { session, repository } = await createDeferredSession()
    await session.setup(password)
    const firstWrite = repository.pauseNextWrite()

    const firstSave = session.saveBinanceAccount({
      ...account('one'),
      validateAndConnect: false,
    })
    await firstWrite.started.promise
    const secondSave = session.saveBinanceAccount({
      ...account('two'),
      validateAndConnect: false,
    })
    firstWrite.completion.resolve()
    await Promise.all([firstSave, secondSave])

    session.lock('manual')
    await session.unlock(password)

    expect(session.getSnapshot().accounts.map(({ accountId }) => accountId))
      .toEqual(['one', 'two'])
  })

  it('keeps a queued save when the password changes afterwards', async () => {
    const crypto = new DeferredVaultCrypto()
    const { session, repository } = await createDeferredSession([], crypto)
    await session.setup(password)
    const firstWrite = repository.pauseNextWrite()
    const passwordCheck = crypto.pauseNextUnlock()

    const save = session.saveBinanceAccount({
      ...account('one'),
      validateAndConnect: false,
    })
    await firstWrite.started.promise
    const changePassword = session.changePassword(password, 'NewPassword1!')
    await Promise.resolve()

    expect(passwordCheck.wasStarted).toBe(false)

    firstWrite.completion.resolve()
    passwordCheck.completion.resolve()
    await Promise.all([save, changePassword])

    session.lock('manual')
    await expect(session.unlock(password)).rejects.toThrow(
      'Não foi possível abrir o cofre de credenciais',
    )
    await session.unlock('NewPassword1!')

    expect(session.getSnapshot().accounts).toEqual([
      expect.objectContaining({ accountId: 'one' }),
    ])
  })

  it('does not recreate a vault when reset follows a queued save', async () => {
    const { session, repository } = await createDeferredSession()
    await session.setup(password)
    const firstWrite = repository.pauseNextWrite()

    const save = session.saveBinanceAccount({
      ...account('one'),
      validateAndConnect: false,
    })
    await firstWrite.started.promise
    const reset = session.resetVault('APAGAR')
    firstWrite.completion.resolve()
    await Promise.all([save, reset])

    expect(session.getSnapshot()).toMatchObject({
      state: 'setup-required',
      hasVault: false,
      accounts: [],
    })
    await expect(repository.exists()).resolves.toBe(false)
  })

  it('locks immediately while a later unlock waits for the committed write',
    async () => {
      const crypto = new DeferredVaultCrypto()
      const { session, repository } = await createDeferredSession([], crypto)
      await session.setup(password)
      const firstWrite = repository.pauseNextWrite()
      const unlockGate = crypto.pauseNextUnlock()

      const save = session.saveBinanceAccount({
        ...account('one'),
        validateAndConnect: false,
      })
      await firstWrite.started.promise
      session.lock('manual')

      let unlocked = false
      const unlock = session.unlock(password).then(() => {
        unlocked = true
      })
      await Promise.resolve()
      expect(unlocked).toBe(false)
      expect(unlockGate.wasStarted).toBe(false)
      expect(session.getSnapshot()).toMatchObject({
        state: 'locked',
        accounts: [],
      })

      firstWrite.completion.resolve()
      await unlockGate.started.promise
      unlockGate.completion.resolve()
      await Promise.all([save, unlock])

      expect(session.getSnapshot().accounts).toEqual([
        expect.objectContaining({ accountId: 'one' }),
      ])
    },
  )

  it(
    'continues with the next mutation after a queued write fails',
    async () => {
      const { session, repository } = await createDeferredSession()
      await session.setup(password)
      const failedWrite = repository.pauseNextWrite()

      const rejectedSave = session.saveBinanceAccount({
        ...account('one'),
        validateAndConnect: false,
      })
      await failedWrite.started.promise
      const nextSave = session.saveBinanceAccount({
        ...account('two'),
        validateAndConnect: false,
      })
      failedWrite.completion.reject(new Error('disk unavailable'))

      await expect(rejectedSave).rejects.toThrow('disk unavailable')
      await nextSave

      expect(session.getSnapshot().accounts).toEqual([
        expect.objectContaining({ accountId: 'two' }),
      ])
    },
  )

  it('does not resurrect a removed record or discard an unrelated save',
    async () => {
      const { session, repository } = await createDeferredSession([
        account('one'),
        account('two'),
      ])
      await session.unlock(password)
      const firstWrite = repository.pauseNextWrite()

      const remove = session.removeAccount('one')
      await firstWrite.started.promise
      const save = session.saveBinanceAccount({
        ...account('three'),
        validateAndConnect: false,
      })
      firstWrite.completion.resolve()
      await Promise.all([remove, save])

      expect(session.getSnapshot().accounts.map(({ accountId }) => accountId))
        .toEqual(['two', 'three'])
    },
  )
})
