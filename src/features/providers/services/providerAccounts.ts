import type { BinanceAccountDraft } from '@shared/contracts/security'

export function emptyBinanceAccountDraft(): BinanceAccountDraft {
  return {
    label: '',
    markets: ['spot'],
    apiKey: '',
    apiSecret: '',
    enabled: true,
  }
}

export function canSaveBinanceDraft(draft: BinanceAccountDraft): boolean {
  return draft.label.trim().length > 0
    && draft.markets.length > 0
    && draft.apiKey.trim().length > 0
    && draft.apiSecret.trim().length > 0
}

export function formatApiKeyHint(apiKeySuffix: string): string {
  return /^••••.{1,4}$/.test(apiKeySuffix) ? apiKeySuffix : '••••'
}
