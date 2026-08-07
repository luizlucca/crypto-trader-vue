import type { BinanceAccountDraft } from '@shared/contracts/security'
import { isBinanceAccountDraft } from '@shared/contracts/security'

export function emptyBinanceAccountDraft(): BinanceAccountDraft {
  return {
    label: '',
    markets: ['spot'],
    apiKey: '',
    apiSecret: '',
    validateAndConnect: true,
  }
}

// Delegating keeps the enabled Save button and the accepted IPC payload from
// drifting: any rule added at the boundary applies to the form for free.
export function canSaveBinanceDraft(draft: BinanceAccountDraft): boolean {
  return isBinanceAccountDraft(draft)
}

export function formatApiKeyHint(apiKeySuffix: string): string {
  return /^••••.{1,4}$/.test(apiKeySuffix) ? apiKeySuffix : '••••'
}
