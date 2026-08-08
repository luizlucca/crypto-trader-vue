import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every door into a connection must ask the gate.
 *
 * This is a structural test rather than a behavioural one because the bug it
 * guards against is structural: the check existed and was correct, and the
 * provider settings panel simply did not consult it. Alternating accounts
 * there connected each one while the chart stayed on the venue it started on.
 *
 * A behavioural test only covers the doors someone remembered to write one
 * for — which is the same gap. This one fails when a new sender appears.
 */

const SOURCE_ROOT = new URL('../../../', import.meta.url).pathname

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return sourceFiles(path)
    }
    return /\.(ts|vue)$/.test(entry) && !entry.includes('.test.')
      ? [path]
      : []
  })
}

/** Sends the IPC request, as opposed to merely naming it in a type. */
function sendsConnectRequest(source: string): boolean {
  return source.includes("kind: 'connect-account'")
    && /\.request\(/.test(source)
}

describe('doors into a provider connection', () => {
  const senders = sourceFiles(SOURCE_ROOT)
    .filter((path) => sendsConnectRequest(readFileSync(path, 'utf8')))

  it('finds the senders, so the check below is not vacuous', () => {
    expect(senders.length).toBeGreaterThan(0)
  })

  it.each(senders)('%s consults the connection gate', (path) => {
    const source = readFileSync(path, 'utf8')
    /*
     * `switchEnvironment` is the one exception, and it is not an exception to
     * the rule: it runs only after the gate raised the switch and the operator
     * confirmed it, so asking again would block the switch it exists to do.
     */
    const gated = source.includes('connectionGate')
      || source.includes('switchEnvironment')
    expect(gated).toBe(true)
  })
})
