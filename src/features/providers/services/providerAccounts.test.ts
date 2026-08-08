import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { BinanceAccountDraft } from '@shared/contracts/security'
import { isSecurityRequest } from '@shared/contracts/security'
import {
  canSaveBinanceDraft,
  emptyBinanceAccountDraft,
  formatApiKeyHint,
} from './providerAccounts'

describe('provider account helpers', () => {
  it('requires a label, market, API key and secret before save', () => {
    expect(canSaveBinanceDraft(emptyBinanceAccountDraft())).toBe(false)
    const credentials = {
      environment: 'live',
      label: 'Principal',
      markets: ['spot'],
      apiKey: 'binance-api-key',
      apiSecret: 'binance-api-secret',
    } as const
    expect(canSaveBinanceDraft({
      ...credentials,
    })).toBe(true)
    expect(canSaveBinanceDraft({
      ...credentials,
    })).toBe(true)
  })

  it.each([
    ['a key shorter than the contract minimum', 'short'],
    ['a key longer than the contract maximum', 'k'.repeat(257)],
  ])('refuses save for %s', (_case, apiKey) => {
    expect(canSaveBinanceDraft({
      ...emptyBinanceAccountDraft(),
      label: 'Principal',
      apiKey,
      apiSecret: 'binance-api-secret',
    })).toBe(false)
  })

  it('enables save exactly when the IPC validator accepts the draft', () => {
    const base = {
      ...emptyBinanceAccountDraft(),
      label: 'Principal',
      apiKey: 'binance-api-key',
      apiSecret: 'binance-api-secret',
    }
    const drafts: BinanceAccountDraft[] = [
      base,
      { ...base, apiKey: 'k'.repeat(8) },
      { ...base, apiKey: 'k'.repeat(7) },
      { ...base, apiKey: 'k'.repeat(256) },
      { ...base, apiKey: 'k'.repeat(257) },
      { ...base, apiSecret: 's'.repeat(7) },
      { ...base, apiSecret: 's'.repeat(257) },
      { ...base, apiKey: '   spaced   ' },
      { ...base, label: '   ' },
      { ...base, label: 'l'.repeat(65) },
      { ...base, markets: [] },
    ]

    for (const draft of drafts) {
      expect([draft.apiKey.length, canSaveBinanceDraft(draft)]).toEqual([
        draft.apiKey.length,
        isSecurityRequest({ kind: 'save-binance-account', draft }),
      ])
    }
  })

  it('still enables save when editing a randomUUID account', () => {
    expect(canSaveBinanceDraft({
      ...emptyBinanceAccountDraft(),
      accountId: randomUUID(),
      label: 'Principal',
      apiKey: 'binance-api-key',
      apiSecret: 'binance-api-secret',
    })).toBe(true)
  })

  it('renders only the API key suffix returned by the main process', () => {
    expect(formatApiKeyHint('••••ABCD')).toBe('••••ABCD')
    expect(formatApiKeyHint('binance-api-key-ABCD')).toBe('••••')
  })
})
