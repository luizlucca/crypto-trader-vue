import type { MarketEnvironment } from '@shared/types/market'

/**
 * What each exchange can actually do, declared per provider.
 *
 * The rules here are facts about one venue, not about trading. Stating them as
 * universal truths in the contract — "a test credential covers one market" —
 * reads as a law of test environments and is only a description of how Binance
 * happens to run its testnets. The next provider would either be refused a
 * valid credential or quietly force the rule to be rewritten as an exception.
 *
 * Adding a provider means adding a row, and the compiler names every place
 * that has to answer for it.
 */

export type ProviderId = 'binance'

const PROVIDER_IDS: readonly ProviderId[] = ['binance']

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string'
    && (PROVIDER_IDS as readonly string[]).includes(value)
}

export interface ProviderCapabilities {
  /**
   * Whether one credential reaches both Spot and Futures in this environment.
   */
  coversBothMarkets: (environment: MarketEnvironment) => boolean
}

const CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  binance: {
    /*
     * In production one API key serves both markets. The two testnets are not
     * that exchange in test mode — they are separate systems with separate
     * sign-ups (GitHub at testnet.binance.vision; its own account at
     * testnet.binancefuture.com) issuing keys that are worthless on the other.
     * A test credential claiming both markets describes a key that cannot
     * exist, and only says so at connection time as "credenciais inválidas".
     */
    coversBothMarkets: (environment) => environment === 'live',
  },
}

export function providerCapabilities(
  provider: ProviderId,
): ProviderCapabilities {
  return CAPABILITIES[provider]
}
