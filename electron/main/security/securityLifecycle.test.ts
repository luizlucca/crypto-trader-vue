import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSecurityLifecycle } from './securityLifecycle'

class FakeWindow extends EventEmitter {
  minimize = vi.fn()
}

class FakePowerMonitor extends EventEmitter {}

function createSession(closeAction: 'quit-and-lock' | 'lock-and-minimize') {
  return {
    lock: vi.fn(),
    lockIfEnabled: vi.fn(),
    closeAction: () => closeAction,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bindSecurityLifecycle', () => {
  it('locks when minimized, suspended or screen-locked', () => {
    const window = new FakeWindow()
    const powerMonitor = new FakePowerMonitor()
    const session = createSession('quit-and-lock')
    const dispose = bindSecurityLifecycle({
      window,
      powerMonitor,
      session,
      isQuitting: () => false,
      requestQuit: vi.fn(),
      platform: 'darwin',
    })

    window.emit('minimize')
    powerMonitor.emit('suspend')
    powerMonitor.emit('lock-screen')

    expect(session.lockIfEnabled).toHaveBeenCalledWith('minimize')
    expect(session.lockIfEnabled).toHaveBeenCalledWith('suspend')
    expect(session.lockIfEnabled).toHaveBeenCalledTimes(3)
    dispose()
  })

  it('does not attach unavailable lock-screen events on Linux', () => {
    const window = new FakeWindow()
    const powerMonitor = new FakePowerMonitor()
    const session = createSession('quit-and-lock')
    bindSecurityLifecycle({
      window,
      powerMonitor,
      session,
      isQuitting: () => false,
      requestQuit: vi.fn(),
      platform: 'linux',
    })

    expect(powerMonitor.listenerCount('lock-screen')).toBe(0)
  })

  it('requests quit once after locking a Darwin close', () => {
    const window = new FakeWindow()
    const session = createSession('quit-and-lock')
    const closeEvent = { preventDefault: vi.fn() }
    const reentryEvent = { preventDefault: vi.fn() }
    let quitting = false
    const requestQuit = vi.fn(() => {
      quitting = true
      window.emit('close', reentryEvent)
    })

    bindSecurityLifecycle({
      window,
      powerMonitor: new FakePowerMonitor(),
      session,
      isQuitting: () => quitting,
      requestQuit,
      platform: 'darwin',
    })

    window.emit('close', closeEvent)

    expect(session.lock).toHaveBeenCalledWith('window-close')
    expect(session.lock).toHaveBeenCalledOnce()
    expect(closeEvent.preventDefault).toHaveBeenCalledOnce()
    expect(requestQuit).toHaveBeenCalledOnce()
    expect(reentryEvent.preventDefault).not.toHaveBeenCalled()
    expect(window.minimize).not.toHaveBeenCalled()
  })

  it('locks before minimizing instead of closing when configured', () => {
    const window = new FakeWindow()
    const session = createSession('lock-and-minimize')
    const event = { preventDefault: vi.fn() }
    const dispose = bindSecurityLifecycle({
      window,
      powerMonitor: new FakePowerMonitor(),
      session,
      isQuitting: () => false,
      requestQuit: vi.fn(),
    })

    window.emit('close', event)

    expect(session.lock).toHaveBeenCalledWith('window-close')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.minimize).toHaveBeenCalledOnce()
    dispose()
  })

  it('leaves a real quit for the before-quit shutdown handler', () => {
    const window = new FakeWindow()
    const session = createSession('lock-and-minimize')
    const event = { preventDefault: vi.fn() }
    const dispose = bindSecurityLifecycle({
      window,
      powerMonitor: new FakePowerMonitor(),
      session,
      isQuitting: () => true,
      requestQuit: vi.fn(),
    })

    window.emit('close', event)

    expect(session.lock).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.minimize).not.toHaveBeenCalled()
    dispose()
  })
})
