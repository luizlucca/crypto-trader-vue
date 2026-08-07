import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import type { EncryptedCredentialVaultV1 } from './vaultCrypto'

const FILE_MODE = 0o600

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'ENOENT',
  )
}

export class VaultRepository {
  constructor(readonly path: string) {}

  async exists(): Promise<boolean> {
    try {
      await access(this.path)
      return true
    } catch (error: unknown) {
      // Only a missing file proves there is no vault. Reading an I/O failure
      // as "no vault" drops the session into setup-required, and the next
      // write then replaces real credentials without asking for their
      // password.
      if (isMissingFile(error)) {
        return false
      }
      throw error
    }
  }

  async read(): Promise<EncryptedCredentialVaultV1> {
    const content = await readFile(this.path, 'utf8')
    return JSON.parse(content) as EncryptedCredentialVaultV1
  }

  async write(envelope: EncryptedCredentialVaultV1): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const randomSuffix = randomBytes(8).toString('hex')
    const temporaryPath = `${this.path}.${process.pid}.${randomSuffix}.tmp`
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(temporaryPath, 'wx', FILE_MODE)
      await handle.writeFile(JSON.stringify(envelope), 'utf8')
      if (process.platform !== 'win32') {
        // The open mode is filtered by umask, so the mode is forced here --
        // before the rename, which is the commit point. Doing it afterwards
        // leaves the new document on disk while write() reports failure.
        await handle.chmod(FILE_MODE)
      }
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.path)
    } finally {
      await handle?.close()
      await rm(temporaryPath, { force: true })
    }
  }

  async destroy(): Promise<void> {
    await rm(this.path, { force: true })
  }
}
