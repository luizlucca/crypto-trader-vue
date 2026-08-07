import { randomUUID } from 'node:crypto'
import {
  DEFAULT_SECURITY_PREFERENCES,
  type AccountConnectionState,
  type AccountFailureCode,
  type BinanceAccountDraft,
  type ProviderAccountSummary,
  type SecurityPreferences,
  type SecurityRequest,
  type SecuritySnapshot,
  type SecurityState,
} from '@shared/contracts/security'
import { validatePersonalPassword } from '@shared/domain/personalPassword'
import type { AccountMarketValidation } from '../providers/accountProvider'
import { AccountProviderRegistry } from '../providers/accountProvider'
import {
  type EncryptedCredentialVaultV1,
  type ProviderAccountRecord,
  type VaultContents,
  VaultCrypto,
  zeroBuffer,
} from './vaultCrypto'
import { SecurityPreferencesStore } from './securityPreferences'
import { VaultRepository } from './vaultRepository'

const IDLE_CHECK_INTERVAL_MS = 30_000
const MAX_CONCURRENT_VALIDATIONS = 2

export type LockReason
  = | 'manual'
    | 'minimize'
    | 'suspend'
    | 'idle'
    | 'window-close'
    | 'shutdown'

type IntervalHandle = ReturnType<typeof setInterval>
type ScheduleInterval = (
  callback: () => void,
  milliseconds: number,
) => IntervalHandle
type ClearScheduledInterval = (handle: IntervalHandle) => void

interface SecuritySessionOptions {
  repository: VaultRepository
  crypto: VaultCrypto
  preferences: SecurityPreferencesStore
  providers: AccountProviderRegistry
  getSystemIdleTime?: () => number
  setInterval?: ScheduleInterval
  clearInterval?: ClearScheduledInterval
  createAccountId?: () => string
}

interface AccountConnection {
  state: AccountConnectionState
  failureCode?: AccountFailureCode
}

function copyContents(contents: VaultContents): VaultContents {
  return {
    version: contents.version,
    accounts: contents.accounts.map((account) => ({
      ...account,
      markets: [...account.markets],
    })),
  }
}

function apiKeySuffix(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`
}

function toSummary(
  account: ProviderAccountRecord,
  connection: AccountConnection | undefined,
): ProviderAccountSummary {
  return {
    accountId: account.accountId,
    provider: account.provider,
    label: account.label,
    markets: [...account.markets],
    apiKeySuffix: apiKeySuffix(account.apiKey),
    enabled: account.enabled,
    connection: connection?.state ?? 'disconnected',
    ...(connection?.failureCode && { failureCode: connection.failureCode }),
  }
}

export class SecuritySession {
  private state: SecurityState = 'setup-required'
  private hasVault = false
  private preferences = { ...DEFAULT_SECURITY_PREFERENCES }
  private vault: VaultContents | undefined
  private envelope: EncryptedCredentialVaultV1 | undefined
  private masterKey: Buffer | undefined
  private revision = 0
  private idleTimer: IntervalHandle | undefined
  private readonly listeners = new Set<(snapshot: SecuritySnapshot) => void>()
  private readonly connections = new Map<string, AccountConnection>()

  private readonly repository: VaultRepository
  private readonly crypto: VaultCrypto
  private readonly preferencesStore: SecurityPreferencesStore
  private readonly providers: AccountProviderRegistry
  private readonly getSystemIdleTime: () => number
  private readonly scheduleInterval: ScheduleInterval
  private readonly clearScheduledInterval: ClearScheduledInterval
  private readonly createAccountId: () => string

  constructor(options: SecuritySessionOptions) {
    this.repository = options.repository
    this.crypto = options.crypto
    this.preferencesStore = options.preferences
    this.providers = options.providers
    this.getSystemIdleTime = options.getSystemIdleTime ?? (() => 0)
    this.scheduleInterval = options.setInterval ?? setInterval
    this.clearScheduledInterval = options.clearInterval ?? clearInterval
    this.createAccountId = options.createAccountId ?? randomUUID
  }

  async initialize(): Promise<SecuritySnapshot> {
    this.hasVault = await this.repository.exists()
    this.preferences = await this.preferencesStore.read()
    this.state = this.hasVault ? 'locked' : 'setup-required'
    return this.publish()
  }

  getSnapshot(): SecuritySnapshot {
    const accounts = this.unlockedAccountSummaries()

    return {
      state: this.state,
      hasVault: this.hasVault,
      accounts,
      preferences: { ...this.preferences },
    }
  }

  subscribe(listener: (snapshot: SecuritySnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async request(request: SecurityRequest): Promise<SecuritySnapshot> {
    switch (request.kind) {
      case 'get-snapshot':
        return this.getSnapshot()
      case 'setup':
        return this.setup(request.password)
      case 'unlock':
        return this.unlock(request.password)
      case 'lock':
        return this.lock('manual')
      case 'change-password':
        return this.changePassword(
          request.currentPassword,
          request.nextPassword,
        )
      case 'reset-vault':
        return this.resetVault(request.confirmation)
      case 'save-binance-account':
        return this.saveBinanceAccount(request.draft)
      case 'remove-account':
        return this.removeAccount(request.accountId)
      case 'update-preferences':
        return this.updatePreferences(request.preferences)
    }
  }

  async setup(password: string): Promise<SecuritySnapshot> {
    this.assertValidPassword(password)
    if (this.hasVault) {
      throw new Error('O cofre de credenciais já existe')
    }

    const revision = ++this.revision
    this.state = 'unlocking'
    this.publish()
    let unlocked: Awaited<ReturnType<VaultCrypto['create']>> | undefined
    try {
      unlocked = await this.crypto.create(password, {
        version: 1,
        accounts: [],
      })
      if (!this.isCurrent(revision)) {
        return this.getSnapshot()
      }
      await this.repository.write(unlocked.envelope)
      this.hasVault = true
      if (!this.isCurrent(revision)) {
        this.state = 'locked'
        return this.publish()
      }
      this.masterKey = unlocked.key
      this.vault = unlocked.contents
      this.envelope = unlocked.envelope
      this.state = 'unlocked'
      this.startIdleTimer()
      return this.publish()
    } catch (error) {
      this.restorePublicStateIfCurrent(revision)
      throw error
    } finally {
      if (unlocked && this.masterKey !== unlocked.key) {
        zeroBuffer(unlocked.key)
      }
    }
  }

  async unlock(password: string): Promise<SecuritySnapshot> {
    this.assertValidPassword(password)
    if (!this.hasVault) {
      throw new Error('Nenhum cofre de credenciais foi configurado')
    }
    if (this.state === 'unlocked') {
      return this.getSnapshot()
    }

    const revision = ++this.revision
    this.state = 'unlocking'
    this.publish()
    let unlocked: Awaited<ReturnType<VaultCrypto['unlock']>> | undefined
    try {
      const envelope = await this.repository.read()
      unlocked = await this.crypto.unlock(password, envelope)
      if (!this.isCurrent(revision)) {
        zeroBuffer(unlocked.key)
        return this.getSnapshot()
      }

      this.masterKey = unlocked.key
      this.vault = unlocked.contents
      this.envelope = unlocked.envelope
      this.state = 'unlocked'
      this.connections.clear()
      this.startIdleTimer()
      this.publish()
      await this.validateEnabledAccounts(revision)
      return this.getSnapshot()
    } catch (error) {
      this.restorePublicStateIfCurrent(revision)
      throw error
    } finally {
      if (unlocked && this.masterKey !== unlocked.key) {
        zeroBuffer(unlocked.key)
      }
    }
  }

  lock(_reason: LockReason): SecuritySnapshot {
    this.revision += 1
    this.stopIdleTimer()
    zeroBuffer(this.masterKey)
    this.masterKey = undefined
    this.vault = undefined
    this.envelope = undefined
    this.connections.clear()
    this.state = this.hasVault ? 'locked' : 'setup-required'
    return this.publish()
  }

  lockIfEnabled(
    reason: Extract<LockReason, 'minimize' | 'suspend'>,
  ): SecuritySnapshot {
    const enabled = reason === 'minimize'
      ? this.preferences.lockOnMinimize
      : this.preferences.lockOnSuspend
    return enabled ? this.lock(reason) : this.getSnapshot()
  }

  closeAction(): SecurityPreferences['closeAction'] {
    return this.preferences.closeAction
  }

  async saveBinanceAccount(
    draft: BinanceAccountDraft,
  ): Promise<SecuritySnapshot> {
    this.assertUnlocked()
    this.assertAccountDraft(draft)
    const vault = this.requireVault()
    const accountId = draft.accountId ?? this.createAccountId()
    const record: ProviderAccountRecord = {
      accountId,
      provider: 'binance',
      label: draft.label.trim(),
      markets: [...draft.markets],
      apiKey: draft.apiKey,
      apiSecret: draft.apiSecret,
      enabled: draft.enabled,
    }
    const accounts = vault.accounts.filter(
      (account) => account.accountId !== accountId,
    )
    const next = { version: 1 as const, accounts: [...accounts, record] }
    const revision = this.revision
    const envelope = await this.persistContents(next, revision)
    if (!envelope || !this.isCurrent(revision)) {
      return this.getSnapshot()
    }

    this.vault = next
    this.envelope = envelope
    this.connections.delete(accountId)
    this.publish()
    if (record.enabled) {
      await this.validateAccounts([record], revision)
    }
    return this.getSnapshot()
  }

  async removeAccount(accountId: string): Promise<SecuritySnapshot> {
    this.assertUnlocked()
    const vault = this.requireVault()
    const next = {
      version: 1 as const,
      accounts: vault.accounts.filter(
        (account) => account.accountId !== accountId,
      ),
    }
    const revision = this.revision
    const envelope = await this.persistContents(next, revision)
    if (!envelope || !this.isCurrent(revision)) {
      return this.getSnapshot()
    }

    this.vault = next
    this.envelope = envelope
    this.connections.delete(accountId)
    return this.publish()
  }

  async changePassword(
    currentPassword: string,
    nextPassword: string,
  ): Promise<SecuritySnapshot> {
    this.assertUnlocked()
    this.assertValidPassword(nextPassword)
    const envelope = this.requireEnvelope()
    const current = await this.crypto.unlock(currentPassword, envelope)
    zeroBuffer(current.key)
    const revision = this.revision
    const vault = copyContents(this.requireVault())
    const rotated = await this.crypto.create(nextPassword, vault)
    try {
      if (!this.isCurrent(revision)) {
        return this.getSnapshot()
      }
      await this.repository.write(rotated.envelope)
      if (!this.isCurrent(revision)) {
        return this.getSnapshot()
      }
      zeroBuffer(this.masterKey)
      this.masterKey = rotated.key
      this.envelope = rotated.envelope
      return this.publish()
    } finally {
      if (this.masterKey !== rotated.key) {
        zeroBuffer(rotated.key)
      }
    }
  }

  async resetVault(confirmation: 'APAGAR'): Promise<SecuritySnapshot> {
    if (confirmation !== 'APAGAR') {
      throw new Error('Confirmação de reset inválida')
    }

    this.revision += 1
    this.stopIdleTimer()
    zeroBuffer(this.masterKey)
    this.masterKey = undefined
    this.vault = undefined
    this.envelope = undefined
    this.connections.clear()
    await this.repository.destroy()
    this.hasVault = false
    this.state = 'setup-required'
    return this.publish()
  }

  async updatePreferences(
    preferences: SecurityPreferences,
  ): Promise<SecuritySnapshot> {
    this.preferences = await this.preferencesStore.write(preferences)
    this.startIdleTimer()
    return this.publish()
  }

  shutdown(): SecuritySnapshot {
    return this.lock('shutdown')
  }

  private async persistContents(
    contents: VaultContents,
    revision: number,
  ): Promise<EncryptedCredentialVaultV1 | undefined> {
    const key = this.requireKey()
    const current = this.requireEnvelope()
    const envelope = await this.crypto.seal(contents, key, current)
    if (!this.isCurrent(revision)) {
      return undefined
    }
    await this.repository.write(envelope)
    return envelope
  }

  private async validateEnabledAccounts(revision: number): Promise<void> {
    const accounts = this.requireVault().accounts.filter(
      (account) => account.enabled,
    )
    await this.validateAccounts(accounts, revision)
  }

  private async validateAccounts(
    accounts: readonly ProviderAccountRecord[],
    revision: number,
  ): Promise<void> {
    for (const account of accounts) {
      this.connections.set(account.accountId, { state: 'connecting' })
    }
    this.publishIfCurrent(revision)

    let nextIndex = 0
    const worker = async (): Promise<void> => {
      while (nextIndex < accounts.length) {
        const account = accounts[nextIndex]
        nextIndex += 1
        const connection = await this.validateAccount(account)
        if (!this.isCurrent(revision)) {
          return
        }
        this.connections.set(account.accountId, connection)
        this.publish()
      }
    }
    const workerCount = Math.min(MAX_CONCURRENT_VALIDATIONS, accounts.length)
    await Promise.all(Array.from({ length: workerCount }, worker))
  }

  private async validateAccount(
    account: ProviderAccountRecord,
  ): Promise<AccountConnection> {
    try {
      const provider = this.providers.get(account.provider)
      const results = await provider.validateConnection(
        {
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
        },
        account.markets,
      )
      return this.toAccountConnection(results)
    } catch {
      return { state: 'failed', failureCode: 'unknown' }
    }
  }

  private toAccountConnection(
    results: readonly AccountMarketValidation[],
  ): AccountConnection {
    const failed = results.find((result) => result.state === 'failed')
    if (failed) {
      return { state: 'failed', failureCode: failed.failureCode ?? 'unknown' }
    }
    return { state: 'connected' }
  }

  private unlockedAccountSummaries(): readonly ProviderAccountSummary[] {
    if (this.state !== 'unlocked' || !this.vault) {
      return []
    }

    return this.vault.accounts.map((account) => (
      toSummary(account, this.connections.get(account.accountId))
    ))
  }

  private startIdleTimer(): void {
    this.stopIdleTimer()
    if (
      this.state !== 'unlocked'
      || this.preferences.idleTimeoutMinutes === 0
    ) {
      return
    }
    this.idleTimer = this.scheduleInterval(
      () => this.lockWhenIdle(),
      IDLE_CHECK_INTERVAL_MS,
    )
  }

  private lockWhenIdle(): void {
    if (this.state !== 'unlocked') {
      return
    }
    const idleSeconds = this.getSystemIdleTime()
    if (idleSeconds >= this.preferences.idleTimeoutMinutes * 60) {
      this.lock('idle')
    }
  }

  private stopIdleTimer(): void {
    if (!this.idleTimer) {
      return
    }
    this.clearScheduledInterval(this.idleTimer)
    this.idleTimer = undefined
  }

  private assertUnlocked(): void {
    if (this.state !== 'unlocked') {
      throw new Error('Desbloqueie a plataforma para usar credenciais')
    }
  }

  private assertValidPassword(password: string): void {
    if (!validatePersonalPassword(password).valid) {
      throw new Error('Senha pessoal inválida')
    }
  }

  private assertAccountDraft(draft: BinanceAccountDraft): void {
    if (
      !draft.label.trim()
      || draft.markets.length === 0
      || !draft.apiKey
      || !draft.apiSecret
    ) {
      throw new Error('Dados da conta Binance inválidos')
    }
  }

  private requireKey(): Buffer {
    this.assertUnlocked()
    if (!this.masterKey) {
      throw new Error('Chave do cofre indisponível')
    }
    return this.masterKey
  }

  private requireVault(): VaultContents {
    this.assertUnlocked()
    if (!this.vault) {
      throw new Error('Cofre desbloqueado indisponível')
    }
    return this.vault
  }

  private requireEnvelope(): EncryptedCredentialVaultV1 {
    this.assertUnlocked()
    if (!this.envelope) {
      throw new Error('Envelope do cofre indisponível')
    }
    return this.envelope
  }

  private isCurrent(revision: number): boolean {
    return this.revision === revision
  }

  private publishIfCurrent(revision: number): void {
    if (this.isCurrent(revision)) {
      this.publish()
    }
  }

  private restorePublicStateIfCurrent(revision: number): void {
    if (!this.isCurrent(revision)) {
      return
    }

    this.state = this.hasVault ? 'locked' : 'setup-required'
    this.publish()
  }

  private publish(): SecuritySnapshot {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
    return snapshot
  }
}
