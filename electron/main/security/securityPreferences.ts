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
  type IdleTimeoutMinutes,
  type SecurityPreferences,
} from '@shared/contracts/security'

const FILE_MODE = 0o600

function copyPreferences(
  preferences: SecurityPreferences,
): SecurityPreferences {
  return { ...preferences }
}

function isIdleTimeoutMinutes(value: unknown): value is IdleTimeoutMinutes {
  return value === 0
    || value === 1
    || value === 5
    || value === 15
    || value === 30
    || value === 60
    || value === 120
}

export function isSecurityPreferences(
  value: unknown,
): value is SecurityPreferences {
  if (!value || typeof value !== 'object') {
    return false
  }

  const preferences = value as Partial<SecurityPreferences>
  return typeof preferences.lockOnMinimize === 'boolean'
    && typeof preferences.lockOnSuspend === 'boolean'
    && isIdleTimeoutMinutes(preferences.idleTimeoutMinutes)
    && (
      preferences.closeAction === 'quit-and-lock'
      || preferences.closeAction === 'lock-and-minimize'
    )
}

export class SecurityPreferencesStore {
  constructor(readonly path: string) {}

  async read(): Promise<SecurityPreferences> {
    try {
      const contents: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!isSecurityPreferences(contents)) {
        throw new Error('Preferências de segurança inválidas')
      }
      return copyPreferences(contents)
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
      await handle.writeFile(JSON.stringify(preferences), 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporaryPath, this.path)
      return copyPreferences(preferences)
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
