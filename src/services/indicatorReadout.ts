import { createImperativeChannel } from './imperativeChannel'

/**
 * Indicator values under the cursor, keyed by instance.
 *
 * Reading a line off the chart is guesswork; the number is what a decision is
 * made on. It travels here instead of through props for the same reason the
 * order-book latency does: the crosshair fires on every pointer move, and
 * routing that through Vue would schedule a render pass per mouse pixel —
 * the exact competition with the chart that ADR-0003 exists to prevent.
 *
 * The formatted string is produced once, where the plot definitions are known,
 * and the subscriber only writes it into the node it owns.
 */
const channel = createImperativeChannel<string>()

export function publishIndicatorReadout(
  instanceId: string,
  text: string,
): void {
  channel.publish(instanceId, text)
}

export function subscribeIndicatorReadout(
  instanceId: string,
  callback: (text: string) => void,
): () => void {
  return channel.subscribe(instanceId, callback)
}

/** Last value published, for a legend that mounts while the cursor is still. */
export function peekIndicatorReadout(instanceId: string): string | undefined {
  return channel.peek(instanceId)
}

/** Called when an indicator leaves the chart; its readout must not linger. */
export function resetIndicatorReadout(instanceId: string): void {
  channel.reset(instanceId)
}
