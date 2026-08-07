import { describe, expect, it } from 'vitest'
import { createProviderConnectionAttempt } from './providerConnectionAttempt'

describe('provider connection attempt ownership', () => {
  it('deduplicates a second selection while an account is connecting', () => {
    const attempts = createProviderConnectionAttempt()

    expect(attempts.begin('one')).toMatchObject({ accountId: 'one' })
    expect(attempts.begin('one')).toBeUndefined()
  })

  it('rejects a cancelled completion while accepting the new attempt', () => {
    const attempts = createProviderConnectionAttempt()
    const first = attempts.begin('one')!

    expect(attempts.cancel()).toBe(true)
    const second = attempts.begin('two')!

    expect(attempts.isCurrent(first, 'unlocked')).toBe(false)
    expect(attempts.isCurrent(second, 'unlocked')).toBe(true)
    attempts.finish(first)
    expect(attempts.isCurrent(second, 'unlocked')).toBe(true)
  })

  it('rejects effects for an attempt when the security session locks', () => {
    const attempts = createProviderConnectionAttempt()
    const attempt = attempts.begin('one')!

    expect(attempts.isCurrent(attempt, 'locked')).toBe(false)
    expect(attempts.cancel()).toBe(true)
    expect(attempts.isCurrent(attempt, 'unlocked')).toBe(false)
  })

  it('disconnects once for an explicit cancellation', async () => {
    let disconnects = 0
    const attempts = createProviderConnectionAttempt({
      disconnect: async () => { disconnects += 1 },
    })
    attempts.begin('one')

    attempts.cancel()
    attempts.cancel()
    await attempts.waitForDisconnect()

    expect(disconnects).toBe(1)
  })

  it('invalidates on lock without requesting another disconnect', () => {
    let disconnects = 0
    const attempts = createProviderConnectionAttempt({
      disconnect: async () => { disconnects += 1 },
    })
    const token = attempts.begin('one')!

    expect(attempts.invalidate()).toBe(true)

    expect(disconnects).toBe(0)
    expect(attempts.isCurrent(token, 'unlocked')).toBe(false)
  })

  it(
    'waits for an explicit disconnect before allowing its successor to run',
    async () => {
      let releaseDisconnect!: () => void
      const disconnected = new Promise<void>((resolve) => {
        releaseDisconnect = resolve
      })
      const attempts = createProviderConnectionAttempt({
        disconnect: () => disconnected,
      })
      attempts.begin('one')
      attempts.cancel()
      const successor = attempts.begin('two')!
      let ran = false
      const afterDisconnect = attempts.waitForDisconnect().then(() => {
        ran = attempts.isCurrent(successor, 'unlocked')
      })

      expect(ran).toBe(false)
      releaseDisconnect()
      await afterDisconnect

      expect(ran).toBe(true)
    },
  )

  it('absorbs a rejected disconnect before the next attempt', async () => {
    const attempts = createProviderConnectionAttempt({
      disconnect: async () => { throw new Error('offline') },
    })
    attempts.begin('one')

    attempts.cancel()

    await expect(attempts.waitForDisconnect()).resolves.toBeUndefined()
  })
})
