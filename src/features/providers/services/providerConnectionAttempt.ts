import type { SecurityState } from '@shared/contracts/security'

export interface ProviderConnectionAttemptToken {
  accountId: string
  revision: number
}

export interface ProviderConnectionAttemptOptions {
  disconnect?(): Promise<void>
}

export interface ProviderConnectionAttempt {
  begin(accountId: string): ProviderConnectionAttemptToken | undefined
  invalidate(): boolean
  cancel(): boolean
  finish(token: ProviderConnectionAttemptToken): void
  isCurrent(
    token: ProviderConnectionAttemptToken,
    state: SecurityState,
  ): boolean
  waitForDisconnect(): Promise<void>
}

export function createProviderConnectionAttempt(
  options: ProviderConnectionAttemptOptions = {},
): ProviderConnectionAttempt {
  let revision = 0
  let active: ProviderConnectionAttemptToken | undefined
  let pendingDisconnect: Promise<void> | undefined

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
    invalidate() {
      if (!active) {
        return false
      }
      revision += 1
      active = undefined
      return true
    },
    cancel() {
      const invalidated = this.invalidate()
      if (!invalidated || !options.disconnect) {
        return invalidated
      }
      const disconnect = options.disconnect().catch(() => undefined)
      pendingDisconnect = disconnect
      void disconnect.finally(() => {
        if (pendingDisconnect === disconnect) {
          pendingDisconnect = undefined
        }
      })
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
    waitForDisconnect() {
      return pendingDisconnect ?? Promise.resolve()
    },
  }
}
