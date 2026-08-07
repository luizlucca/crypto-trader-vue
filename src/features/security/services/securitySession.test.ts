import { describe, expect, it, vi } from 'vitest'
import type {
  DesktopSecurityAPI,
  SecurityRequest,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { createSecuritySession } from './securitySession'

const lockedSnapshot: SecuritySnapshot = {
  state: 'locked',
  hasVault: true,
  accounts: [],
  preferences: {
    lockOnMinimize: true,
    lockOnSuspend: true,
    idleTimeoutMinutes: 15,
    closeAction: 'quit-and-lock',
  },
}

function createAPI(): DesktopSecurityAPI & {
  emit(snapshot: SecuritySnapshot): void
  listenerCount(): number
} {
  let listener: ((snapshot: SecuritySnapshot) => void) | undefined
  return {
    getSnapshot: vi.fn().mockResolvedValue(lockedSnapshot),
    request: vi.fn().mockResolvedValue(lockedSnapshot),
    onState: vi.fn((callback) => {
      listener = callback
      return () => {
        listener = undefined
      }
    }),
    emit(snapshot) {
      listener?.(snapshot)
    },
    listenerCount: () => Number(listener !== undefined),
  }
}

describe('createSecuritySession', () => {
  it('owns one desktop subscription and releases it on stop', async () => {
    const api = createAPI()
    const session = createSecuritySession(api)

    const firstStop = session.start()
    const secondStop = session.start()
    await vi.waitFor(() => expect(api.getSnapshot).toHaveBeenCalledOnce())

    expect(api.onState).toHaveBeenCalledOnce()
    expect(api.listenerCount()).toBe(1)
    firstStop()
    expect(api.listenerCount()).toBe(0)
    secondStop()
  })

  it('clones commands, stores snapshots and reacts to lock events', async () => {
    const api = createAPI()
    const session = createSecuritySession(api)
    const request = {
      kind: 'unlock',
      password: 'Abcdef1!',
    } satisfies SecurityRequest

    await session.request(request)
    api.emit({ ...lockedSnapshot, state: 'locked', accounts: [] })

    expect(api.request).toHaveBeenCalledWith({
      kind: 'unlock',
      password: 'Abcdef1!',
    })
    expect(session.snapshot.value).toEqual(lockedSnapshot)
    expect(session.snapshot.value.accounts).not.toContainEqual(
      expect.objectContaining({ apiSecret: expect.anything() }),
    )
  })
})
