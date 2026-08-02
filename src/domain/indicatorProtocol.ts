import type { IndicatorDefinition, IndicatorInputs } from './indicators'

/**
 * Messages exchanged with the indicator worker.
 *
 * Bars live in the worker, not in the messages. The chart sends the full
 * history once and then a single bar per tick, so the drawing thread allocates
 * nothing per tick and the worker keeps the array the library consumes instead
 * of rebuilding it on every calculation.
 *
 * The full history travels as parallel `Float64Array`s: transferable, so
 * crossing threads costs no copy.
 */

export interface IndicatorBarsPayload {
  /** Seconds, matching the chart's `UTCTimestamp`. */
  time: Float64Array
  open: Float64Array
  high: Float64Array
  low: Float64Array
  close: Float64Array
  volume: Float64Array
}

/** A single bar, sent as plain numbers to avoid allocating on the hot path. */
export interface IndicatorBar {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type IndicatorRequest
  = | { kind: 'catalog' }
    | {
      kind: 'attach'
      instanceId: string
      /** Monotonic per instance; rejects results from older configurations. */
      instanceRevision: number
      definitionId: string
      inputs: IndicatorInputs
    }
    | {
      kind: 'detach'
      instanceId: string
      /** A delayed detach must not remove a newer incarnation of the instance. */
      instanceRevision: number
    }
  /** Replaces the retained history: first load or a new page of older bars. */
    | { kind: 'bars-replace', bars: IndicatorBarsPayload }
  /** Appends, or replaces when the time matches the bar still forming. */
    | { kind: 'bars-tail', bar: IndicatorBar }
    | {
      kind: 'compute'
      /** Discards results whose generation is no longer the newest. */
      generation: number
      /** Identifies this exact round inside a generation. */
      roundId: number
      /** Forces a full result even if a diff would be enough. */
      full: boolean
    }

/**
 * A plot update. `from` is the index of the first changed point, so the chart
 * can `update()` only the tail when nothing older moved.
 */
export interface IndicatorPlotPatch {
  plotId: string
  /** True when the whole series must be replaced via `setData`. */
  full: boolean
  from: number
  time: Float64Array
  value: Float64Array
}

/**
 * An OHLC output of the indicator itself, not of the market.
 *
 * Part of the catalog is defined as candles rather than lines — the CVD, the
 * volume delta, the Heikin-Ashi variants — exactly as they appear on
 * TradingView. They are a separate patch because a candle carries four values
 * and its own colours, which the single-value plot patch cannot express.
 *
 * Colours travel as a palette plus one index per bar: a series is painted with
 * two or three distinct colours, so sending the string per bar would be the
 * largest part of the message on the hot path.
 */
export interface IndicatorCandlePatch {
  plotId: string
  full: boolean
  from: number
  time: Float64Array
  open: Float64Array
  high: Float64Array
  low: Float64Array
  close: Float64Array
  /** One entry per point; empty when the indicator sent no colours. */
  colorIndex: Uint8Array
  palette: { color: string, borderColor: string, wickColor: string }[]
}

/**
 * A marker drawn on the candle series. Forty indicators — every candlestick
 * pattern, the fractals — express themselves only this way and drew nothing
 * while markers were ignored.
 */
export interface IndicatorMarker {
  time: number
  position: 'aboveBar' | 'belowBar' | 'inBar'
  shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
  color: string
  size?: number
  text?: string
}

export type IndicatorResponse
  = | { kind: 'catalog', definitions: IndicatorDefinition[] }
  /**
   * Always sent once per `compute`, after any `result`. A calculation where
   * nothing changed produces no result at all, so without this the client
   * could never tell "still running" from "finished with no changes" — and
   * would wait forever, dropping every later recalculation.
   */
    | { kind: 'computed', generation: number, roundId: number }
    | {
      kind: 'result'
      generation: number
      roundId: number
      instanceId: string
      instanceRevision: number
      patches: IndicatorPlotPatch[]
      /** Present only when the marker set changed. */
      markers?: IndicatorMarker[]
      /** Present only for indicators that draw their own candles. */
      candles?: IndicatorCandlePatch[]
    }
    | {
      kind: 'error'
      generation: number
      roundId: number
      instanceId?: string
      instanceRevision?: number
      message: string
    }
  /**
   * A complete calculation that produced nothing drawable. Sent instead of an
   * empty result so the interface can explain the blank pane instead of
   * leaving it looking like a failure.
   *
   * `outputs` carries the raw keys the library did fill and this pipeline does
   * not draw — `plotCandles`, `boxes`, `lines`. Empty means the indicator
   * simply returned no points: usually a period longer than the history.
   */
    | {
      kind: 'no-output'
      generation: number
      roundId: number
      instanceId: string
      instanceRevision: number
      outputs: string[]
    }
