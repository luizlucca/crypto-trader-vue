import { describe, expect, it } from 'vitest'
import { VaultCrypto, type VaultContents } from './vaultCrypto'

const password = 'Abcdef1!'

function contentsWith(environment: 'live' | 'test'): VaultContents {
  return {
    version: 1,
    accounts: [{
      accountId: 'account-one',
      provider: 'binance',
      environment,
      label: 'Conta',
      markets: ['spot'],
      apiKey: 'binance-api-key',
      apiSecret: 'binance-secret',
    }],
  }
}

describe('vault stores the environment of each credential', () => {
  it('round-trips a test account through encryption', async () => {
    const crypto = new VaultCrypto()
    const envelope = await crypto.create(password, contentsWith('test'))

    const opened = await crypto.unlock(password, envelope.envelope)

    expect(opened.contents.accounts[0].environment).toBe('test')
  })

  it('keeps the two environments distinguishable in one vault', async () => {
    const crypto = new VaultCrypto()
    const both: VaultContents = {
      version: 1,
      accounts: [
        contentsWith('live').accounts[0],
        { ...contentsWith('test').accounts[0], accountId: 'account-two' },
      ],
    }
    const envelope = await crypto.create(password, both)

    const opened = await crypto.unlock(password, envelope.envelope)

    expect(opened.contents.accounts.map((a) => a.environment))
      .toEqual(['live', 'test'])
  })
})

/*
 * A vault written before this feature has no `environment` at all. Refusing to
 * open it would lock the operator out of credentials they already own — the
 * worst possible outcome of adding a field.
 */
describe('vaults written before environments existed', () => {
  it('opens and reads every legacy account as production', async () => {
    const crypto = new VaultCrypto()
    const legacy = {
      version: 1,
      accounts: [{
        accountId: 'legacy-one',
        provider: 'binance',
        label: 'Antiga',
        markets: ['spot'],
        apiKey: 'binance-api-key',
        apiSecret: 'binance-secret',
      }],
    } as unknown as VaultContents
    const envelope = await crypto.create(password, legacy)

    const opened = await crypto.unlock(password, envelope.envelope)

    expect(opened.contents.accounts).toHaveLength(1)
    expect(opened.contents.accounts[0].environment).toBe('live')
    expect(opened.contents.accounts[0].apiKey).toBe('binance-api-key')
  })

  it('still refuses a stored environment that is not a known value',
    async () => {
      const crypto = new VaultCrypto()
      const corrupt = {
        version: 1,
        accounts: [{
          ...contentsWith('live').accounts[0],
          environment: 'producao',
        }],
      } as unknown as VaultContents
      const envelope = await crypto.create(password, corrupt)

      await expect(crypto.unlock(password, envelope.envelope)).rejects.toThrow()
    })
})
