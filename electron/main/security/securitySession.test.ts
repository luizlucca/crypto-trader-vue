import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderAccountRecord } from './vaultCrypto'
import { VaultCrypto } from './vaultCrypto'
import { VaultRepository } from './vaultRepository'
import { SecurityPreferencesStore } from './securityPreferences'
import { SecuritySession } from './securitySession'
import {
  AccountProviderRegistry,
  type AccountProvider,
} from '../providers/accountProvider'

const password = 'Abcdef1!'
const temporaryDirectories: string[] = []

function account(id: string, enabled = true): ProviderAccountRecord {
  return {
    accountId: id,
    provider: 'binance',
    label: `Conta ${id}`,
    markets: ['spot'],
    apiKey: `api-key-${id}`,
    apiSecret: `api-secret-${id}`,
    enabled,
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

async function createSession(options: {
  accounts?: ProviderAccountRecord[]
  provider?: AccountProvider
  getSystemIdleTime?: () => number
  setInterval?: typeof setInterval
  clearInterval?: typeof clearInterval
} = {}): Promise<SecuritySession> {
  const directory = await mkdtemp(join(tmpdir(), 'cryptopro-session-'))
  temporaryDirectories.push(directory)
  const repository = new VaultRepository(join(directory, 'credentials.v1.enc'))
  const crypto = new VaultCrypto()
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

  const session = new SecuritySession({
    repository,
    crypto,
    preferences: new SecurityPreferencesStore(
      join(directory, 'security-preferences.v1.json'),
    ),
    providers: new AccountProviderRegistry([
      options.provider ?? connectedProvider(),
    ]),
    getSystemIdleTime: options.getSystemIdleTime,
    setInterval: options.setInterval,
    clearInterval: options.clearInterval,
    createAccountId: () => 'new-account-id',
  })
  await session.initialize()
  return session
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('SecuritySession', () => {
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

  it('unlocks multi-account data with at most two parallel validations',
    async () => {
      let activeValidations = 0
      let maximumValidations = 0
      const provider: AccountProvider = {
        id: 'binance',
        validateConnection: async (_credentials, markets) => {
          activeValidations += 1
          maximumValidations = Math.max(maximumValidations, activeValidations)
          await new Promise<void>((resolve) => setTimeout(resolve, 5))
          activeValidations -= 1
          return markets.map((market) => ({
            market,
            state: 'connected' as const,
          }))
        },
      }
      const session = await createSession({
        accounts: [account('one'), account('two'), account('three')],
        provider,
      })

      await session.unlock(password)

      expect(maximumValidations).toBeLessThanOrEqual(2)
      expect(session.getSnapshot()).toMatchObject({
        state: 'unlocked',
        accounts: [
          {
            accountId: 'one',
            connection: 'connected',
            apiKeySuffix: '••••-one',
          },
          {
            accountId: 'two',
            connection: 'connected',
            apiKeySuffix: '••••-two',
          },
          {
            accountId: 'three',
            connection: 'connected',
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

  it('discards late validation after locking and zeroes unlocked state',
    async () => {
      let releaseValidation: (() => void) | undefined
      let validationStarted: (() => void) | undefined
      const provider: AccountProvider = {
        id: 'binance',
        validateConnection: async (credentials, markets) => {
          expect(credentials.apiSecret).toBe('api-secret-one')
          validationStarted?.()
          await new Promise<void>((resolve) => {
            releaseValidation = resolve
          })
          return markets.map((market) => ({
            market,
            state: 'connected' as const,
          }))
        },
      }
      const session = await createSession({
        accounts: [account('one')],
        provider,
      })
      const started = new Promise<void>((resolve) => {
        validationStarted = resolve
      })

      const unlocking = session.unlock(password)
      await started
      session.lock('manual')
      releaseValidation?.()
      await unlocking

      expect(session.getSnapshot()).toMatchObject({
        state: 'locked',
        accounts: [],
      })
    },
  )

  it('encrypts accounts, masks API keys and validates immediately',
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
        enabled: true,
      })

      expect(validateConnection).toHaveBeenCalledWith(
        {
          apiKey: 'binance-api-key-ABCD',
          apiSecret: 'binance-api-secret',
        },
        ['futures'],
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
        enabled: false,
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
})
