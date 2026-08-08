import type { MarketEnvironment } from '@shared/types/market'
import type {
  ProviderAccountSummary,
  ProviderConnectionSnapshot,
} from '@shared/contracts/security'

/**
 * Which venue the application is pointed at, and how to move between the two.
 *
 * Lives in `shared/` because the main process decides it and the renderer
 * renders it. A second, independent copy of this rule is exactly how the badge
 * ends up disagreeing with the credential actually in use.
 */

export function isMarketEnvironment(
  value: unknown,
): value is MarketEnvironment {
  return value === 'live' || value === 'test'
}

export function oppositeEnvironment(
  environment: MarketEnvironment,
): MarketEnvironment {
  return environment === 'live' ? 'test' : 'live'
}

/**
 * Follows the *selected* account, not the healthy one.
 *
 * Keying off a successful connection would send the app back to production the
 * moment a testnet connection dropped — reopening live streams and taking the
 * badge down while the operator still believes they are in a sandbox. A failed
 * test connection is still a test context.
 */
export function activeEnvironment(
  accounts: readonly ProviderAccountSummary[],
  connection: ProviderConnectionSnapshot,
): MarketEnvironment {
  if (!connection.accountId) {
    return 'live'
  }
  const account = accounts.find(
    (candidate) => candidate.accountId === connection.accountId,
  )
  return account?.environment ?? 'live'
}

/**
 * Whether anything exists in the venue not currently shown, and what.
 *
 * Provider-blind on purpose: the question behind it is "is there somewhere to
 * switch to", and an account at another exchange answers it just as well. The
 * picker lists them all anyway — this only decides whether the header offers
 * to switch or to register the first account of that environment.
 */
export function siblingAccount(
  accounts: readonly ProviderAccountSummary[],
  environment: MarketEnvironment,
): ProviderAccountSummary | undefined {
  const wanted = oppositeEnvironment(environment)
  return accounts.find((account) => account.environment === wanted)
}

export function environmentLabel(environment: MarketEnvironment): string {
  return environment === 'test' ? 'Testes' : 'Produção'
}
