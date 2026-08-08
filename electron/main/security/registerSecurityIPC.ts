import {
  DESKTOP_CHANNELS,
} from '@shared/contracts/desktop'
import {
  isSecurityRequest,
  type SecurityRequest,
  type SecuritySnapshot,
} from '@shared/contracts/security'

interface SecurityIpcEvent {
  sender: { id: number }
}

type SecurityIpcHandler = (
  event: SecurityIpcEvent,
  value: unknown,
) => Promise<SecuritySnapshot>

interface SecurityIpcMain {
  handle(channel: string, handler: SecurityIpcHandler): void
  removeHandler(channel: string): void
}

interface SecurityIpcSession {
  request(request: SecurityRequest): Promise<SecuritySnapshot>
  subscribe(listener: (snapshot: SecuritySnapshot) => void): () => void
}

interface RegisterSecurityIPCOptions {
  ipc: SecurityIpcMain
  getMainWebContentsId: () => number | undefined
  session: SecurityIpcSession
  send: (snapshot: SecuritySnapshot) => void
}

export function registerSecurityIPC(
  options: RegisterSecurityIPCOptions,
): () => void {
  const unsubscribe = options.session.subscribe(options.send)
  options.ipc.handle(
    DESKTOP_CHANNELS.securityRequest,
    async (event, value) => {
      if (event.sender.id !== options.getMainWebContentsId()) {
        throw new Error('Acesso de segurança não permitido')
      }
      if (!isSecurityRequest(value)) {
        throw new Error('Comando de segurança inválido')
      }
      return options.session.request(value)
    },
  )

  return () => {
    unsubscribe()
    options.ipc.removeHandler(DESKTOP_CHANNELS.securityRequest)
  }
}
