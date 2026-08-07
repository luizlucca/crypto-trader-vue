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
    let contents: unknown
    try {
      contents = JSON.parse(await readFile(this.path, 'utf8'))
    } catch (error: unknown) {
      if (this.isMissingFile(error)) {
        return copyPreferences(DEFAULT_SECURITY_PREFERENCES)
      }
      return this.replaceWithDefaults()
    }

    const preferences = projectSecurityPreferences(contents)
    if (!preferences) {
      return this.replaceWithDefaults()
    }
    if (!isSecurityPreferences(contents)) {
      await this.persistQuietly(preferences)
    }
    return copyPreferences(preferences)
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

  // SecuritySession.initialize() runs before the window is opened, and
  // index.ts awaits it without a handler. A preferences file that cannot be
  // parsed must therefore degrade to the safe defaults: throwing here leaves
  // the process alive with no interface to repair the file from.
  private async replaceWithDefaults(): Promise<SecurityPreferences> {
    await this.quarantine()
    const defaults = copyPreferences(DEFAULT_SECURITY_PREFERENCES)
    await this.persistQuietly(defaults)
    return defaults
  }

  // The rejected file is kept for diagnosis rather than overwritten blindly.
  private async quarantine(): Promise<void> {
    try {
      await rename(this.path, `${this.path}.corrupt`)
    } catch {
      // Boot continues on safe defaults whether or not the move succeeds.
    }
  }

  private async persistQuietly(
    preferences: SecurityPreferences,
  ): Promise<void> {
    try {
      await this.write(preferences)
    } catch {
      // Lock preferences are not credentials: an unwritable file costs the
      // choices made, never the ability to start.
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
