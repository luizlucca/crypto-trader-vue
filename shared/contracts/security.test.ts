import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECURITY_PREFERENCES,
  isSecurityRequest,
} from './security'

describe('security contract', () => {
  it('accepts a valid Binance account draft', () => {
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft: {
        label: 'Conta principal',
        markets: ['spot', 'futures'],
        apiKey: 'key-1234567890',
        apiSecret: 'secret-1234567890',
        enabled: true,
      },
    })).toBe(true)
  })

  it('rejects invalid sensitive payloads before they reach the main process', () => {
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft: {
        label: 'Conta',
        markets: ['spot', 'spot'],
        apiKey: 'key-1234567890',
        apiSecret: '',
        enabled: true,
      },
    })).toBe(false)
    expect(isSecurityRequest({
      kind: 'unlock',
      password: 'short',
    })).toBe(false)
  })

  it('accepts only approved locking preferences', () => {
    expect(isSecurityRequest({
      kind: 'update-preferences',
      preferences: {
        ...DEFAULT_SECURITY_PREFERENCES,
        idleTimeoutMinutes: 30,
        closeAction: 'lock-and-minimize',
      },
    })).toBe(true)
    expect(isSecurityRequest({
      kind: 'update-preferences',
      preferences: {
        ...DEFAULT_SECURITY_PREFERENCES,
        idleTimeoutMinutes: 7,
      },
    })).toBe(false)
  })
})
