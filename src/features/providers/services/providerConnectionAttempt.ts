import type { SecurityState } from '@shared/contracts/security'

export interface ProviderConnectionAttemptToken {
  accountId: string
  revision: number
}

export interface ProviderConnectionAttempt {
  begin(accountId: string): ProviderConnectionAttemptToken | undefined
  cancel(): boolean
  finish(token: ProviderConnectionAttemptToken): void
  isCurrent(
    token: ProviderConnectionAttemptToken,
    state: SecurityState,
  ): boolean
}

export function createProviderConnectionAttempt(): ProviderConnectionAttempt {
  let revision = 0
  let active: ProviderConnectionAttemptToken | undefined

  function owns(token: ProviderConnectionAttemptToken): boolean {
    return active?.revision === token.revision
  }

  return {
    begin(accountId) {
      if (active) {
        return undefined
      }
      const token = { accountId, revision: ++revision }
      active = token
      return token
    },
    cancel() {
      if (!active) {
        return false
      }
      revision += 1
      active = undefined
      return true
    },
    finish(token) {
      if (owns(token)) {
        active = undefined
      }
    },
    isCurrent(token, state) {
      return state === 'unlocked' && owns(token)
    },
  }
}
