import type {
  AccountFailureCode,
  ProviderConnectionSnapshot,
} from '@shared/contracts/security'
import type { AccountMarketValidation } from '../providers/accountProvider'
import { AccountProviderRegistry } from '../providers/accountProvider'
import type { ProviderAccountRecord } from './vaultCrypto'

export class ProviderConnectionCoordinator {
  private revision = 0
  private current: ProviderConnectionSnapshot = { state: 'disconnected' }
  private readonly listeners = new Set<(
    snapshot: ProviderConnectionSnapshot,
  ) => void>()

  constructor(private readonly providers: AccountProviderRegistry) {}

  snapshot(): ProviderConnectionSnapshot {
    return { ...this.current }
  }

  subscribe(
    listener: (snapshot: ProviderConnectionSnapshot) => void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async connect(account: ProviderAccountRecord): Promise<void> {
    const revision = ++this.revision
    this.set({ accountId: account.accountId, state: 'connecting' })
    const next = await this.validate(account)
    if (revision === this.revision) {
      this.set({ accountId: account.accountId, ...next })
    }
  }

  disconnect(): void {
    this.revision += 1
    this.set({ state: 'disconnected' })
  }

  private async validate(account: ProviderAccountRecord): Promise<{
    state: 'connected' | 'failed'
    failureCode?: AccountFailureCode
  }> {
    try {
      const results = await this.providers.get(account.provider)
        .validateConnection({
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
        }, account.markets)
      return this.toConnection(results)
    } catch {
      return { state: 'failed', failureCode: 'unknown' }
    }
  }

  private toConnection(
    results: readonly AccountMarketValidation[],
  ): { state: 'connected' | 'failed', failureCode?: AccountFailureCode } {
    const failed = results.find((result) => result.state === 'failed')
    return failed
      ? { state: 'failed', failureCode: failed.failureCode ?? 'unknown' }
      : { state: 'connected' }
  }

  private set(snapshot: ProviderConnectionSnapshot): void {
    this.current = { ...snapshot }
    for (const listener of this.listeners) {
      listener(this.snapshot())
    }
  }
}
