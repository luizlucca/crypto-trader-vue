import {
  access,
  chmod,
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

export class VaultRepository {
  constructor(readonly path: string) {}

  async exists(): Promise<boolean> {
    try {
      await access(this.path)
      return true
    } catch {
      return false
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
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.path)
      if (process.platform !== 'win32') {
        await chmod(this.path, FILE_MODE)
      }
    } finally {
      await handle?.close()
      await rm(temporaryPath, { force: true })
    }
  }

  async destroy(): Promise<void> {
    await rm(this.path, { force: true })
  }
}
