import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SECURITY_PREFERENCES } from '@shared/contracts/security'
import { SecurityPreferencesStore } from './securityPreferences'

const temporaryDirectories: string[] = []

async function temporaryPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cryptopro-preferences-'))
  temporaryDirectories.push(directory)
  return join(directory, 'security-preferences.v1.json')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )))
})

describe('SecurityPreferencesStore', () => {
  it('returns approved defaults before a preferences file exists', async () => {
    const store = new SecurityPreferencesStore(await temporaryPath())

    await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
  })

  it('persists only a valid lock policy', async () => {
    const path = await temporaryPath()
    const store = new SecurityPreferencesStore(path)
    const preferences = {
      lockOnMinimize: false,
      lockOnSuspend: true,
      idleTimeoutMinutes: 30 as const,
      closeAction: 'lock-and-minimize' as const,
    }

    await expect(store.write(preferences)).resolves.toEqual(preferences)
    await expect(new SecurityPreferencesStore(path).read())
      .resolves.toEqual(preferences)
    await expect(readFile(path, 'utf8')).resolves.toContain('lock-and-minimize')
  })

  it('rejects unsupported timer values without replacing preferences',
    async () => {
      const path = await temporaryPath()
      const store = new SecurityPreferencesStore(path)
      await store.write(DEFAULT_SECURITY_PREFERENCES)

      await expect(store.write({
        ...DEFAULT_SECURITY_PREFERENCES,
        idleTimeoutMinutes: 2,
      } as never)).rejects.toThrow('Preferências de segurança inválidas')

      await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
    },
  )
})
