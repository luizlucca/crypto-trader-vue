/**
 * Free-form drawings an indicator produces instead of, or besides, a series.
 *
 * Part of the catalog does not express itself as values over time: the Zig Zag
 * is a chain of segments between pivots, the volume profile is a column of
 * boxes, the key levels are horizontal lines with a price tag. None of that
 * fits `setData`, and it was the reason those indicators drew nothing.
 *
 * The shapes are anchored in chart coordinates — time and price — never in
 * pixels. Converting to pixels is the renderer's job, once per frame, so a
 * zoom or a pan does not require recalculating the indicator.
 */

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted'

/** A segment between two points, optionally projected past its endpoints. */
export interface IndicatorLine {
  time1: number
  price1: number
  time2: number
  price2: number
  color: string
  width: number
  style: DrawingLineStyle
  extend?: 'left' | 'right' | 'both'
}

/** A rectangle between two corners, with an optional caption inside. */
export interface IndicatorBox {
  time1: number
  price1: number
  time2: number
  price2: number
  bgColor: string
  borderColor?: string
  borderWidth?: number
  borderStyle?: DrawingLineStyle
  text?: string
  textColor?: string
}

/**
 * Text anchored at a point. `style` says which side of the anchor the text
 * sits on, following the catalog's own naming.
 */
export interface IndicatorLabel {
  time: number
  price: number
  text: string
  /** Background pill; absent means text only. */
  color?: string
  textColor: string
  style: 'label_up' | 'label_down' | 'label_left' | 'label_right' | 'label_center'
  size?: 'tiny' | 'small' | 'normal' | 'large'
}

/**
 * A vertical band covering a run of bars, painted behind everything else.
 *
 * The catalog emits one colour per bar; contiguous bars of the same colour are
 * merged before they leave the worker, so the renderer draws a handful of
 * rectangles instead of one per bar on every frame.
 */
export interface IndicatorBand {
  time1: number
  time2: number
  color: string
}

export interface IndicatorDrawings {
  lines: IndicatorLine[]
  boxes: IndicatorBox[]
  labels: IndicatorLabel[]
  bands: IndicatorBand[]
}

export const EMPTY_DRAWINGS: IndicatorDrawings = {
  lines: [],
  boxes: [],
  labels: [],
  bands: [],
}

export function hasDrawings(drawings: IndicatorDrawings | undefined): boolean {
  return (
    (drawings?.lines.length ?? 0)
    + (drawings?.boxes.length ?? 0)
    + (drawings?.labels.length ?? 0)
    + (drawings?.bands.length ?? 0)
  ) > 0
}
