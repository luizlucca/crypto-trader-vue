import { describe, expect, it, vi } from 'vitest'
import { createImperativeChannel } from './imperativeChannel'

describe('imperative channel', () => {
  it('delivers only to subscribers of the published key', () => {
    const channel = createImperativeChannel<number>()
    const first = vi.fn()
    const second = vi.fn()
    channel.subscribe('a', first)
    channel.subscribe('b', second)

    channel.publish('a', 1)

    expect(first).toHaveBeenCalledWith(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('replays the retained value to a subscriber that mounts later', () => {
    const channel = createImperativeChannel<number>()
    channel.publish('a', 7)

    const late = vi.fn()
    channel.subscribe('a', late)

    expect(late).toHaveBeenCalledWith(7)
  })

  it('stops delivering after unsubscribe', () => {
    const channel = createImperativeChannel<number>()
    const callback = vi.fn()
    const unsubscribe = channel.subscribe('a', callback)
    callback.mockClear()

    unsubscribe()
    channel.publish('a', 2)

    expect(callback).not.toHaveBeenCalled()
  })

  it('does not replay a value from a session that was reset', () => {
    const channel = createImperativeChannel<number>()
    channel.publish('a', 3)
    channel.reset('a')

    const callback = vi.fn()
    channel.subscribe('a', callback)

    expect(callback).not.toHaveBeenCalled()
    expect(channel.peek('a')).toBeUndefined()
  })

  it('tolerates a subscriber unsubscribing during its own notification', () => {
    const channel = createImperativeChannel<number>()
    const survivor = vi.fn()
    const unsubscribe = channel.subscribe('a', () => unsubscribe())
    channel.subscribe('a', survivor)

    expect(() => channel.publish('a', 1)).not.toThrow()
    expect(survivor).toHaveBeenCalledWith(1)
  })
})
