import type { Market } from '../../../../../src/types/market'

export interface BinanceEndpoints {
  rest: string
  publicWebSocket: string
  marketWebSocket: string
}

const endpoints: Record<Market, BinanceEndpoints> = {
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
}

export function endpointsFor(market: Market): BinanceEndpoints {
  return endpoints[market]
}
