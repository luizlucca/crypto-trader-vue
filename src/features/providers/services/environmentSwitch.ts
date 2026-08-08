import type { MarketEnvironment } from '@shared/types/market'
import type {
  ProviderAccountSummary,
  SecuritySnapshot,
} from '@shared/contracts/security'

/**
 * Moving the whole application between production and a testnet.
 *
 * Kept as a plain function over injected effects so the ordering — the part
 * that actually matters — can be tested without a chart, a socket or a vault.
 */

export type EnvironmentSwitchOutcome
  = | { status: 'switched' }
    | { status: 'connection-failed', snapshot: SecuritySnapshot }

export interface EnvironmentSwitchEffects {
  connect: (accountId: string) => Promise<SecuritySnapshot>
  resetWorkspace: (environment: MarketEnvironment) => Promise<void>
}

/**
 * Runs only after the operator has confirmed. The confirmation is the dialog
 * that gates the call, not a step in here: cancelling means this never runs,
 * which is a stronger guarantee than returning early from it.
 *
 * Connects before resetting, deliberately.
 *
 * The reset destroys work — every tab, its period, its indicators — and a
 * testnet key that turns out to be wrong is an ordinary outcome, not an edge
 * case. Resetting first would spend the operator's workspace to discover the
 * credential is bad. This way a failed connection leaves everything standing
 * and the switch simply did not happen.
 */
export async function switchEnvironment(
  target: ProviderAccountSummary,
  effects: EnvironmentSwitchEffects,
): Promise<EnvironmentSwitchOutcome> {
  const snapshot = await effects.connect(target.accountId)
  if (snapshot.connection.state !== 'connected') {
    return { status: 'connection-failed', snapshot }
  }

  await effects.resetWorkspace(target.environment)
  return { status: 'switched' }
}
