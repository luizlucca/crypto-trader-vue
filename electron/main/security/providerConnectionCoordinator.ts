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
      return this.toConnection(account.markets, results)
    } catch {
      return { state: 'failed', failureCode: 'unknown' }
    }
  }

  private toConnection(
    markets: readonly ProviderAccountRecord['markets'][number][],
    results: readonly AccountMarketValidation[],
  ): { state: 'connected' | 'failed', failureCode?: AccountFailureCode } {
    if (markets.length === 0 || results.length !== markets.length) {
      return { state: 'failed', failureCode: 'unknown' }
    }

    const expected = new Set(markets)
    const received = new Set<AccountMarketValidation['market']>()
    if (expected.size !== markets.length) {
      return { state: 'failed', failureCode: 'unknown' }
    }

    for (const result of results) {
      if (result.state === 'failed') {
        return {
          state: 'failed',
          failureCode: result.failureCode ?? 'unknown',
        }
      }
      if (!expected.has(result.market) || received.has(result.market)) {
        return { state: 'failed', failureCode: 'unknown' }
      }
      received.add(result.market)
    }

    return received.size === expected.size
      ? { state: 'connected' }
      : { state: 'failed', failureCode: 'unknown' }
  }

  private set(snapshot: ProviderConnectionSnapshot): void {
    this.current = { ...snapshot }
    for (const listener of this.listeners) {
      listener(this.snapshot())
    }
  }
}
