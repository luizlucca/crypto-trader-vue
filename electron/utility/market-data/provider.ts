import type { Observable } from 'rxjs'
import type {
  Candle,
  Market,
  MarketCatalog,
  MarketSelection,
  MarketSymbol,
  OrderBookSnapshot,
} from '@shared/types/market'

export type ConnectionStateName
  = | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error'

export interface ConnectionState {
  state: ConnectionStateName
  message?: string
}

export type ConnectionStateHandler = (state: ConnectionState) => void

export interface CatalogOptions {
  market: Market
  quoteAsset: string
  forceRefresh: boolean
}

export interface CandleHistoryOptions {
  limit: number
  before?: number
}

export interface MarketDataProvider {
  readonly name: string
  getCatalog(options: CatalogOptions): Promise<MarketCatalog>
  getSymbols(market: Market, quoteAsset: string): Promise<MarketSymbol[]>
  getCandles(
    selection: MarketSelection,
    options: CandleHistoryOptions,
  ): Promise<Candle[]>
  streamCandles(
    selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Observable<Candle>
  streamOrderBook(
    selection: MarketSelection,
    onState: ConnectionStateHandler,
  ): Observable<OrderBookSnapshot>
}

export class ProviderRegistry {
  private readonly providers = new Map<string, MarketDataProvider>()

  constructor(providers: MarketDataProvider[]) {
    providers.forEach((provider) => {
      this.providers.set(provider.name.toLowerCase(), provider)
    })
  }

  get(name: string): MarketDataProvider {
    const provider = this.providers.get(name.trim().toLowerCase())
    if (!provider) {
      throw new Error(`Provedor de dados não registrado: ${name}`)
    }
    return provider
  }
}
