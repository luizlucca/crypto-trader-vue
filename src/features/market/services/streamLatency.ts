import {
  createImperativeChannel,
} from '@renderer-shared/services/imperativeChannel'

/**
 * Order-book latency, keyed by session (tab).
 *
 * This used to travel as a Vue emit into `WorkspaceTab.latency`. Because the
 * tab list is deeply reactive and the workspace footer reads that field, every
 * sample scheduled a full render pass of the component that hosts the chart —
 * the order book reaching into the chart's work again, just at 2 Hz instead of
 * 60 Hz. The value now goes straight to the DOM node that displays it.
 */
const channel = createImperativeChannel<number>()

export function publishStreamLatency(
  sessionId: string,
  milliseconds: number,
): void {
  if (!Number.isFinite(milliseconds)) {
    return
  }
  channel.publish(sessionId, Math.max(0, Math.round(milliseconds)))
}

export function subscribeStreamLatency(
  sessionId: string,
  callback: (milliseconds: number) => void,
): () => void {
  return channel.subscribe(sessionId, callback)
}

/** A restarting or closing session must not leave a stale reading behind. */
export function resetStreamLatency(sessionId: string): void {
  channel.reset(sessionId)
}
