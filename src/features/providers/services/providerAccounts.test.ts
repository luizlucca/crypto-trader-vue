import { describe, expect, it } from 'vitest'
import {
  canSaveBinanceDraft,
  emptyBinanceAccountDraft,
  formatApiKeyHint,
} from './providerAccounts'

describe('provider account helpers', () => {
  it('requires a label, market, API key and secret before save', () => {
    expect(canSaveBinanceDraft(emptyBinanceAccountDraft())).toBe(false)
    const credentials = {
      label: 'Principal',
      markets: ['spot'],
      apiKey: 'binance-api-key',
      apiSecret: 'binance-api-secret',
    } as const
    expect(canSaveBinanceDraft({
      ...credentials,
      validateAndConnect: true,
    })).toBe(true)
    expect(canSaveBinanceDraft({
      ...credentials,
      validateAndConnect: false,
    })).toBe(true)
  })

  it('renders only the API key suffix returned by the main process', () => {
    expect(formatApiKeyHint('••••ABCD')).toBe('••••ABCD')
    expect(formatApiKeyHint('binance-api-key-ABCD')).toBe('••••')
  })
})
