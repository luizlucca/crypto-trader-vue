import type { Market, MarketEnvironment } from '@shared/types/market'

export interface BinanceEndpoints {
  rest: string
  publicWebSocket: string
  marketWebSocket: string
}

/**
 * Binance serves its testnets from hosts that share nothing with production —
 * different domains, and for Futures a different domain from the one its own
 * older docs advertised. Every address is written out rather than derived from
 * production by string substitution: a rule that guesses would silently point
 * live money at a test host the day Binance renames one of them.
 *
 * Verified against the official docs on 2026-08-08:
 * developers.binance.com/docs/binance-spot-api-docs/testnet/general-info and
 * developers.binance.com/docs/derivatives/usds-margined-futures/general-info
 */
const endpoints: Record<MarketEnvironment, Record<Market, BinanceEndpoints>> = {
  live: {
    spot: {
      rest: 'https://api.binance.com/api/v3',
      publicWebSocket: 'wss://stream.binance.com:9443/ws',
      marketWebSocket: 'wss://stream.binance.com:9443/ws',
    },
    futures: {
      rest: 'https://fapi.binance.com/fapi/v1',
      publicWebSocket: 'wss://fstream.binance.com/public/ws',
      marketWebSocket: 'wss://fstream.binance.com/market/ws',
    },
  },
  test: {
    spot: {
      rest: 'https://testnet.binance.vision/api/v3',
      publicWebSocket: 'wss://stream.testnet.binance.vision/ws',
      marketWebSocket: 'wss://stream.testnet.binance.vision/ws',
    },
    futures: {
      rest: 'https://demo-fapi.binance.com/fapi/v1',
      publicWebSocket: 'wss://demo-fstream.binance.com/ws',
      marketWebSocket: 'wss://demo-fstream.binance.com/ws',
    },
  },
}

export function endpointsFor(
  market: Market,
  environment: MarketEnvironment,
): BinanceEndpoints {
  return endpoints[environment][market]
}
