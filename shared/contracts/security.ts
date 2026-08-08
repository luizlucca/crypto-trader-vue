import type { Market, MarketEnvironment } from '@shared/types/market'
import { validatePersonalPassword } from '@shared/domain/personalPassword'
import { isMarketEnvironment } from '@shared/domain/providerEnvironment'
import {
  providerCapabilities,
  type ProviderId,
} from '@shared/domain/providerCapabilities'

export type SecurityState
  = | 'setup-required'
    | 'locked'
    | 'unlocking'
    | 'unlocked'

export type AccountConnectionState
  = | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'failed'

export type AccountFailureCode
  = | 'credentials'
    | 'permission'
    | 'clock'
    | 'network'
    | 'unknown'

export type IdleTimeoutMinutes = 0 | 1 | 5 | 15 | 30 | 60 | 120

export interface SecurityPreferences {
  lockOnMinimize: boolean
  lockOnSuspend: boolean
  idleTimeoutMinutes: IdleTimeoutMinutes
  closeAction: 'quit-and-lock' | 'lock-and-minimize'
}

export const DEFAULT_SECURITY_PREFERENCES: SecurityPreferences = {
  lockOnMinimize: true,
  lockOnSuspend: true,
  idleTimeoutMinutes: 15,
  closeAction: 'quit-and-lock',
}

export interface ProviderAccountSummary {
  accountId: string
  provider: ProviderId
  environment: MarketEnvironment
  label: string
  markets: readonly Market[]
  apiKeySuffix: string
  connection: AccountConnectionState
  failureCode?: AccountFailureCode
}

export interface ProviderConnectionSnapshot {
  accountId?: string
  state: AccountConnectionState
  failureCode?: AccountFailureCode
}

export interface BinanceAccountDraft {
  accountId?: string
  environment: MarketEnvironment
  label: string
  markets: readonly Market[]
  apiKey: string
  apiSecret: string
}

export interface SecuritySnapshot {
  state: SecurityState
  hasVault: boolean
  accounts: readonly ProviderAccountSummary[]
  connection: ProviderConnectionSnapshot
  /**
   * Which venue the whole app is pointed at. Derived from the connected
   * account and falling back to `live`, so there is exactly one answer — a
   * second, independent switch could disagree with the credential in use.
   */
  environment: MarketEnvironment
  preferences: SecurityPreferences
}

export type SecurityRequest
  = | { kind: 'get-snapshot' }
    | { kind: 'setup', password: string }
    | { kind: 'unlock', password: string }
    | { kind: 'lock' }
    | { kind: 'change-password', currentPassword: string, nextPassword: string }
    | { kind: 'reset-vault', confirmation: 'APAGAR' }
    | { kind: 'save-binance-account', draft: BinanceAccountDraft }
    | { kind: 'remove-account', accountId: string }
    | { kind: 'connect-account', accountId: string }
    | { kind: 'disconnect-account' }
    | { kind: 'update-preferences', preferences: SecurityPreferences }

export interface SecurityEvent {
  kind: 'state'
  payload: SecuritySnapshot
}

export interface DesktopSecurityAPI {
  getSnapshot(): Promise<SecuritySnapshot>
  request(request: SecurityRequest): Promise<SecuritySnapshot>
  onState(callback: (snapshot: SecuritySnapshot) => void): () => void
}

const ACCOUNT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
export const MIN_API_CREDENTIAL_LENGTH = 8
export const MAX_API_CREDENTIAL_LENGTH = 256
const SECURITY_PREFERENCE_KEYS = [
  'lockOnMinimize',
  'lockOnSuspend',
  'idleTimeoutMinutes',
  'closeAction',
] as const

function hasExactKeys(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const actualKeys = Reflect.ownKeys(value)
  return actualKeys.length === keys.length
    && actualKeys.every((key) => (
      typeof key === 'string' && keys.includes(key)
    ))
    && keys.every((key) => Object.hasOwn(value, key))
}

function isAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value)
}

function isCredential(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= MIN_API_CREDENTIAL_LENGTH
    && value.length <= MAX_API_CREDENTIAL_LENGTH
}

function isMarkets(value: unknown): value is readonly Market[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= 2
    && value.every((market) => market === 'spot' || market === 'futures')
    && new Set(value).size === value.length
}

export function projectSecurityPreferences(
  value: unknown,
): SecurityPreferences | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const preferences = value as Partial<SecurityPreferences>
  if (!Object.hasOwn(preferences, 'lockOnMinimize')
    || !Object.hasOwn(preferences, 'lockOnSuspend')
    || !Object.hasOwn(preferences, 'idleTimeoutMinutes')
    || !Object.hasOwn(preferences, 'closeAction')
    || typeof preferences.lockOnMinimize !== 'boolean'
    || typeof preferences.lockOnSuspend !== 'boolean'
    || !isIdleTimeoutMinutes(preferences.idleTimeoutMinutes)
    || !(
      preferences.closeAction === 'quit-and-lock'
      || preferences.closeAction === 'lock-and-minimize'
    )) {
    return undefined
  }

  return {
    lockOnMinimize: preferences.lockOnMinimize,
    lockOnSuspend: preferences.lockOnSuspend,
    idleTimeoutMinutes: preferences.idleTimeoutMinutes,
    closeAction: preferences.closeAction,
  }
}

export function isSecurityPreferences(
  value: unknown,
): value is SecurityPreferences {
  return hasExactKeys(value, SECURITY_PREFERENCE_KEYS)
    && projectSecurityPreferences(value) !== undefined
}

function isIdleTimeoutMinutes(value: unknown): value is IdleTimeoutMinutes {
  return value === 0
    || value === 1
    || value === 5
    || value === 15
    || value === 30
    || value === 60
    || value === 120
}

/**
 * Exported so the renderer gates its Save button on the very rule the IPC
 * boundary enforces. A looser UI rule presents a draft as valid and then the
 * save rejects with nothing rendered.
 */
export function isBinanceAccountDraft(
  value: unknown,
): value is BinanceAccountDraft {
  if (!hasExactKeys(value, [
    'environment',
    'label',
    'markets',
    'apiKey',
    'apiSecret',
  ]) && !hasExactKeys(value, [
    'accountId',
    'environment',
    'label',
    'markets',
    'apiKey',
    'apiSecret',
  ])) {
    return false
  }

  const draft = value as Partial<BinanceAccountDraft>
  return (
    draft.accountId === undefined || isAccountId(draft.accountId)
  )
  && isMarketEnvironment(draft.environment)
  && typeof draft.label === 'string'
  && draft.label.length <= 64
  && draft.label.trim().length >= 1
  && isMarkets(draft.markets)
  && (
    providerCapabilities('binance').coversBothMarkets(draft.environment)
    || draft.markets.length === 1
  )
  && isCredential(draft.apiKey)
  && isCredential(draft.apiSecret)
}

export function isSecurityRequest(value: unknown): value is SecurityRequest {
  if (!value || typeof value !== 'object') {
    return false
  }
  const request = value as Partial<SecurityRequest>
  switch (request.kind) {
    case 'get-snapshot':
    case 'lock':
      return hasExactKeys(value, ['kind'])
    case 'setup':
    case 'unlock':
      return hasExactKeys(value, ['kind', 'password'])
        && typeof request.password === 'string'
        && validatePersonalPassword(request.password).valid
    case 'change-password':
      return hasExactKeys(value, ['kind', 'currentPassword', 'nextPassword'])
        && typeof request.currentPassword === 'string'
        && validatePersonalPassword(request.currentPassword).valid
        && typeof request.nextPassword === 'string'
        && validatePersonalPassword(request.nextPassword).valid
    case 'reset-vault':
      return hasExactKeys(value, ['kind', 'confirmation'])
        && request.confirmation === 'APAGAR'
    case 'save-binance-account':
      return hasExactKeys(value, ['kind', 'draft'])
        && isBinanceAccountDraft(request.draft)
    case 'remove-account':
    case 'connect-account':
      return hasExactKeys(value, ['kind', 'accountId'])
        && isAccountId(request.accountId)
    case 'disconnect-account':
      return hasExactKeys(value, ['kind'])
    case 'update-preferences':
      return hasExactKeys(value, ['kind', 'preferences'])
        && isSecurityPreferences(request.preferences)
    default:
      return false
  }
}
