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
    })

    window.emit('minimize')
    powerMonitor.emit('suspend')
    powerMonitor.emit('lock-screen')

    expect(session.lockIfEnabled).toHaveBeenCalledWith('minimize')
    expect(session.lockIfEnabled).toHaveBeenCalledWith('suspend')
    expect(session.lockIfEnabled).toHaveBeenCalledTimes(3)
    dispose()
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
    })

    window.emit('close', event)

    expect(session.lock).toHaveBeenCalledWith('window-close')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.minimize).toHaveBeenCalledOnce()
    dispose()
  })

  it('allows a real quit while still clearing the unlocked session', () => {
    const window = new FakeWindow()
    const session = createSession('lock-and-minimize')
    const event = { preventDefault: vi.fn() }
    const dispose = bindSecurityLifecycle({
      window,
      powerMonitor: new FakePowerMonitor(),
      session,
      isQuitting: () => true,
    })

    window.emit('close', event)

    expect(session.lock).toHaveBeenCalledWith('window-close')
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.minimize).not.toHaveBeenCalled()
    dispose()
  })
})
