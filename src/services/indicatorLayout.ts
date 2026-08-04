import { copyPlotStyles, type IndicatorInstance } from '@/domain/indicators'

/**
 * Indicators applied per session, held outside the chart component.
 *
 * The chart is a keyed component: changing pair or interval recreates it, and
 * its `onBeforeUnmount` tears the indicators down with it. Keeping the layout
 * here means the chart can restore what the tab had after being rebuilt —
 * switching from 1h to 4h is a change of view, not a request to drop the
 * analysis on screen.
 *
 * Deliberately not reactive: it is read on mount and written on user actions,
 * never on the data path.
 */
const layouts = new Map<string, IndicatorInstance[]>()

export function readIndicatorLayout(sessionId: string): IndicatorInstance[] {
  return layouts.get(sessionId) ?? []
}

export function writeIndicatorLayout(
  sessionId: string,
  instances: readonly IndicatorInstance[],
): void {
  if (instances.length === 0) {
    layouts.delete(sessionId)
    return
  }
  // Stored as plain copies so later edits cannot mutate the saved layout.
  layouts.set(sessionId, instances.map((instance) => ({
    instanceId: instance.instanceId,
    definitionId: instance.definitionId,
    inputs: { ...instance.inputs },
    styles: copyPlotStyles(instance.styles),
  })))
}

/** Called when a tab closes; its layout can never be restored again. */
export function dropIndicatorLayout(sessionId: string): void {
  layouts.delete(sessionId)
}
