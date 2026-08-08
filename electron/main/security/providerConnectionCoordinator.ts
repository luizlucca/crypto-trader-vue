import type {
  AccountFailureCode,
  ProviderConnectionSnapshot,
} from '@shared/contracts/security'
import type { AccountMarketValidation } from '../providers/accountProvider'
import { AccountProviderRegistry } from '../providers/accountProvider'
import type { ProviderAccountRecord } from './vaultCrypto'

const VALIDATION_DEADLINE_MS = 10_000

type ValidationOutcome = {
  state: 'connected' | 'failed'
  failureCode?: AccountFailureCode
}

interface ActiveValidation {
  controller: AbortController
  deadline: ReturnType<typeof setTimeout> | undefined
}

export class ProviderConnectionCoordinator {
  private revision = 0
  private activeValidation: ActiveValidation | undefined
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
    this.abortActiveValidation()
    const revision = ++this.revision
    const attempt: ActiveValidation = {
      controller: new AbortController(),
      deadline: undefined,
    }
    this.activeValidation = attempt
    this.set({ accountId: account.accountId, state: 'connecting' })
    try {
      const next = await this.validate(account, attempt)
      if (revision === this.revision) {
        this.set({ accountId: account.accountId, ...next })
      }
    } finally {
      this.clearValidation(attempt)
    }
  }

  disconnect(): void {
    this.abortActiveValidation()
    this.revision += 1
    this.set({ state: 'disconnected' })
  }

  private abortActiveValidation(): void {
    const active = this.activeValidation
    if (!active) {
      return
    }

    active.controller.abort()
    this.clearValidation(active)
  }

  private async validate(
    account: ProviderAccountRecord,
    attempt: ActiveValidation,
  ): Promise<ValidationOutcome> {
    const signal = attempt.controller.signal
    let removeAbortListener: (() => void) | undefined
    const aborted = new Promise<ValidationOutcome>((resolve) => {
      const onAbort = () => resolve({ state: 'failed', failureCode: 'network' })
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () => signal.removeEventListener('abort', onAbort)
    })
    const deadline = new Promise<ValidationOutcome>((resolve) => {
      attempt.deadline = setTimeout(() => {
        attempt.controller.abort()
        resolve({ state: 'failed', failureCode: 'network' })
      }, VALIDATION_DEADLINE_MS)
    })

    try {
      const validation = Promise.resolve()
        .then(() => this.providers.get(account.provider).validateConnection({
          apiKey: account.apiKey,
          apiSecret: account.apiSecret,
        }, account.markets, { signal }))
        .then((results) => this.toConnection(account.markets, results))
      return await Promise.race([validation, aborted, deadline])
    } catch {
      return {
        state: 'failed',
        failureCode: signal.aborted ? 'network' : 'unknown',
      }
    } finally {
      removeAbortListener?.()
    }
  }

  private clearValidation(attempt: ActiveValidation): void {
    if (attempt.deadline !== undefined) {
      clearTimeout(attempt.deadline)
      attempt.deadline = undefined
    }
    if (this.activeValidation === attempt) {
      this.activeValidation = undefined
    }
  }

  private toConnection(
    markets: readonly ProviderAccountRecord['markets'][number][],
    results: readonly AccountMarketValidation[],
  ): ValidationOutcome {
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
