import { readonly, ref, type Ref } from 'vue'
import type { ProviderAccountSummary } from '@shared/contracts/security'
import type { MarketEnvironment } from '@shared/types/market'

/**
 * The one place that decides whether connecting an account may happen now.
 *
 * There are several doors into a connection — the header's account picker, the
 * provider settings panel, the retry offered after a failure, the reconnect
 * attempted right after unlocking — and each reaches the same IPC request.
 * Guarding one of them, which is what this started as, does not hold the
 * invariant: connecting from the settings panel left a production credential
 * live under a testnet chart, with no badge, because that door had no check.
 *
 * So the check lives here and every door asks. Callers that get `false` must
 * not connect: a switch is pending, and the workspace owner will confirm it
 * and rebuild.
 */
export interface ConnectionGate {
  /** The venue the workspace is currently drawing. */
  workspaceEnvironment: Readonly<Ref<MarketEnvironment>>
  followWorkspace: (environment: MarketEnvironment) => void
  /** Set while an operator has yet to confirm a venue change. */
  pendingSwitch: Readonly<Ref<ProviderAccountSummary | undefined>>
  /**
   * True when the caller may connect straight away. False means the account
   * belongs to another venue and `pendingSwitch` now holds it.
   */
  mayConnect: (
    accountId: string,
    accounts: readonly ProviderAccountSummary[],
  ) => boolean
  clearPendingSwitch: () => void
}

/**
 * The state this refuses: the private side pointed at one exchange while
 * every price on screen comes from the other. Both halves look healthy alone,
 * and an order would execute against a book that is not the one drawn.
 *
 * An account the snapshot no longer holds is not divergence: it is an account
 * removed while the picker was open, which the connect attempt already
 * refuses. Raising a confirmation here would gate a switch that cannot happen.
 */
function accountOfAnotherVenue(
  accountId: string,
  accounts: readonly ProviderAccountSummary[],
  workspaceEnvironment: MarketEnvironment,
): ProviderAccountSummary | undefined {
  const target = accounts.find(
    (account) => account.accountId === accountId,
  )
  return target && target.environment !== workspaceEnvironment
    ? target
    : undefined
}

export function createConnectionGate(): ConnectionGate {
  const workspaceEnvironment = ref<MarketEnvironment>('live')
  const pendingSwitch = ref<ProviderAccountSummary>()

  return {
    workspaceEnvironment: readonly(workspaceEnvironment),
    pendingSwitch: readonly(pendingSwitch),
    followWorkspace: (environment) => {
      workspaceEnvironment.value = environment
    },
    mayConnect: (accountId, accounts) => {
      const elsewhere = accountOfAnotherVenue(
        accountId,
        accounts,
        workspaceEnvironment.value,
      )
      if (!elsewhere) {
        return true
      }
      pendingSwitch.value = elsewhere
      return false
    },
    clearPendingSwitch: () => {
      pendingSwitch.value = undefined
    },
  }
}

let shared: ConnectionGate | undefined

/** Shared because the doors live in different components. */
export function useConnectionGate(): ConnectionGate {
  shared ??= createConnectionGate()
  return shared
}
