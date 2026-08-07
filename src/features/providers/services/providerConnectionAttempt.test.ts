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
})
