import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from 'node:crypto'
import type { Market } from '@shared/types/market'

const KDF_NAME = 'scrypt' as const
const KDF_N = 32_768 as const
const KDF_R = 8 as const
const KDF_P = 1 as const
const KDF_MAX_MEMORY = 64 * 1024 * 1024
const KEY_LENGTH = 32
const SALT_LENGTH = 16
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const VAULT_AAD = Buffer.from('cryptopro:credential-vault:v1')

export interface EncryptedCredentialVaultV1 {
  version: 1
  kdf: {
    name: 'scrypt'
    N: 32_768
    r: 8
    p: 1
    salt: string
  }
  cipher: {
    name: 'aes-256-gcm'
    iv: string
    ciphertext: string
    authTag: string
  }
}

export interface ProviderAccountRecord {
  accountId: string
  provider: 'binance'
  label: string
  markets: readonly Market[]
  apiKey: string
  apiSecret: string
}

export interface VaultContents {
  version: 1
  accounts: ProviderAccountRecord[]
}

export interface UnlockedVault {
  contents: VaultContents
  key: Buffer
  envelope: EncryptedCredentialVaultV1
}

export class VaultIntegrityError extends Error {
  constructor() {
    super('Não foi possível abrir o cofre de credenciais')
    this.name = 'VaultIntegrityError'
  }
}

function asBase64(buffer: Buffer): string {
  return buffer.toString('base64')
}

function isBase64(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isEncryptedCredentialVaultV1(
  value: unknown,
): value is EncryptedCredentialVaultV1 {
  if (!value || typeof value !== 'object') {
    return false
  }
  const envelope = value as Partial<EncryptedCredentialVaultV1>
  return envelope.version === 1
    && envelope.kdf?.name === KDF_NAME
    && envelope.kdf.N === KDF_N
    && envelope.kdf.r === KDF_R
    && envelope.kdf.p === KDF_P
    && isBase64(envelope.kdf.salt)
    && envelope.cipher?.name === 'aes-256-gcm'
    && isBase64(envelope.cipher.iv)
    && isBase64(envelope.cipher.ciphertext)
    && isBase64(envelope.cipher.authTag)
}

function isMarket(value: unknown): value is Market {
  return value === 'spot' || value === 'futures'
}

function isVaultContents(value: unknown): value is VaultContents {
  if (!value || typeof value !== 'object') {
    return false
  }
  const contents = value as Partial<VaultContents>
  return contents.version === 1
    && Array.isArray(contents.accounts)
    && contents.accounts.every((account) => {
      const stored = account as ProviderAccountRecord & { enabled?: unknown }
      return account
        && typeof account === 'object'
        && typeof stored.accountId === 'string'
        && stored.provider === 'binance'
        && typeof stored.label === 'string'
        && Array.isArray(stored.markets)
        && stored.markets.length > 0
        && stored.markets.every(isMarket)
        && typeof stored.apiKey === 'string'
        && typeof stored.apiSecret === 'string'
        && (stored.enabled === undefined || typeof stored.enabled === 'boolean')
    })
}

function normalizeContents(contents: VaultContents): VaultContents {
  return {
    version: contents.version,
    accounts: contents.accounts.map((stored) => ({
      accountId: stored.accountId,
      provider: stored.provider,
      label: stored.label,
      markets: [...stored.markets],
      apiKey: stored.apiKey,
      apiSecret: stored.apiSecret,
    })),
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, {
      N: KDF_N,
      r: KDF_R,
      p: KDF_P,
      maxmem: KDF_MAX_MEMORY,
    }, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(Buffer.from(key))
    })
  })
}

function newKdf(): EncryptedCredentialVaultV1['kdf'] {
  return {
    name: KDF_NAME,
    N: KDF_N,
    r: KDF_R,
    p: KDF_P,
    salt: asBase64(randomBytes(SALT_LENGTH)),
  }
}

export function zeroBuffer(buffer?: Buffer): void {
  buffer?.fill(0)
}

export class VaultCrypto {
  async create(
    password: string,
    contents: VaultContents,
  ): Promise<UnlockedVault> {
    const kdf = newKdf()
    const key = await deriveKey(password, Buffer.from(kdf.salt, 'base64'))
    const envelope = await this.sealWithKdf(contents, key, kdf)
    return { contents, key, envelope }
  }

  async unlock(
    password: string,
    envelope: EncryptedCredentialVaultV1,
  ): Promise<UnlockedVault> {
    if (!isEncryptedCredentialVaultV1(envelope)) {
      throw new VaultIntegrityError()
    }

    let key: Buffer | undefined
    try {
      key = await deriveKey(password, Buffer.from(envelope.kdf.salt, 'base64'))
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(envelope.cipher.iv, 'base64'),
      )
      decipher.setAAD(VAULT_AAD)
      decipher.setAuthTag(Buffer.from(envelope.cipher.authTag, 'base64'))
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.cipher.ciphertext, 'base64')),
        decipher.final(),
      ])
      try {
        const contents: unknown = JSON.parse(plaintext.toString('utf8'))
        if (!isVaultContents(contents)) {
          throw new VaultIntegrityError()
        }
        return { contents: normalizeContents(contents), key, envelope }
      } finally {
        zeroBuffer(plaintext)
      }
    } catch {
      zeroBuffer(key)
      throw new VaultIntegrityError()
    }
  }

  async seal(
    contents: VaultContents,
    key: Buffer,
    current: EncryptedCredentialVaultV1,
  ): Promise<EncryptedCredentialVaultV1> {
    if (!isEncryptedCredentialVaultV1(current)) {
      throw new VaultIntegrityError()
    }
    return this.sealWithKdf(contents, key, current.kdf)
  }

  private async sealWithKdf(
    contents: VaultContents,
    key: Buffer,
    kdf: EncryptedCredentialVaultV1['kdf'],
  ): Promise<EncryptedCredentialVaultV1> {
    const plaintext = Buffer.from(JSON.stringify(contents), 'utf8')
    const iv = randomBytes(IV_LENGTH)
    try {
      const cipher = createCipheriv('aes-256-gcm', key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      })
      cipher.setAAD(VAULT_AAD)
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ])
      try {
        return {
          version: 1,
          kdf,
          cipher: {
            name: 'aes-256-gcm',
            iv: asBase64(iv),
            ciphertext: asBase64(ciphertext),
            authTag: asBase64(cipher.getAuthTag()),
          },
        }
      } finally {
        zeroBuffer(ciphertext)
      }
    } finally {
      zeroBuffer(plaintext)
      zeroBuffer(iv)
    }
  }
}
