import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionState } from '../../provider'

class FakeSocket extends EventEmitter {
  static instances: FakeSocket[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1

  readyState = FakeSocket.CONNECTING
  closed = false
  terminated = false

  constructor(readonly url: string) {
    super()
    FakeSocket.instances.push(this)
  }

  open(): void {
    this.readyState = FakeSocket.OPEN
    this.emit('open')
  }

  close(): void {
    this.closed = true
  }

  terminate(): void {
    this.terminated = true
  }
}

vi.mock('ws', () => ({
  default: FakeSocket,
  WebSocket: FakeSocket,
}))

const { websocketJSON$ } = await import('./websocket')

const idleTimeoutMs = 6 * 60_000

describe('websocketJSON$', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeSocket.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reconnects when a live socket stops delivering frames', () => {
    const states: ConnectionState[] = []
    const subscription = websocketJSON$<unknown>(
      'wss://example.test/ws',
      (state) => states.push(state),
    ).subscribe({ next: () => {} })

    const first = FakeSocket.instances[0]
    first.open()
    expect(states.at(-1)).toEqual({ state: 'connected' })

    vi.advanceTimersByTime(idleTimeoutMs)
    expect(first.closed).toBe(true)
    expect(states.at(-1)).toEqual(expect.objectContaining({
      state: 'reconnecting',
    }))

    // The retry delay has to elapse before a replacement socket is opened.
    vi.advanceTimersByTime(1_000)
    expect(FakeSocket.instances).toHaveLength(2)

    subscription.unsubscribe()
  })

  it('treats a server ping as proof the connection is alive', () => {
    const subscription = websocketJSON$<unknown>(
      'wss://example.test/ws',
      () => {},
    ).subscribe({ next: () => {} })

    const socket = FakeSocket.instances[0]
    socket.open()

    // Binance pings every three minutes on an otherwise silent pair.
    for (let elapsed = 0; elapsed < idleTimeoutMs * 2; elapsed += 180_000) {
      vi.advanceTimersByTime(180_000)
      socket.emit('ping')
    }

    expect(FakeSocket.instances).toHaveLength(1)
    expect(socket.closed).toBe(false)

    subscription.unsubscribe()
  })
})
