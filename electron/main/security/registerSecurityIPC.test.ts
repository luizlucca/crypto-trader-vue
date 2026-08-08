import { describe, expect, it, vi } from 'vitest'
import type {
  SecurityRequest,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { DESKTOP_CHANNELS } from '@shared/contracts/desktop'
import { registerSecurityIPC } from './registerSecurityIPC'

const snapshot: SecuritySnapshot = {
  state: 'locked',
  hasVault: true,
  accounts: [],
  connection: { state: 'disconnected' },
  preferences: {
    lockOnMinimize: true,
    lockOnSuspend: true,
    idleTimeoutMinutes: 15,
    closeAction: 'quit-and-lock',
  },
}

function createSession() {
  return {
    request: vi.fn().mockResolvedValue(snapshot),
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  }
}

interface TestIpcEvent {
  sender: { id: number }
}

type TestIpcHandler = (event: TestIpcEvent, value: unknown) => unknown

function createIPC() {
  let handler: TestIpcHandler | undefined
  return {
    handle: vi.fn((_: string, nextHandler) => {
      handler = nextHandler
    }),
    removeHandler: vi.fn(),
    request(event: TestIpcEvent, value: unknown): Promise<unknown> {
      if (!handler) {
        throw new Error('Handler não registrado')
      }
      return Promise.resolve(handler(event, value))
    },
  }
}

describe('registerSecurityIPC', () => {
  it('rejects every security request from the search window', async () => {
    const ipc = createIPC()
    const session = createSession()
    registerSecurityIPC({
      ipc,
      getMainWebContentsId: () => 10,
      session,
      send: vi.fn(),
    })

    await expect(ipc.request({ sender: { id: 20 } }, { kind: 'get-snapshot' }))
      .rejects.toThrow('Acesso de segurança não permitido')
    expect(session.request).not.toHaveBeenCalled()
  })

  it('validates payloads and sends only state snapshots', async () => {
    const ipc = createIPC()
    const session = createSession()
    const send = vi.fn()
    registerSecurityIPC({
      ipc,
      getMainWebContentsId: () => 10,
      session,
      send,
    })

    await expect(ipc.request({ sender: { id: 10 } }, { kind: 'invalid' }))
      .rejects.toThrow('Comando de segurança inválido')

    const request: SecurityRequest = { kind: 'get-snapshot' }
    await expect(ipc.request({ sender: { id: 10 } }, request))
      .resolves.toEqual(snapshot)
    expect(session.request).toHaveBeenCalledWith(request)

    const listener = session.subscribe.mock.calls[0][0] as (
      value: SecuritySnapshot,
    ) => void
    listener(snapshot)
    expect(send).toHaveBeenCalledWith(snapshot)
  })

  it('rejects injected request fields before they reach the session',
    async () => {
      const ipc = createIPC()
      const session = createSession()
      registerSecurityIPC({
        ipc,
        getMainWebContentsId: () => 10,
        session,
        send: vi.fn(),
      })

      await expect(ipc.request({ sender: { id: 10 } }, {
        kind: 'update-preferences',
        preferences: {
          ...snapshot.preferences,
          apiSecret: 'must-not-reach-the-session',
        },
      })).rejects.toThrow('Comando de segurança inválido')

      expect(session.request).not.toHaveBeenCalled()
    },
  )

  it('forwards valid explicit connections and rejects invalid account ids',
    async () => {
      const ipc = createIPC()
      const session = createSession()
      registerSecurityIPC({
        ipc,
        getMainWebContentsId: () => 10,
        session,
        send: vi.fn(),
      })

      const connect: SecurityRequest = {
        kind: 'connect-account',
        accountId: 'account-one',
      }
      await expect(ipc.request({ sender: { id: 10 } }, connect))
        .resolves.toEqual(snapshot)
      await expect(ipc.request({ sender: { id: 10 } }, {
        kind: 'connect-account',
        accountId: 'invalid account id',
      })).rejects.toThrow('Comando de segurança inválido')

      expect(session.request).toHaveBeenCalledWith(connect)
    },
  )

  it('removes the IPC handler and subscription during shutdown', () => {
    const ipc = createIPC()
    const session = createSession()
    const release = vi.fn()
    session.subscribe.mockReturnValue(release)
    const dispose = registerSecurityIPC({
      ipc,
      getMainWebContentsId: () => 10,
      session,
      send: vi.fn(),
    })

    dispose()

    expect(release).toHaveBeenCalledOnce()
    expect(ipc.removeHandler)
      .toHaveBeenCalledWith(DESKTOP_CHANNELS.securityRequest)
  })
})
