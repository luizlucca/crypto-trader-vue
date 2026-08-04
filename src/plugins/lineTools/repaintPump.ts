import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'

/**
 * Carries the chart's repaint signal for primitives that do not take it.
 *
 * Lightweight Charts hands `requestUpdate` to a primitive through `attached()`.
 * The vendored line tools never implement that hook — upstream did not need it,
 * because their manager extends `PluginBase`, which holds the signal and
 * repaints on every mutation. Dropping that manager (on purpose, see
 * `README.md`) dropped the signal with it, and a drawing then waited for
 * whatever repainted the chart next: a tick, a pointer move, seconds of
 * nothing on a quiet market.
 *
 * This is the smallest possible way back: a primitive that draws nothing and
 * exists only to hold `requestUpdate`, so the manager can ask for a frame the
 * moment a shape is added, moved or removed.
 *
 * The request is **deferred to the next frame, and coalesced**. Calling
 * `requestUpdate` synchronously from inside a crosshair handler re-enters:
 * the repaint recomputes the crosshair, which emits the event again, which
 * asks for another repaint. Measured, it never returned — every pointer event
 * hit the 5 s input timeout while the preview line was being dragged.
 */
export class RepaintPump implements ISeriesPrimitive<Time> {
  private requestUpdate: (() => void) | undefined
  private frame = 0

  attached(param: SeriesAttachedParameter<Time>): void {
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.cancel()
    this.requestUpdate = undefined
  }

  /** Asks for one frame. Safe to call per pointer move: extra calls coalesce. */
  request(): void {
    if (this.frame !== 0 || !this.requestUpdate) {
      return
    }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.requestUpdate?.()
    })
  }

  cancel(): void {
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame)
      this.frame = 0
    }
  }
}
