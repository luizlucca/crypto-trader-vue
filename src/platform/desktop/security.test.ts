import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SecurityRequest,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { desktopSecurity } from './security'

const snapshot: SecuritySnapshot = {
  state: 'locked',
  hasVault: true,
  accounts: [],
  preferences: {
    lockOnMinimize: true,
    lockOnSuspend: true,
    idleTimeoutMinutes: 15,
    closeAction: 'quit-and-lock',
  },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktopSecurity', () => {
  it('forwards clone-safe security requests to the preload API', async () => {
    const request = vi.fn().mockResolvedValue(snapshot)
    vi.stubGlobal('window', {
      cryptoPro: {
        security: { request },
      },
    })
    const command = reactive<SecurityRequest>({
      kind: 'unlock',
      password: 'Abcdef1!',
    })

    await expect(desktopSecurity().request(command))
      .resolves.toEqual(snapshot)

    const payload = request.mock.calls[0][0]
    expect(() => structuredClone(payload)).not.toThrow()
    expect(payload).toEqual({ kind: 'unlock', password: 'Abcdef1!' })
  })

  it('fails clearly without the secure Electron preload API', () => {
    vi.stubGlobal('window', {})

    expect(() => desktopSecurity()).toThrow('API Electron indisponível')
  })
})
