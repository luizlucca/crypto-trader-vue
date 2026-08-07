import type {
  AccountFailureCode,
} from '@shared/contracts/security'
import type { Market } from '@shared/types/market'

export interface BinanceCredentials {
  apiKey: string
  apiSecret: string
}

export interface AccountMarketValidation {
  market: Market
  state: 'connected' | 'failed'
  failureCode?: AccountFailureCode
}

export interface AccountProvider {
  readonly id: 'binance'
  validateConnection(
    credentials: BinanceCredentials,
    markets: readonly Market[],
  ): Promise<readonly AccountMarketValidation[]>
}

export class AccountProviderRegistry {
  private readonly providers = new Map<AccountProvider['id'], AccountProvider>()

  constructor(providers: readonly AccountProvider[]) {
    for (const provider of providers) {
      this.providers.set(provider.id, provider)
    }
  }

  get(providerId: AccountProvider['id']): AccountProvider {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`Provider de conta indisponível: ${providerId}`)
    }

    return provider
  }
}
