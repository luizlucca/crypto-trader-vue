import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

  it('rejects injected fields without persisting them', async () => {
    const path = await temporaryPath()
    const store = new SecurityPreferencesStore(path)
    await store.write(DEFAULT_SECURITY_PREFERENCES)

    await expect(store.write({
      ...DEFAULT_SECURITY_PREFERENCES,
      apiSecret: 'must-not-be-persisted',
    } as never)).rejects.toThrow('Preferências de segurança inválidas')

    await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
    await expect(readFile(path, 'utf8').then(JSON.parse))
      .resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
  })

  it('quarantines a truncated preferences file instead of failing the boot',
    async () => {
      const path = await temporaryPath()
      await writeFile(path, '{"lockOnMinimize": tru', 'utf8')
      const store = new SecurityPreferencesStore(path)

      await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)

      await expect(readFile(`${path}.corrupt`, 'utf8'))
        .resolves.toBe('{"lockOnMinimize": tru')
      await expect(readFile(path, 'utf8').then(JSON.parse))
        .resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
    },
  )

  it('quarantines preferences written with an unsupported shape', async () => {
    const path = await temporaryPath()
    await writeFile(path, JSON.stringify({
      ...DEFAULT_SECURITY_PREFERENCES,
      closeAction: 'stay-unlocked',
    }), 'utf8')
    const store = new SecurityPreferencesStore(path)

    await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
    await expect(readFile(`${path}.corrupt`, 'utf8'))
      .resolves.toContain('stay-unlocked')
  })

  it('sanitizes legacy preference files with injected fields', async () => {
    const path = await temporaryPath()
    await writeFile(path, JSON.stringify({
      ...DEFAULT_SECURITY_PREFERENCES,
      apiSecret: 'legacy-value',
    }), 'utf8')
    const store = new SecurityPreferencesStore(path)

    await expect(store.read()).resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
    await expect(readFile(path, 'utf8').then(JSON.parse))
      .resolves.toEqual(DEFAULT_SECURITY_PREFERENCES)
  })
})
