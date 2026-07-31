/**
 * A publish/subscribe channel that never touches Vue's reactivity graph.
 *
 * High-frequency market data (price, latency, future depth metrics) must reach
 * the DOM without scheduling a render pass: an early version of this app let
 * the order book write into reactive state and it competed with the chart for
 * the renderer thread. Consumers of this channel resolve their DOM node once
 * and write to it directly.
 *
 * Subscribers are indexed by key, so a publication costs only the listeners of
 * that key — not a scan of every listener in the application.
 */
export interface ImperativeChannel<T> {
  publish(key: string, value: T): void
  subscribe(key: string, callback: (value: T) => void): () => void
  /** Last published value, for a subscriber that mounts mid-stream. */
  peek(key: string): T | undefined
  /** Drops the retained value so a restarting session cannot show stale data. */
  reset(key: string): void
}

export function createImperativeChannel<T>(): ImperativeChannel<T> {
  const subscribers = new Map<string, Set<(value: T) => void>>()
  const latest = new Map<string, T>()

  return {
    publish(key, value) {
      latest.set(key, value)
      // Iterated without copying: allocating a snapshot array here would run
      // on every frame. Deleting from a Set during iteration is safe.
      subscribers.get(key)?.forEach((callback) => callback(value))
    },

    subscribe(key, callback) {
      let keySubscribers = subscribers.get(key)
      if (!keySubscribers) {
        keySubscribers = new Set()
        subscribers.set(key, keySubscribers)
      }
      keySubscribers.add(callback)

      const retained = latest.get(key)
      if (retained !== undefined) {
        callback(retained)
      }

      return () => {
        const current = subscribers.get(key)
        if (!current) {
          return
        }
        current.delete(callback)
        if (current.size === 0) {
          subscribers.delete(key)
        }
      }
    },

    peek(key) {
      return latest.get(key)
    },

    reset(key) {
      latest.delete(key)
    },
  }
}
