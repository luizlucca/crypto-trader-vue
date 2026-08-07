import { describe, expect, it } from 'vitest'
import {
  VaultCrypto,
  VaultIntegrityError,
  type VaultContents,
} from './vaultCrypto'

const password = 'Abcdef1!'
const contents: VaultContents = {
  version: 1,
  accounts: [{
    accountId: 'account-one',
    provider: 'binance',
    label: 'Conta principal',
    markets: ['spot'],
    apiKey: 'binance-api-key',
    apiSecret: 'binance-secret',
  }],
}

describe('VaultCrypto', () => {
  it('encrypts a vault without serializing credential plaintext', async () => {
    const crypto = new VaultCrypto()
    const created = await crypto.create(password, contents)

    expect(JSON.stringify(created.envelope)).not.toContain('binance-api-key')
    expect(JSON.stringify(created.envelope)).not.toContain('binance-secret')

    const unlocked = await crypto.unlock(password, created.envelope)
    expect(unlocked.contents).toEqual(contents)
  })

  it('rejects a vault whose authentication tag was changed', async () => {
    const crypto = new VaultCrypto()
    const created = await crypto.create(password, contents)
    const authTag = Buffer.from(created.envelope.cipher.authTag, 'base64')
    authTag[0] ^= 1
    const tampered = {
      ...created.envelope,
      cipher: {
        ...created.envelope.cipher,
        authTag: authTag.toString('base64'),
      },
    }

    await expect(crypto.unlock(password, tampered)).rejects
      .toBeInstanceOf(VaultIntegrityError)
  })

  it('uses a fresh IV each time an unlocked vault is persisted', async () => {
    const crypto = new VaultCrypto()
    const created = await crypto.create(password, contents)
    const sealed = await crypto.seal(
      created.contents,
      created.key,
      created.envelope,
    )

    expect(sealed.cipher.iv).not.toBe(created.envelope.cipher.iv)
    await expect(crypto.unlock(password, sealed)).resolves.toMatchObject({
      contents,
    })
  })

  it('normalizes the legacy enabled preference after unlocking', async () => {
    const crypto = new VaultCrypto()
    const legacyContents = {
      version: 1,
      accounts: [{
        accountId: 'legacy-account',
        provider: 'binance',
        label: 'Conta legada',
        markets: ['spot'],
        apiKey: 'legacy-api-key',
        apiSecret: 'legacy-api-secret',
        enabled: true,
      }],
    }
    const encrypted = await crypto.create(password, legacyContents as VaultContents)

    const unlocked = await crypto.unlock(password, encrypted.envelope)

    expect(unlocked.contents.accounts[0]).toMatchObject({
      accountId: 'legacy-account',
      provider: 'binance',
    })
    expect(unlocked.contents.accounts[0]).not.toHaveProperty('enabled')
  })
})
