import { createHmac } from 'node:crypto'
import type { AccountFailureCode } from '@shared/contracts/security'
import type { Market } from '@shared/types/market'
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
const ENDPOINTS: Record<Market, string> = {
  spot: 'https://api.binance.com/api/v3/account/commission',
  futures: 'https://fapi.binance.com/fapi/v1/commissionRate',
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
        context.signal,
      )),
    )
  }

  private async validateMarket(
    credentials: BinanceCredentials,
    market: Market,
    signal: AbortSignal | undefined,
  ): Promise<AccountMarketValidation> {
    try {
      const response = await this.fetch(
        this.createSignedUrl(market, credentials.apiSecret),
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

  private createSignedUrl(market: Market, apiSecret: string): string {
    const parameters = new URLSearchParams({
      symbol: VALIDATION_SYMBOL,
      timestamp: String(this.now()),
      recvWindow: String(RECV_WINDOW_MS),
    })
    const signature = createHmac('sha256', apiSecret)
      .update(parameters.toString())
      .digest('hex')
    parameters.set('signature', signature)

    return `${ENDPOINTS[market]}?${parameters}`
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
