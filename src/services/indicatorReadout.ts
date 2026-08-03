/** A plot value sink owned by the currently-mounted legend. */
export type IndicatorReadoutSubscriber = (
  plotId: string,
  text: string,
) => void

/**
 * Indicator values under the cursor, keyed by instance and plot.
 *
 * A generic reactive payload would allocate an array of objects and schedule a
 * Vue render for every pointer pixel. This specialised channel passes the plot
 * id and formatted text directly to a cached DOM node instead. It also retains
 * the last value of each plot so a legend can mount after the cursor stops.
 */
const subscribers = new Map<
  string,
  Set<IndicatorReadoutSubscriber>
>()
const latest = new Map<string, Map<string, string>>()

export function publishIndicatorReadout(
  instanceId: string,
  plotId: string,
  text: string,
): void {
  let instanceValues = latest.get(instanceId)
  if (!instanceValues) {
    instanceValues = new Map()
    latest.set(instanceId, instanceValues)
  }
  if (instanceValues.get(plotId) === text) {
    return
  }
  instanceValues.set(plotId, text)
  subscribers.get(instanceId)?.forEach((subscriber) => {
    subscriber(plotId, text)
  })
}

export function subscribeIndicatorReadout(
  instanceId: string,
  subscriber: IndicatorReadoutSubscriber,
): () => void {
  let instanceSubscribers = subscribers.get(instanceId)
  if (!instanceSubscribers) {
    instanceSubscribers = new Set()
    subscribers.set(instanceId, instanceSubscribers)
  }
  instanceSubscribers.add(subscriber)
  latest.get(instanceId)?.forEach((text, plotId) => {
    subscriber(plotId, text)
  })

  return () => {
    const current = subscribers.get(instanceId)
    current?.delete(subscriber)
    if (current?.size === 0) {
      subscribers.delete(instanceId)
    }
  }
}

export function peekIndicatorReadout(
  instanceId: string,
  plotId: string,
): string | undefined {
  return latest.get(instanceId)?.get(plotId)
}

/** Clears retained and visible values when an indicator is reset or removed. */
export function resetIndicatorReadout(instanceId: string): void {
  const instanceValues = latest.get(instanceId)
  if (instanceValues) {
    const instanceSubscribers = subscribers.get(instanceId)
    if (instanceSubscribers) {
      instanceValues.forEach((_text, plotId) => {
        instanceSubscribers.forEach((subscriber) => {
          subscriber(plotId, '')
        })
      })
    }
  }
  latest.delete(instanceId)
}
