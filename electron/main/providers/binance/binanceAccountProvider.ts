import { createHmac } from 'node:crypto'
import type { AccountFailureCode } from '@shared/contracts/security'
import type { Market, MarketEnvironment } from '@shared/types/market'
import type {
  AccountMarketValidation,
  AccountProvider,
  AccountProviderValidationContext,
  BinanceCredentials,
} from '../accountProvider'

interface AccountFetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type AccountFetch = (
  url: string,
  options: RequestInit,
) => Promise<AccountFetchResponse>

interface BinanceAccountProviderOptions {
  fetch?: AccountFetch
  now?: () => number
}

const RECV_WINDOW_MS = 5_000
const VALIDATION_SYMBOL = 'BTCUSDT'

/**
 * Signed endpoints used only to prove a credential works. Written out per
 * environment rather than derived from production, for the same reason the
 * market-data endpoints are: a testnet key is not valid in production, and a
 * host resolved by string surgery would report that mismatch as "credencial
 * inválida" — the message that sends the operator looking in the wrong place.
 */
const ENDPOINTS: Record<MarketEnvironment, Record<Market, string>> = {
  live: {
    spot: 'https://api.binance.com/api/v3/account/commission',
    futures: 'https://fapi.binance.com/fapi/v1/commissionRate',
  },
  test: {
    spot: 'https://testnet.binance.vision/api/v3/account/commission',
    futures: 'https://demo-fapi.binance.com/fapi/v1/commissionRate',
  },
}

export class BinanceAccountProvider implements AccountProvider {
  readonly id = 'binance' as const

  private readonly fetch: AccountFetch
  private readonly now: () => number

  constructor({ fetch, now }: BinanceAccountProviderOptions = {}) {
    this.fetch = fetch ?? ((url, options) => globalThis.fetch(url, options))
    this.now = now ?? Date.now
  }

  async validateConnection(
    credentials: BinanceCredentials,
    markets: readonly Market[],
    context: AccountProviderValidationContext,
  ): Promise<readonly AccountMarketValidation[]> {
    return Promise.all(
      markets.map((market) => this.validateMarket(
        credentials,
        market,
        context.environment,
        context.signal,
      )),
    )
  }

  private async validateMarket(
    credentials: BinanceCredentials,
    market: Market,
    environment: MarketEnvironment,
    signal: AbortSignal | undefined,
  ): Promise<AccountMarketValidation> {
    try {
      const response = await this.fetch(
        this.createSignedUrl(market, environment, credentials.apiSecret),
        {
          method: 'GET',
          redirect: 'error',
          signal,
          headers: { 'X-MBX-APIKEY': credentials.apiKey },
        },
      )

      if (response.ok) {
        return { market, state: 'connected' }
      }

      return {
        market,
        state: 'failed',
        failureCode: await this.readFailureCode(response),
      }
    } catch {
      return { market, state: 'failed', failureCode: 'network' }
    }
  }

  private createSignedUrl(
    market: Market,
    environment: MarketEnvironment,
    apiSecret: string,
  ): string {
    const parameters = new URLSearchParams({
      symbol: VALIDATION_SYMBOL,
      timestamp: String(this.now()),
      recvWindow: String(RECV_WINDOW_MS),
    })
    const signature = createHmac('sha256', apiSecret)
      .update(parameters.toString())
      .digest('hex')
    parameters.set('signature', signature)

    return `${ENDPOINTS[environment][market]}?${parameters}`
  }

  private async readFailureCode(
    response: AccountFetchResponse,
  ): Promise<AccountFailureCode> {
    let errorCode: unknown
    try {
      const payload = await response.json()
      errorCode = this.readBinanceErrorCode(payload)
    } catch {
      errorCode = undefined
    }

    if (response.status === 401 || errorCode === -2014 || errorCode === -2015) {
      return 'credentials'
    }
    if (response.status === 403) {
      return 'permission'
    }
    if (errorCode === -1021) {
      return 'clock'
    }

    return 'unknown'
  }

  private readBinanceErrorCode(payload: unknown): number | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined
    }

    const { code } = payload as { code?: unknown }
    return typeof code === 'number' ? code : undefined
  }
}
