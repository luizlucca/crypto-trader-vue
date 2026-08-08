import { readonly, shallowRef, type ShallowRef } from 'vue'
import {
  DEFAULT_SECURITY_PREFERENCES,
  type DesktopSecurityAPI,
  type SecurityRequest,
  type SecuritySnapshot,
} from '@shared/contracts/security'
import { desktopSecurity } from '@desktop/security'

const INITIAL_SECURITY_SNAPSHOT: SecuritySnapshot = {
  state: 'setup-required',
  hasVault: false,
  accounts: [],
  connection: { state: 'disconnected' },
  preferences: DEFAULT_SECURITY_PREFERENCES,
}

export interface RendererSecuritySession {
  snapshot: Readonly<ShallowRef<SecuritySnapshot>>
  refresh(): Promise<SecuritySnapshot>
  request(request: SecurityRequest): Promise<SecuritySnapshot>
  start(): () => void
  stop(): void
}

export function createSecuritySession(
  api: DesktopSecurityAPI = desktopSecurity(),
): RendererSecuritySession {
  const snapshot = shallowRef<SecuritySnapshot>(INITIAL_SECURITY_SNAPSHOT)
  let unsubscribe: (() => void) | undefined

  function apply(next: SecuritySnapshot): SecuritySnapshot {
    snapshot.value = next
    return next
  }

  async function refresh(): Promise<SecuritySnapshot> {
    return apply(await api.getSnapshot())
  }

  async function request(
    nextRequest: SecurityRequest,
  ): Promise<SecuritySnapshot> {
    return apply(await api.request(structuredClone(nextRequest)))
  }

  function stop(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  function start(): () => void {
    if (!unsubscribe) {
      unsubscribe = api.onState(apply)
      void refresh().catch(() => undefined)
    }
    return stop
  }

  return {
    snapshot: readonly(snapshot),
    refresh,
    request,
    start,
    stop,
  }
}

let sharedSession: RendererSecuritySession | undefined

export function useSecuritySession(): RendererSecuritySession {
  sharedSession ??= createSecuritySession()
  return sharedSession
}
