import type { BinanceAccountDraft } from '@shared/contracts/security'
import { isBinanceAccountDraft } from '@shared/contracts/security'

export function emptyBinanceAccountDraft(): BinanceAccountDraft {
  return {
    // Production by default: a test account is the deliberate choice, and a
    // default that quietly points elsewhere is how a key ends up in the wrong
    // venue.
    environment: 'live',
    label: '',
    markets: ['spot'],
    apiKey: '',
    apiSecret: '',
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
