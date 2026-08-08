const MINIMUM_PASSWORD_LENGTH = 8
const MAXIMUM_PASSWORD_LENGTH = 128

export interface PersonalPasswordValidation {
  valid: boolean
}

export function validatePersonalPassword(
  password: string,
): PersonalPasswordValidation {
  const valid = password.length >= MINIMUM_PASSWORD_LENGTH
    && password.length <= MAXIMUM_PASSWORD_LENGTH
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z\d]/.test(password)

  return { valid }
}
