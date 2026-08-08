import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultCrypto, type VaultContents } from './vaultCrypto'
import { VaultRepository } from './vaultRepository'

const chmodControl = vi.hoisted(() => ({ shouldFail: false }))

// Both spellings are intercepted so the guarantee holds however the mode is
// applied: through the open descriptor or through the path.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    chmod: async (
      ...args: Parameters<typeof actual.chmod>
    ): Promise<void> => {
      if (chmodControl.shouldFail) {
        throw Object.assign(new Error('chmod recusado'), { code: 'EPERM' })
      }
      await actual.chmod(...args)
    },
    open: async (
      ...args: Parameters<typeof actual.open>
    ): ReturnType<typeof actual.open> => {
      const handle = await actual.open(...args)
      const applyMode = handle.chmod.bind(handle)
      handle.chmod = async (mode: number): Promise<void> => {
        if (chmodControl.shouldFail) {
          throw Object.assign(new Error('chmod recusado'), { code: 'EPERM' })
        }
        await applyMode(mode)
      }
      return handle
    },
  }
})

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
    environment: 'live',
    label: 'Conta principal',
    markets: ['futures'],
    apiKey: 'binance-api-key',
    apiSecret: 'binance-secret',
  }],
}

afterEach(async () => {
  chmodControl.shouldFail = false
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

  it('propagates a filesystem failure instead of reporting no vault',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'cryptopro-vault-'))
      createdDirectories.push(directory)
      const blocker = join(directory, 'blocker')
      await writeFile(blocker, 'not a directory', 'utf8')
      const repository = new VaultRepository(
        join(blocker, 'credentials.v1.enc'),
      )

      await expect(repository.exists()).rejects.toMatchObject({
        code: 'ENOTDIR',
      })
    })

  it.skipIf(process.platform === 'win32')(
    'keeps the previous document when the mode cannot be applied',
    async () => {
      const repository = await createRepository()
      const crypto = new VaultCrypto()
      const stored = await crypto.create('Abcdef1!', contents)
      await repository.write(stored.envelope)
      const rotated = await crypto.create('Zyxwvu9@', {
        version: 1,
        accounts: [],
      })

      chmodControl.shouldFail = true

      await expect(repository.write(rotated.envelope)).rejects.toThrow()
      await expect(repository.read()).resolves.toEqual(stored.envelope)
    },
  )

  it('reports no vault when the file is merely absent', async () => {
    const repository = await createRepository()

    await expect(repository.exists()).resolves.toBe(false)
  })

  it('removes the vault during an irreversible reset', async () => {
    const repository = await createRepository()
    const encrypted = await new VaultCrypto().create('Abcdef1!', contents)
    await repository.write(encrypted.envelope)

    await repository.destroy()

    await expect(repository.exists()).resolves.toBe(false)
  })
})
