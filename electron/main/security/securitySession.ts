import { randomUUID } from 'node:crypto'
import {
  DEFAULT_SECURITY_PREFERENCES,
  projectSecurityPreferences,
  type BinanceAccountDraft,
  type ProviderConnectionSnapshot,
  type ProviderAccountSummary,
  type SecurityPreferences,
  type SecurityRequest,
  type SecuritySnapshot,
  type SecurityState,
} from '@shared/contracts/security'
import { validatePersonalPassword } from '@shared/domain/personalPassword'
import {
  type EncryptedCredentialVaultV1,
  type ProviderAccountRecord,
  type UnlockedVault,
  type VaultContents,
  VaultCrypto,
  zeroBuffer,
} from './vaultCrypto'
import { ProviderConnectionCoordinator } from './providerConnectionCoordinator'
import { SecurityPreferencesStore } from './securityPreferences'
import { VaultRepository } from './vaultRepository'

const IDLE_CHECK_INTERVAL_MS = 30_000

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

class RecoverableFifoQueue {
  private tail: Promise<void> = Promise.resolve()

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

interface SecuritySessionOptions {
  repository: VaultRepository
  crypto: VaultCrypto
  preferences: SecurityPreferencesStore
  connections: ProviderConnectionCoordinator
  getSystemIdleTime?: () => number
  setInterval?: ScheduleInterval
  clearInterval?: ClearScheduledInterval
  createAccountId?: () => string
}

function copyContents(contents: VaultContents): VaultContents {
  return {
    version: contents.version,
    accounts: contents.accounts.map((account) => ({
      accountId: account.accountId,
      provider: account.provider,
      label: account.label,
      markets: [...account.markets],
      apiKey: account.apiKey,
      apiSecret: account.apiSecret,
    })),
  }
}

function apiKeySuffix(apiKey: string): string {
  return `••••${apiKey.slice(-4)}`
}

function toSummary(
  account: ProviderAccountRecord,
  activeConnection: ProviderConnectionSnapshot,
): ProviderAccountSummary {
  const connection = activeConnection.accountId === account.accountId
    ? activeConnection
    : { state: 'disconnected' as const }
  return {
    accountId: account.accountId,
    provider: account.provider,
    label: account.label,
    markets: [...account.markets],
    apiKeySuffix: apiKeySuffix(account.apiKey),
    connection: connection.state,
    ...(connection.failureCode && { failureCode: connection.failureCode }),
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
  private readonly vaultMutationQueue = new RecoverableFifoQueue()
  private readonly listeners = new Set<(snapshot: SecuritySnapshot) => void>()

  private readonly repository: VaultRepository
  private readonly crypto: VaultCrypto
  private readonly preferencesStore: SecurityPreferencesStore
  private readonly connections: ProviderConnectionCoordinator
  private readonly getSystemIdleTime: () => number
  private readonly scheduleInterval: ScheduleInterval
  private readonly clearScheduledInterval: ClearScheduledInterval
  private readonly createAccountId: () => string

  constructor(options: SecuritySessionOptions) {
    this.repository = options.repository
    this.crypto = options.crypto
    this.preferencesStore = options.preferences
    this.connections = options.connections
    this.getSystemIdleTime = options.getSystemIdleTime ?? (() => 0)
    this.scheduleInterval = options.setInterval ?? setInterval
    this.clearScheduledInterval = options.clearInterval ?? clearInterval
    this.createAccountId = options.createAccountId ?? randomUUID
    this.connections.subscribe(() => this.publish())
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
      connection: this.connections.snapshot(),
      preferences: projectSecurityPreferences(this.preferences)!,
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
      case 'connect-account':
        return this.connectAccount(request.accountId)
      case 'disconnect-account':
        return this.disconnectAccount()
      case 'update-preferences':
        return this.updatePreferences(request.preferences)
    }
  }

  async setup(password: string): Promise<SecuritySnapshot> {
    return this.vaultMutationQueue.enqueue(() => this.setupInternal(password))
  }

  async unlock(password: string): Promise<SecuritySnapshot> {
    return this.vaultMutationQueue.enqueue(() => this.unlockInternal(password))
  }

  lock(_reason: LockReason): SecuritySnapshot {
    this.revision += 1
    this.connections.disconnect()
    this.clearUnlockedVault()
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
    const result = await this.vaultMutationQueue.enqueue(
      () => this.saveBinanceAccountInternal(draft),
    )
    if (draft.validateAndConnect && result.snapshot.state === 'unlocked') {
      return this.connectAccount(result.accountId)
    }
    return result.snapshot
  }

  async removeAccount(accountId: string): Promise<SecuritySnapshot> {
    return this.vaultMutationQueue.enqueue(
      () => this.removeAccountInternal(accountId),
    )
  }

  async changePassword(
    currentPassword: string,
    nextPassword: string,
  ): Promise<SecuritySnapshot> {
    return this.vaultMutationQueue.enqueue(
      () => this.changePasswordInternal(currentPassword, nextPassword),
    )
  }

  async resetVault(confirmation: 'APAGAR'): Promise<SecuritySnapshot> {
    return this.vaultMutationQueue.enqueue(
      () => this.resetVaultInternal(confirmation),
    )
  }

  private async setupInternal(password: string): Promise<SecuritySnapshot> {
    this.assertValidPassword(password)
    if (this.hasVault) {
      throw new Error('O cofre de credenciais já existe')
    }

    const revision = ++this.revision
    this.state = 'unlocking'
    this.publish()
    let unlocked: UnlockedVault | undefined
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
      this.activateUnlockedVault(unlocked)
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

  private async unlockInternal(password: string): Promise<SecuritySnapshot> {
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
    let unlocked: UnlockedVault | undefined
    try {
      const envelope = await this.repository.read()
      unlocked = await this.crypto.unlock(password, envelope)
      if (!this.isCurrent(revision)) {
        zeroBuffer(unlocked.key)
        return this.getSnapshot()
      }

      this.activateUnlockedVault(unlocked)
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

  private async saveBinanceAccountInternal(
    draft: BinanceAccountDraft,
  ): Promise<{
    accountId: string
    snapshot: SecuritySnapshot
  }> {
    this.assertUnlocked()
    this.assertAccountDraft(draft)
    const vault = this.requireVault()
    const accountId = draft.accountId ?? this.createAccountId()
    if (this.connections.snapshot().accountId === accountId) {
      this.connections.disconnect()
    }
    const record: ProviderAccountRecord = {
      accountId,
      provider: 'binance',
      label: draft.label.trim(),
      markets: [...draft.markets],
      apiKey: draft.apiKey,
      apiSecret: draft.apiSecret,
    }
    const accounts = vault.accounts.filter(
      (account) => account.accountId !== accountId,
    )
    const next = { version: 1 as const, accounts: [...accounts, record] }
    const revision = this.revision
    const envelope = await this.persistContents(next, revision)
    if (!envelope || !this.isCurrent(revision)) {
      return { accountId, snapshot: this.getSnapshot() }
    }

    this.vault = next
    this.envelope = envelope
    return { accountId, snapshot: this.publish() }
  }

  private async removeAccountInternal(
    accountId: string,
  ): Promise<SecuritySnapshot> {
    this.assertUnlocked()
    const vault = this.requireVault()
    if (this.connections.snapshot().accountId === accountId) {
      this.connections.disconnect()
    }
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
    return this.publish()
  }

  async connectAccount(accountId: string): Promise<SecuritySnapshot> {
    this.assertUnlocked()
    const account = this.requireVault().accounts.find(
      (candidate) => candidate.accountId === accountId,
    )
    if (!account) {
      throw new Error('Conta de provider não encontrada')
    }
    await this.connections.connect(account)
    return this.getSnapshot()
  }

  disconnectAccount(): SecuritySnapshot {
    this.connections.disconnect()
    return this.getSnapshot()
  }

  private async changePasswordInternal(
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
        try {
          await this.repository.write(envelope)
        } catch {
          throw new Error('Não foi possível restaurar o cofre de credenciais')
        }
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

  private async resetVaultInternal(
    confirmation: 'APAGAR',
  ): Promise<SecuritySnapshot> {
    if (confirmation !== 'APAGAR') {
      throw new Error('Confirmação de reset inválida')
    }

    this.revision += 1
    this.connections.disconnect()
    this.clearUnlockedVault()
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

  private unlockedAccountSummaries(): readonly ProviderAccountSummary[] {
    if (this.state !== 'unlocked' || !this.vault) {
      return []
    }

    return this.vault.accounts.map((account) => (
      toSummary(account, this.connections.snapshot())
    ))
  }

  private activateUnlockedVault(unlocked: UnlockedVault): void {
    this.masterKey = unlocked.key
    this.vault = unlocked.contents
    this.envelope = unlocked.envelope
    this.state = 'unlocked'
    this.startIdleTimer()
  }

  private clearUnlockedVault(): void {
    this.stopIdleTimer()
    zeroBuffer(this.masterKey)
    this.masterKey = undefined
    this.vault = undefined
    this.envelope = undefined
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
