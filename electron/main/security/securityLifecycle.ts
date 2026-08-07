import type { SecurityPreferences } from '@shared/contracts/security'
import type { LockReason } from './securitySession'

interface LifecycleWindow {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
  minimize(): void
}

interface LifecyclePowerMonitor {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown
}

interface LifecycleSession {
  lock(reason: LockReason): unknown
  lockIfEnabled(reason: 'minimize' | 'suspend'): unknown
  closeAction(): SecurityPreferences['closeAction']
}

interface CloseEvent {
  preventDefault(): void
}

interface SecurityLifecycleOptions {
  window: LifecycleWindow
  powerMonitor: LifecyclePowerMonitor
  session: LifecycleSession
  isQuitting: () => boolean
  platform?: NodeJS.Platform
}

export function bindSecurityLifecycle(
  options: SecurityLifecycleOptions,
): () => void {
  const onMinimize = (): void => {
    options.session.lockIfEnabled('minimize')
  }
  const onSuspend = (): void => {
    options.session.lockIfEnabled('suspend')
  }
  const onLockScreen = (): void => {
    options.session.lockIfEnabled('suspend')
  }
  const onClose = (event: unknown): void => {
    options.session.lock('window-close')
    if (
      options.isQuitting()
      || options.session.closeAction() !== 'lock-and-minimize'
    ) {
      return
    }

    const closeEvent = event as CloseEvent
    closeEvent.preventDefault()
    options.window.minimize()
  }

  options.window.on('minimize', onMinimize)
  options.window.on('close', onClose)
  options.powerMonitor.on('suspend', onSuspend)
  if (options.platform !== 'linux') {
    options.powerMonitor.on('lock-screen', onLockScreen)
  }

  return () => {
    options.window.removeListener('minimize', onMinimize)
    options.window.removeListener('close', onClose)
    options.powerMonitor.removeListener('suspend', onSuspend)
    if (options.platform !== 'linux') {
      options.powerMonitor.removeListener('lock-screen', onLockScreen)
    }
  }
}
