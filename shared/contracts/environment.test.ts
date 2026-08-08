import { describe, expect, it } from 'vitest'
import type { MarketSelection } from '@shared/types/market'
import { isMarketEnvironment } from '@shared/domain/providerEnvironment'
import { providerCapabilities } from '@shared/domain/providerCapabilities'
import {
  copyMarketSelection,
  isMarketDataRequest,
  isMarketSelection,
} from './desktop'
import { isBinanceAccountDraft } from './security'

const selection: MarketSelection = {
  provider: 'binance',
  environment: 'live',
  market: 'futures',
  symbol: 'BTCUSDT',
  interval: '1h',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  priceTickSize: 0.01,
  pricePrecision: 2,
  quantityPrecision: 3,
}

const draft = {
  environment: 'live' as const,
  label: 'Principal',
  markets: ['spot'] as const,
  apiKey: 'binance-api-key',
  apiSecret: 'binance-api-secret',
}

describe('market environment guard', () => {
  it('accepts only the two known environments', () => {
    expect(isMarketEnvironment('live')).toBe(true)
    expect(isMarketEnvironment('test')).toBe(true)
  })

  it('rejects anything else, including plausible near-misses', () => {
    for (const value of
      ['prod', 'production', 'testnet', '', 'LIVE', null, undefined, 0, {}]) {
      expect(isMarketEnvironment(value)).toBe(false)
    }
  })
})

describe('selection carries the venue across the IPC boundary', () => {
  it('rejects a selection with no environment', () => {
    const { environment: _dropped, ...withoutEnvironment } = selection
    expect(isMarketSelection(withoutEnvironment)).toBe(false)
  })

  it('rejects a selection whose environment is not a known value', () => {
    expect(isMarketSelection({ ...selection, environment: 'prod' }))
      .toBe(false)
  })

  /*
   * The copy is what crosses the process boundary. Dropping the field here
   * would silently downgrade every request to production.
   */
  it('preserves the environment when copied', () => {
    expect(copyMarketSelection({ ...selection, environment: 'test' })
      .environment).toBe('test')
  })
})

describe('requests that name a venue without carrying a selection', () => {
  it('requires an environment on a catalog request', () => {
    const base = {
      kind: 'catalog' as const,
      provider: 'binance',
      market: 'futures' as const,
      quoteAsset: '',
      forceRefresh: false,
    }
    expect(isMarketDataRequest({ ...base, environment: 'test' })).toBe(true)
    expect(isMarketDataRequest(base)).toBe(false)
    expect(isMarketDataRequest({ ...base, environment: 'prod' })).toBe(false)
  })

  it('requires an environment on a symbols request', () => {
    const base = {
      kind: 'symbols' as const,
      provider: 'binance',
      market: 'spot' as const,
      quoteAsset: 'USDT',
    }
    expect(isMarketDataRequest({ ...base, environment: 'live' })).toBe(true)
    expect(isMarketDataRequest(base)).toBe(false)
  })

  it('rejects a stream request whose selection lost the environment', () => {
    const { environment: _dropped, ...withoutEnvironment } = selection
    expect(isMarketDataRequest({
      kind: 'start-stream',
      sessionId: 'tab-one',
      selection: withoutEnvironment,
      visible: true,
    })).toBe(false)
  })
})

describe('account draft declares its venue', () => {
  it('accepts a draft for either environment', () => {
    expect(isBinanceAccountDraft(draft)).toBe(true)
    expect(isBinanceAccountDraft({ ...draft, environment: 'test' })).toBe(true)
  })

  it('rejects a draft with no environment', () => {
    const { environment: _dropped, ...withoutEnvironment } = draft
    expect(isBinanceAccountDraft(withoutEnvironment)).toBe(false)
  })

  it('rejects a draft with an unknown environment', () => {
    expect(isBinanceAccountDraft({ ...draft, environment: 'testnet' }))
      .toBe(false)
  })

  /* The boundary refuses unknown keys, so a typo cannot slip past as extra. */
  it('rejects a draft carrying an unexpected extra key', () => {
    expect(isBinanceAccountDraft({ ...draft, enviroment: 'test' })).toBe(false)
  })
})

/*
 * The Spot and Futures testnets are separate sign-ups issuing separate keys —
 * one credential is never valid on both. Production is the opposite: a single
 * Binance key covers the two markets. Accepting a two-market test draft would
 * defer the contradiction to connection time, where it surfaces as
 * "credenciais inválidas" and sends the operator to regenerate a good key.
 */
describe('how many markets one Binance credential may claim', () => {
  it('lets a production credential cover both markets', () => {
    expect(providerCapabilities('binance').coversBothMarkets('live'))
      .toBe(true)
    expect(isBinanceAccountDraft({
      ...draft,
      markets: ['spot', 'futures'],
    })).toBe(true)
  })

  it('holds a test credential to exactly one market', () => {
    expect(providerCapabilities('binance').coversBothMarkets('test'))
      .toBe(false)
    expect(isBinanceAccountDraft({
      ...draft,
      environment: 'test',
      markets: ['spot', 'futures'],
    })).toBe(false)
  })

  it('accepts a test credential for either market alone', () => {
    for (const markets of [['spot'], ['futures']] as const) {
      expect(isBinanceAccountDraft({
        ...draft,
        environment: 'test',
        markets,
      })).toBe(true)
    }
  })

  it('still requires at least one market in either environment', () => {
    for (const environment of ['live', 'test'] as const) {
      expect(isBinanceAccountDraft({ ...draft, environment, markets: [] }))
        .toBe(false)
    }
  })
})
