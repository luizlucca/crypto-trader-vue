import { describe, expect, it } from 'vitest'
import { validatePersonalPassword } from './personalPassword'

describe('personal password policy', () => {
  it('accepts eight characters with every required character class', () => {
    expect(validatePersonalPassword('Abcdef1!')).toEqual({ valid: true })
  })

  it.each([
    'Abcde1!',
    'abcdefgh1!',
    'ABCDEFGH1!',
    'Abcdefgh!',
    'Abcdefg1',
    `Abcdef1!${'x'.repeat(121)}`,
  ])('rejects an invalid personal password', (password) => {
    expect(validatePersonalPassword(password)).toEqual({ valid: false })
  })
})
