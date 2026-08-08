import { describe, expect, it } from 'vitest'
import type { ProviderAccountSummary } from '@shared/contracts/security'
import type { MarketEnvironment } from '@shared/types/market'
import { createConnectionGate } from './connectionGate'

function account(
  accountId: string,
  environment: MarketEnvironment,
  markets: ProviderAccountSummary['markets'] = ['futures'],
): ProviderAccountSummary {
  return {
    accountId,
    provider: 'binance',
    environment,
    label: accountId,
    markets,
    apiKeySuffix: '••••1234',
    connection: 'disconnected',
  }
}

const accounts = [
  account('ProdAccountRead', 'live', ['spot', 'futures']),
  account('TesteNew', 'test'),
  account('TesteSpot', 'test', ['spot']),
]

describe('connection gate', () => {
  it('lets an account of the venue already shown through', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('live')

    expect(gate.mayConnect('ProdAccountRead', accounts)).toBe(true)
    expect(gate.pendingSwitch.value).toBeUndefined()
  })

  /*
   * The reported bug, from the door it came through. Alternating between the
   * two accounts in the provider settings panel connected each one and left
   * the chart on whichever venue it started on — no rebuild, and no badge to
   * say the prices were from the other exchange.
   */
  it('stops an account from another venue and raises the switch instead', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('live')

    expect(gate.mayConnect('TesteNew', accounts)).toBe(false)
    expect(gate.pendingSwitch.value?.accountId).toBe('TesteNew')
  })

  it('stops the return trip just the same', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('test')

    expect(gate.mayConnect('ProdAccountRead', accounts)).toBe(false)
    expect(gate.pendingSwitch.value?.environment).toBe('live')
  })

  /*
   * Two test accounts differ by market, not by venue. Swapping between them
   * changes which credential is validated and nothing about where the candles
   * come from, so it must not cost the operator their workspace.
   */
  it('lets two accounts of the same venue swap freely', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('test')

    expect(gate.mayConnect('TesteNew', accounts)).toBe(true)
    expect(gate.mayConnect('TesteSpot', accounts)).toBe(true)
    expect(gate.pendingSwitch.value).toBeUndefined()
  })

  it('follows the workspace, not the connected account', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('live')
    expect(gate.mayConnect('TesteNew', accounts)).toBe(false)

    // The rebuild has happened; the same account is now local.
    gate.clearPendingSwitch()
    gate.followWorkspace('test')

    expect(gate.mayConnect('TesteNew', accounts)).toBe(true)
  })

  it('clears the pending switch when the operator cancels', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('live')
    gate.mayConnect('TesteNew', accounts)

    gate.clearPendingSwitch()

    expect(gate.pendingSwitch.value).toBeUndefined()
  })

  it('starts on production before any workspace reports in', () => {
    const gate = createConnectionGate()

    expect(gate.workspaceEnvironment.value).toBe('live')
    expect(gate.mayConnect('TesteNew', accounts)).toBe(false)
  })

  /*
   * An unknown id is the account being removed while the picker was open. The
   * connect attempt has its own guard for that; raising a switch here would
   * put a confirmation in front of something that cannot happen.
   */
  it('treats an account that no longer exists as nothing to switch to', () => {
    const gate = createConnectionGate()
    gate.followWorkspace('live')

    expect(gate.mayConnect('apagada', accounts)).toBe(true)
    // The very id that diverges against the real list, against an empty one.
    expect(gate.mayConnect('TesteNew', [])).toBe(true)
    expect(gate.pendingSwitch.value).toBeUndefined()
  })
})
