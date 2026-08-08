import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SECURITY_PREFERENCES,
  isSecurityRequest,
  type SecurityRequest,
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
        validateAndConnect: true,
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
        validateAndConnect: true,
      },
    })).toBe(false)
    expect(isSecurityRequest({
      kind: 'unlock',
      password: 'short',
    })).toBe(false)
  })

  it('accepts explicit account connection commands and validation intent', () => {
    expect(isSecurityRequest({
      kind: 'connect-account',
      accountId: 'account-one',
    })).toBe(true)
    expect(isSecurityRequest({ kind: 'disconnect-account' })).toBe(true)
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft: {
        label: 'Principal',
        markets: ['spot'],
        apiKey: 'key-1234567890',
        apiSecret: 'secret-1234567890',
        validateAndConnect: true,
      },
    })).toBe(true)
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

  it('rejects unknown top-level fields for every security command', () => {
    const requests: readonly SecurityRequest[] = [
      { kind: 'get-snapshot' },
      { kind: 'setup', password: 'Abcdef1!' },
      { kind: 'unlock', password: 'Abcdef1!' },
      { kind: 'lock' },
      {
        kind: 'change-password',
        currentPassword: 'Abcdef1!',
        nextPassword: 'Zyxwvut1!',
      },
      { kind: 'reset-vault', confirmation: 'APAGAR' },
      {
        kind: 'save-binance-account',
        draft: {
          label: 'Principal',
          markets: ['spot'],
          apiKey: 'key-1234567890',
          apiSecret: 'secret-1234567890',
          validateAndConnect: false,
        },
      },
      { kind: 'remove-account', accountId: 'account-one' },
      { kind: 'connect-account', accountId: 'account-one' },
      { kind: 'disconnect-account' },
      { kind: 'update-preferences', preferences: DEFAULT_SECURITY_PREFERENCES },
    ]

    for (const request of requests) {
      expect(isSecurityRequest({ ...request, unexpected: true })).toBe(false)
    }
  })

  it('rejects unknown fields in security command objects', () => {
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft: {
        label: 'Principal',
        markets: ['spot'],
        apiKey: 'key-1234567890',
        apiSecret: 'secret-1234567890',
        validateAndConnect: true,
        unexpected: true,
      },
    })).toBe(false)
    expect(isSecurityRequest({
      kind: 'update-preferences',
      preferences: {
        ...DEFAULT_SECURITY_PREFERENCES,
        unexpected: true,
      },
    })).toBe(false)
  })

  it('rejects labels whose raw value exceeds the supported length', () => {
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft: {
        label: `${' '.repeat(64)}Conta`,
        markets: ['spot'],
        apiKey: 'key-1234567890',
        apiSecret: 'secret-1234567890',
        validateAndConnect: true,
      },
    })).toBe(false)
  })

  it('rejects non-enumerable fields at every security DTO level', () => {
    const command = { kind: 'get-snapshot' }
    Object.defineProperty(command, 'hidden', { value: true })

    const preferences = { ...DEFAULT_SECURITY_PREFERENCES }
    Object.defineProperty(preferences, 'hidden', { value: true })

    const draft = {
      label: 'Principal',
      markets: ['spot'],
      apiKey: 'key-1234567890',
      apiSecret: 'secret-1234567890',
      validateAndConnect: true,
    }
    Object.defineProperty(draft, 'hidden', { value: true })

    expect(isSecurityRequest(command)).toBe(false)
    expect(isSecurityRequest({
      kind: 'update-preferences',
      preferences,
    })).toBe(false)
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft,
    })).toBe(false)
  })

  it('rejects symbol fields at every security DTO level', () => {
    const command = { kind: 'get-snapshot' }
    Object.defineProperty(command, Symbol('hidden'), { value: true })

    const preferences = { ...DEFAULT_SECURITY_PREFERENCES }
    Object.defineProperty(preferences, Symbol('hidden'), { value: true })

    const draft = {
      label: 'Principal',
      markets: ['spot'],
      apiKey: 'key-1234567890',
      apiSecret: 'secret-1234567890',
      validateAndConnect: true,
    }
    Object.defineProperty(draft, Symbol('hidden'), { value: true })

    expect(isSecurityRequest(command)).toBe(false)
    expect(isSecurityRequest({
      kind: 'update-preferences',
      preferences,
    })).toBe(false)
    expect(isSecurityRequest({
      kind: 'save-binance-account',
      draft,
    })).toBe(false)
  })
})
