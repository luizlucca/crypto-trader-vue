import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { VaultCrypto, type VaultContents } from './vaultCrypto'
import { VaultRepository } from './vaultRepository'

const createdDirectories: string[] = []

async function createRepository(): Promise<VaultRepository> {
  const directory = await mkdtemp(join(tmpdir(), 'cryptopro-vault-'))
  createdDirectories.push(directory)
  return new VaultRepository(join(directory, 'credentials.v1.enc'))
}

const contents: VaultContents = {
  version: 1,
  accounts: [{
    accountId: 'account-one',
    provider: 'binance',
    label: 'Conta principal',
    markets: ['futures'],
    apiKey: 'binance-api-key',
    apiSecret: 'binance-secret',
  }],
}

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => (
    rm(directory, { force: true, recursive: true })
  )))
})

describe('VaultRepository', () => {
  it('writes an encrypted vault atomically with restricted POSIX permissions',
    async () => {
      const repository = await createRepository()
      const encrypted = await new VaultCrypto().create('Abcdef1!', contents)

      await repository.write(encrypted.envelope)

      await expect(repository.read()).resolves.toEqual(encrypted.envelope)
      const disk = await readFile(repository.path, 'utf8')
      expect(disk).not.toContain('binance-api-key')
      expect(disk).not.toContain('binance-secret')
      if (process.platform !== 'win32') {
        expect((await stat(repository.path)).mode & 0o777).toBe(0o600)
      }
    })

  it('removes the vault during an irreversible reset', async () => {
    const repository = await createRepository()
    const encrypted = await new VaultCrypto().create('Abcdef1!', contents)
    await repository.write(encrypted.envelope)

    await repository.destroy()

    await expect(repository.exists()).resolves.toBe(false)
  })
})
