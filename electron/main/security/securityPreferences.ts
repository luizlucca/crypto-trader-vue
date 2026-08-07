import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
} from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
import {
  DEFAULT_SECURITY_PREFERENCES,
  isSecurityPreferences,
  projectSecurityPreferences,
  type SecurityPreferences,
} from '@shared/contracts/security'

const FILE_MODE = 0o600

export { isSecurityPreferences } from '@shared/contracts/security'

function copyPreferences(
  preferences: SecurityPreferences,
): SecurityPreferences {
  return {
    lockOnMinimize: preferences.lockOnMinimize,
    lockOnSuspend: preferences.lockOnSuspend,
    idleTimeoutMinutes: preferences.idleTimeoutMinutes,
    closeAction: preferences.closeAction,
  }
}

export class SecurityPreferencesStore {
  constructor(readonly path: string) {}

  async read(): Promise<SecurityPreferences> {
    try {
      const contents: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      const preferences = projectSecurityPreferences(contents)
      if (!preferences) {
        throw new Error('Preferências de segurança inválidas')
      }
      if (!isSecurityPreferences(contents)) {
        await this.write(preferences)
      }
      return copyPreferences(preferences)
    } catch (error: unknown) {
      if (this.isMissingFile(error)) {
        return copyPreferences(DEFAULT_SECURITY_PREFERENCES)
      }
      throw error
    }
  }

  async write(preferences: SecurityPreferences): Promise<SecurityPreferences> {
    if (!isSecurityPreferences(preferences)) {
      throw new Error('Preferências de segurança inválidas')
    }

    await mkdir(dirname(this.path), { recursive: true })
    const suffix = randomBytes(8).toString('hex')
    const temporaryPath = `${this.path}.${process.pid}.${suffix}.tmp`
    let handle: Awaited<ReturnType<typeof open>> | undefined
    try {
      handle = await open(temporaryPath, 'wx', FILE_MODE)
      const projected = copyPreferences(preferences)
      await handle.writeFile(JSON.stringify(projected), 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.path)
      return projected
    } finally {
      await handle?.close()
      await rm(temporaryPath, { force: true })
    }
  }

  private isMissingFile(error: unknown): boolean {
    return Boolean(
      error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT',
    )
  }
}
