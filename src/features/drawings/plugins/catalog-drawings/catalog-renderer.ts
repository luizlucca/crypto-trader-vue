import type {
  CatalogDrawingToolId,
  DrawingLevel,
} from '@drawings/domain/chartDrawings'
import type { TextAppearance } from '@renderer-shared/domain/textAppearance'
import {
  DEFAULT_TEXT_APPEARANCE,
  DEFAULT_TEXT_BACKGROUND_COLOR,
  textBoxHeight,
  textCanvasFont,
} from '@renderer-shared/domain/textAppearance'
import type { LogicalPoint } from '@drawings/plugins/line-tools/base-types'

export interface ViewPoint {
  x: number
  y: number
}

const GANN_RATIOS = [0.125, 0.25, 0.333, 0.5, 1, 2, 3, 4, 8]
const AUXILIARY_LEVEL_COLORS = [
  '#ef5350',
  '#ff9800',
  '#fdd835',
  '#66bb6a',
  '#26a69a',
  '#42a5f5',
  '#7e57c2',
]

export interface CatalogRenderOptions {
  levels: readonly DrawingLevel[]
  text: string
  textAppearance: TextAppearance
  textBackgroundColor: string
}

export function drawTool(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  tool: CatalogDrawingToolId,
  points: readonly ViewPoint[],
  logicalPoints: readonly LogicalPoint[],
  options: CatalogRenderOptions,
): void {
  const [p1] = points
  if (!p1) {
    return
  }
  // The domain guarantees the real anchor count. Falling back here keeps a
  // half-built preview drawable without spreading `undefined` through every
  // geometry function.
  const p2 = points[1] ?? p1
  const p3 = points[2] ?? p2
  const p4 = points[3] ?? p3
  switch (tool) {
    case 'ray':
      drawExtended(context, p1, p2, size, false, true)
      return
    case 'arrow':
      line(context, p1, p2)
      arrowHead(context, p1, p2)
      return
    case 'extended-line':
      drawExtended(context, p1, p2, size, true, true)
      return
    case 'info-line':
      line(context, p1, p2)
      drawInfoLabel(context, p1, p2, logicalPoints)
      return
    case 'trend-angle':
      line(context, p1, p2)
      label(context, p2.x + 6, p2.y - 8, `${angle(p1, p2)}°`)
      return
    case 'regression-trend':
      drawRegression(context, p1, p2)
      return
    case 'flat-top-bottom':
      line(context, p1, { x: p3.x, y: p1.y })
      line(context, p2, p3)
      line(context, p1, p2)
      return
    case 'disjoint-channel':
      line(context, p1, p2)
      line(context, p3, p4)
      return
    case 'andrews-pitchfork':
    case 'schiff-pitchfork':
    case 'modified-schiff-pitchfork':
    case 'inside-pitchfork':
      drawPitchfork(context, size, tool, p1, p2, p3)
      return
    case 'fib-channel':
      drawFibChannel(context, p1, p2, p3, options.levels)
      return
    case 'fib-time-zone':
      drawFibTimes(context, size, p1.x, p2.x, options.levels)
      return
    case 'fib-speed-fan':
      drawFibFan(context, size, p1, p2, options.levels)
      return
    case 'fib-time-extension':
      drawFibTimes(
        context,
        size,
        p3.x,
        p3.x + p2.x - p1.x,
        options.levels,
      )
      return
    case 'fib-circles':
      drawFibCircles(context, p1, p2, false, options.levels)
      return
    case 'fib-spiral':
      drawFibSpiral(context, p1, p2)
      return
    case 'fib-arcs':
      drawFibCircles(context, p1, p2, true, options.levels)
      return
    case 'fib-wedge':
      drawFibWedge(context, p1, p2, p3, options.levels)
      return
    case 'pitchfan':
      drawPitchfan(context, size, p1, p2, p3, options.levels)
      return
    case 'gann-box':
    case 'gann-square':
      drawGannBox(context, p1, p2)
      return
    case 'gann-fan':
      drawGannFan(context, size, p1, p2)
      return
    case 'gann-square-fixed':
      drawGannBox(
        context,
        { x: p1.x - 60, y: p1.y - 60 },
        { x: p1.x + 60, y: p1.y + 60 },
      )
      return
    case 'rotated-rectangle':
      drawRotatedRectangle(context, p1, p2, p3)
      return
    case 'ellipse':
      drawEllipse(context, p1, p2)
      return
    case 'arc':
      bezier(context, p1, p2, p2, p3)
      return
    case 'path':
      drawPath(context, p1, p2)
      return
    case 'polyline':
      polygon(context, points, false)
      return
    case 'curve':
      bezier(context, p1, p2, p3, p4)
      return
    case 'double-curve':
      quadratic(context, p1, p2, p3)
      quadratic(context, p1, mirror(p2, midpoint(p1, p3)), p3)
      return
    case 'forecast':
      drawForecast(context, p1, p2)
      return
    case 'projection':
      drawProjection(context, p1, p2, p3, false)
      return
    case 'bars-pattern':
      drawProjection(context, p1, p2, p3, true)
      return
    case 'text-annotation':
      textLabel(context, p1.x, p1.y, options)
      return
    case 'callout':
      line(context, p1, p2)
      arrowHead(context, p2, p1)
      textLabel(context, p2.x, p2.y, options)
      return
    case 'anchored-text':
      line(context, p1, p2)
      textLabel(context, p2.x, p2.y, options)
      return
    case 'note':
      drawMarker(context, p1, 'N', 'square')
      markerLabel(context, p1, options)
      return
    case 'price-note':
      line(context, { x: 0, y: p1.y }, p1)
      labelWithPrice(
        context,
        p1,
        options.text,
        logicalPoints[0]?.price,
        options.textAppearance,
        options.textBackgroundColor,
      )
      return
    case 'price-label':
      labelWithPrice(
        context,
        p1,
        options.text,
        logicalPoints[0]?.price,
        options.textAppearance,
        options.textBackgroundColor,
      )
      return
    case 'flag-mark':
      drawFlag(context, p1)
      markerLabel(context, p1, options)
      return
    case 'pin':
      drawPin(context, p1)
      markerLabel(context, p1, options)
      return
    case 'comment':
      drawMarker(context, p1, '…', 'bubble')
      markerLabel(context, p1, options)
      return
    case 'signpost':
      drawSignpost(context, p1)
      markerLabel(context, p1, options)
      return
    case 'table':
      drawTable(context, p1)
      markerLabel(context, p1, options)
      return
    case 'brush':
      drawStroke(context, p1, p2, 3, 1)
      return
    case 'highlighter':
      drawStroke(context, p1, p2, 12, 0.34)
      return
    case 'arrow-marker':
      drawMarker(context, p1, '↗', 'none')
      markerLabel(context, p1, options)
      return
    case 'arrow-mark-up':
      drawMarker(context, p1, '↑', 'none')
      markerLabel(context, p1, options)
      return
    case 'arrow-mark-down':
      drawMarker(context, p1, '↓', 'none')
      markerLabel(context, p1, options)
      return
    default:
      assertNever(tool)
  }
}

function line(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.lineTo(end.x, end.y)
  context.stroke()
}

function drawExtended(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  size: { width: number, height: number },
  extendLeft: boolean,
  extendRight: boolean,
): void {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length < 0.001) {
    return
  }
  const extent = (size.width + size.height) * 2
  const unit = { x: dx / length, y: dy / length }
  line(
    context,
    extendLeft
      ? { x: start.x - unit.x * extent, y: start.y - unit.y * extent }
      : start,
    extendRight
      ? { x: end.x + unit.x * extent, y: end.y + unit.y * extent }
      : end,
  )
}

function arrowHead(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  const direction = Math.atan2(end.y - start.y, end.x - start.x)
  const length = 10
  context.beginPath()
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(direction - Math.PI / 6),
    end.y - length * Math.sin(direction - Math.PI / 6),
  )
  context.moveTo(end.x, end.y)
  context.lineTo(
    end.x - length * Math.cos(direction + Math.PI / 6),
    end.y - length * Math.sin(direction + Math.PI / 6),
  )
  context.stroke()
}

function drawInfoLabel(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  points: readonly LogicalPoint[],
): void {
  const first = points[0]
  const last = points[1]
  const change = first && last && first.price !== 0
    ? ((last.price - first.price) / first.price) * 100
    : 0
  const bars = first && last
    ? Math.abs(last.logical - first.logical).toFixed(1)
    : '0'
  label(
    context,
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    `${change >= 0 ? '+' : ''}${change.toFixed(2)}% · ${bars} barras`,
  )
}

function angle(start: ViewPoint, end: ViewPoint): string {
  return (-Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI)
    .toFixed(1)
}

function drawRegression(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.max(1, Math.hypot(dx, dy))
  const offset = Math.max(10, length * 0.1)
  const normal = { x: -dy / length * offset, y: dx / length * offset }
  context.save()
  context.globalAlpha = 0.7
  line(context, add(start, normal), add(end, normal))
  line(context, subtract(start, normal), subtract(end, normal))
  context.restore()
  line(context, start, end)
}

function drawPitchfork(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  tool: 'andrews-pitchfork' | 'schiff-pitchfork'
    | 'modified-schiff-pitchfork' | 'inside-pitchfork',
  pivot: ViewPoint,
  upper: ViewPoint,
  lower: ViewPoint,
): void {
  let origin = pivot
  if (tool === 'schiff-pitchfork') {
    origin = midpoint(pivot, upper)
  } else if (tool === 'modified-schiff-pitchfork') {
    origin = { x: (pivot.x + upper.x) / 2, y: pivot.y }
  }
  const middle = midpoint(upper, lower)
  const vector = subtract(middle, origin)
  const upperStart = tool === 'inside-pitchfork'
    ? midpoint(upper, middle)
    : upper
  const lowerStart = tool === 'inside-pitchfork'
    ? midpoint(lower, middle)
    : lower
  drawExtended(context, origin, middle, size, false, true)
  drawExtended(context, upperStart, add(upperStart, vector), size, false, true)
  drawExtended(context, lowerStart, add(lowerStart, vector), size, false, true)
}

function drawFibChannel(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  offsetPoint: ViewPoint,
  levels: readonly DrawingLevel[],
): void {
  const offset = subtract(offsetPoint, start)
  levels.forEach((level) => {
    context.save()
    context.strokeStyle = level.color
    const delta = scale(offset, level.value)
    line(context, add(start, delta), add(end, delta))
    context.restore()
  })
}

function drawFibTimes(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  originX: number,
  referenceX: number,
  levels: readonly DrawingLevel[],
): void {
  const span = referenceX - originX
  levels.forEach((level) => {
    const x = originX + span * level.value
    context.save()
    context.strokeStyle = level.color
    context.globalAlpha = 0.82
    line(context, { x, y: 0 }, { x, y: size.height })
    label(context, x + 3, 14, String(level.value))
    context.restore()
  })
}

function drawFibFan(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  origin: ViewPoint,
  reference: ViewPoint,
  levels: readonly DrawingLevel[],
): void {
  levels.forEach((level) => {
    if (level.value === 0 || level.value === 1) {
      return
    }
    context.save()
    context.strokeStyle = level.color
    const target = {
      x: reference.x,
      y: origin.y + (reference.y - origin.y) * level.value,
    }
    drawExtended(context, origin, target, size, false, true)
    context.restore()
  })
}

function drawFibCircles(
  context: CanvasRenderingContext2D,
  center: ViewPoint,
  edge: ViewPoint,
  arcsOnly: boolean,
  levels: readonly DrawingLevel[],
): void {
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y)
  levels.forEach((level) => {
    if (level.value === 0) {
      return
    }
    context.save()
    context.strokeStyle = level.color
    context.beginPath()
    context.arc(
      center.x,
      center.y,
      radius * level.value,
      arcsOnly ? Math.PI : 0,
      arcsOnly ? Math.PI * 2 : Math.PI * 2,
    )
    context.stroke()
    context.restore()
  })
}

function drawFibSpiral(
  context: CanvasRenderingContext2D,
  center: ViewPoint,
  edge: ViewPoint,
): void {
  const baseRadius = Math.max(
    2,
    Math.hypot(edge.x - center.x, edge.y - center.y),
  )
  const startAngle = Math.atan2(edge.y - center.y, edge.x - center.x)
  context.beginPath()
  for (let step = 0; step <= 96; step += 1) {
    const theta = step / 96 * Math.PI * 4
    const radius = baseRadius * 0.08 * Math.exp(0.19 * theta)
    const point = {
      x: center.x + Math.cos(startAngle + theta) * radius,
      y: center.y + Math.sin(startAngle + theta) * radius,
    }
    if (step === 0) {
      context.moveTo(point.x, point.y)
    } else {
      context.lineTo(point.x, point.y)
    }
  }
  context.stroke()
}

function drawFibWedge(
  context: CanvasRenderingContext2D,
  pivot: ViewPoint,
  edge1: ViewPoint,
  edge2: ViewPoint,
  levels: readonly DrawingLevel[],
): void {
  line(context, pivot, edge1)
  line(context, pivot, edge2)
  const start = Math.atan2(edge1.y - pivot.y, edge1.x - pivot.x)
  const end = Math.atan2(edge2.y - pivot.y, edge2.x - pivot.x)
  const radius = Math.max(
    Math.hypot(edge1.x - pivot.x, edge1.y - pivot.y),
    Math.hypot(edge2.x - pivot.x, edge2.y - pivot.y),
  )
  levels.forEach((level) => {
    if (level.value === 0) {
      return
    }
    context.save()
    context.strokeStyle = level.color
    context.beginPath()
    context.arc(pivot.x, pivot.y, radius * level.value, start, end)
    context.stroke()
    context.restore()
  })
}

function drawPitchfan(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  pivot: ViewPoint,
  start: ViewPoint,
  end: ViewPoint,
  levels: readonly DrawingLevel[],
): void {
  levels.forEach((level) => {
    const target = lerp(start, end, level.value)
    context.save()
    context.strokeStyle = level.color
    drawExtended(context, pivot, target, size, false, true)
    context.restore()
  })
}

function drawGannBox(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  const width = Math.abs(end.x - start.x)
  const height = Math.abs(end.y - start.y)
  context.save()
  context.globalAlpha = 0.12
  context.fillRect(left, top, width, height)
  context.restore()
  context.strokeRect(left, top, width, height)
  for (let part = 1; part < 4; part += 1) {
    const ratio = part / 4
    line(context, { x: left + width * ratio, y: top }, {
      x: left + width * ratio,
      y: top + height,
    })
    line(context, { x: left, y: top + height * ratio }, {
      x: left + width,
      y: top + height * ratio,
    })
  }
  line(context, { x: left, y: top }, { x: left + width, y: top + height })
  line(context, { x: left + width, y: top }, { x: left, y: top + height })
}

function drawGannFan(
  context: CanvasRenderingContext2D,
  size: { width: number, height: number },
  origin: ViewPoint,
  reference: ViewPoint,
): void {
  const dx = reference.x - origin.x
  const dy = reference.y - origin.y
  GANN_RATIOS.forEach((ratio, index) => {
    context.save()
    context.strokeStyle = AUXILIARY_LEVEL_COLORS[
      index % AUXILIARY_LEVEL_COLORS.length
    ]
    drawExtended(
      context,
      origin,
      { x: origin.x + dx, y: origin.y + dy * ratio },
      size,
      false,
      true,
    )
    context.restore()
  })
}

function drawRotatedRectangle(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  widthPoint: ViewPoint,
): void {
  const edge = subtract(end, start)
  const edgeLength = Math.max(1, Math.hypot(edge.x, edge.y))
  const normal = { x: -edge.y / edgeLength, y: edge.x / edgeLength }
  const width = dot(subtract(widthPoint, start), normal)
  const offset = scale(normal, width)
  polygon(context, [start, end, add(end, offset), add(start, offset)], true)
}

function drawEllipse(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  const center = midpoint(start, end)
  context.beginPath()
  context.ellipse(
    center.x,
    center.y,
    Math.abs(end.x - start.x) / 2,
    Math.abs(end.y - start.y) / 2,
    0,
    0,
    Math.PI * 2,
  )
  context.stroke()
}

function drawPath(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  const dx = end.x - start.x
  const control1 = { x: start.x + dx * 0.34, y: start.y }
  const control2 = { x: start.x + dx * 0.66, y: end.y }
  bezier(context, start, control1, control2, end)
}

function bezier(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  control1: ViewPoint,
  control2: ViewPoint,
  end: ViewPoint,
): void {
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.bezierCurveTo(
    control1.x,
    control1.y,
    control2.x,
    control2.y,
    end.x,
    end.y,
  )
  context.stroke()
}

function quadratic(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  control: ViewPoint,
  end: ViewPoint,
): void {
  context.beginPath()
  context.moveTo(start.x, start.y)
  context.quadraticCurveTo(control.x, control.y, end.x, end.y)
  context.stroke()
}

function drawForecast(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
): void {
  context.save()
  context.setLineDash([6, 5])
  line(context, start, end)
  arrowHead(context, start, end)
  context.globalAlpha = 0.25
  const spread = Math.max(12, Math.abs(end.y - start.y) * 0.2)
  polygon(context, [
    start,
    { x: end.x, y: end.y - spread },
    { x: end.x, y: end.y + spread },
  ], true)
  context.restore()
}

function drawProjection(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  target: ViewPoint,
  bars: boolean,
): void {
  const projected = add(target, subtract(end, start))
  line(context, start, end)
  context.save()
  context.setLineDash([5, 4])
  line(context, end, target)
  context.restore()
  if (bars) {
    const middle = midpoint(target, projected)
    const swing = Math.max(8, Math.abs(projected.y - target.y) * 0.3)
    polygon(context, [
      target,
      { x: (target.x + middle.x) / 2, y: middle.y - swing },
      middle,
      { x: (middle.x + projected.x) / 2, y: middle.y + swing },
      projected,
    ], false)
  } else {
    line(context, target, projected)
    arrowHead(context, target, projected)
  }
}

function label(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  appearance: TextAppearance = DEFAULT_TEXT_APPEARANCE,
  backgroundColor = DEFAULT_TEXT_BACKGROUND_COLOR,
): void {
  context.save()
  context.font = textCanvasFont(appearance)
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  const width = context.measureText(text).width + 12
  const height = textBoxHeight(appearance)
  context.fillStyle = backgroundColor
  context.beginPath()
  context.roundRect(x - 5, y - height / 2, width, height, 4)
  context.fill()
  context.stroke()
  context.fillStyle = appearance.color
  context.fillText(text, x + 1, y)
  context.restore()
}

function textLabel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  options: CatalogRenderOptions,
): void {
  label(
    context,
    x,
    y,
    options.text,
    options.textAppearance,
    options.textBackgroundColor,
  )
}

function markerLabel(
  context: CanvasRenderingContext2D,
  point: ViewPoint,
  options: CatalogRenderOptions,
): void {
  if (options.text.trim().length === 0) {
    return
  }
  textLabel(context, point.x + 18, point.y - 18, options)
}

function labelWithPrice(
  context: CanvasRenderingContext2D,
  point: ViewPoint,
  text: string,
  price: number | undefined,
  appearance: TextAppearance,
  backgroundColor: string,
): void {
  const prefix = text.trim()
  const value = formatPrice(price)
  label(
    context,
    point.x,
    point.y,
    prefix ? `${prefix} · ${value}` : value,
    appearance,
    backgroundColor,
  )
}

function drawMarker(
  context: CanvasRenderingContext2D,
  point: ViewPoint,
  text: string,
  shape: 'square' | 'bubble' | 'none',
): void {
  context.save()
  context.font = '700 17px Inter, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  if (shape !== 'none') {
    context.beginPath()
    if (shape === 'bubble') {
      context.arc(point.x, point.y, 13, 0, Math.PI * 2)
    } else {
      context.roundRect(point.x - 12, point.y - 12, 24, 24, 5)
    }
    context.fill()
    context.stroke()
  }
  context.fillStyle = context.strokeStyle
  context.fillText(text, point.x, point.y)
  context.restore()
}

function drawFlag(context: CanvasRenderingContext2D, point: ViewPoint): void {
  line(context, point, { x: point.x, y: point.y - 30 })
  polygon(context, [
    { x: point.x, y: point.y - 30 },
    { x: point.x + 22, y: point.y - 24 },
    { x: point.x, y: point.y - 17 },
  ], true)
}

function drawPin(context: CanvasRenderingContext2D, point: ViewPoint): void {
  context.beginPath()
  context.arc(point.x, point.y - 9, 7, 0, Math.PI * 2)
  context.stroke()
  line(context, { x: point.x, y: point.y - 2 }, point)
}

function drawSignpost(
  context: CanvasRenderingContext2D,
  point: ViewPoint,
): void {
  line(context, { x: point.x, y: point.y - 25 }, {
    x: point.x,
    y: point.y + 15,
  })
  context.strokeRect(point.x - 3, point.y - 24, 34, 14)
}

function drawTable(context: CanvasRenderingContext2D, point: ViewPoint): void {
  const left = point.x
  const top = point.y
  const width = 68
  const height = 42
  context.strokeRect(left, top, width, height)
  line(context, { x: left, y: top + 14 }, { x: left + width, y: top + 14 })
  line(context, { x: left, y: top + 28 }, { x: left + width, y: top + 28 })
  line(context, { x: left + 34, y: top }, { x: left + 34, y: top + height })
}

function drawStroke(
  context: CanvasRenderingContext2D,
  start: ViewPoint,
  end: ViewPoint,
  width: number,
  alpha: number,
): void {
  context.save()
  context.lineWidth = width
  context.globalAlpha = alpha
  line(context, start, end)
  context.restore()
}

function polygon(
  context: CanvasRenderingContext2D,
  points: readonly ViewPoint[],
  closed: boolean,
): void {
  if (points.length < 2) {
    return
  }
  context.beginPath()
  context.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y)
  }
  if (closed) {
    context.closePath()
    context.save()
    context.globalAlpha = 0.12
    context.fill()
    context.restore()
  }
  context.stroke()
}

export function drawHandles(
  context: CanvasRenderingContext2D,
  points: readonly ViewPoint[],
  color: string,
): void {
  context.save()
  context.fillStyle = '#ffffff'
  context.strokeStyle = color
  context.lineWidth = 2
  context.setLineDash([])
  for (const point of points) {
    context.beginPath()
    context.arc(point.x, point.y, 5, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }
  context.restore()
}

export function hitsDrawing(
  tool: CatalogDrawingToolId,
  target: ViewPoint,
  points: readonly ViewPoint[],
): boolean {
  const [first, second] = points
  if (!first) {
    return false
  }
  if (tool === 'gann-square-fixed') {
    return pointInBounds(target, {
      left: first.x - 60,
      right: first.x + 60,
      top: first.y - 60,
      bottom: first.y + 60,
    })
  }
  if (!second) {
    return Math.hypot(target.x - first.x, target.y - first.y) <= 22
  }
  if (tool === 'extended-line') {
    return distanceToInfiniteLine(target, first, second) <= 6
  }
  if (tool === 'ray') {
    return distanceToRay(target, first, second) <= 6
  }
  if (tool === 'ellipse') {
    return distanceToEllipse(target, first, second) <= 7
  }
  if (tool === 'path') {
    const dx = second.x - first.x
    return distanceToBezier(
      target,
      first,
      { x: first.x + dx * 0.34, y: first.y },
      { x: first.x + dx * 0.66, y: second.y },
      second,
    ) <= 7
  }
  if (tool === 'arc' && points[2]) {
    return distanceToBezier(
      target,
      first,
      second,
      second,
      points[2],
    ) <= 7
  }
  if (tool === 'curve' && points[2] && points[3]) {
    return distanceToBezier(
      target,
      first,
      second,
      points[2],
      points[3],
    ) <= 7
  }
  if (tool === 'double-curve' && points[2]) {
    const center = midpoint(first, points[2])
    return distanceToQuadratic(target, first, second, points[2]) <= 7
      || distanceToQuadratic(
        target,
        first,
        mirror(second, center),
        points[2],
      ) <= 7
  }
  if (tool === 'rotated-rectangle' && points[2]) {
    const edge = subtract(second, first)
    const length = Math.max(1, Math.hypot(edge.x, edge.y))
    const normal = { x: -edge.y / length, y: edge.x / length }
    const offset = scale(normal, dot(subtract(points[2], first), normal))
    return pointInOrNearPolygon(target, [
      first,
      second,
      add(second, offset),
      add(first, offset),
    ])
  }
  if (tool === 'gann-box' || tool === 'gann-square') {
    return pointInBounds(target, boundingBox([first, second]))
  }
  if (tool === 'forecast') {
    const spread = Math.max(12, Math.abs(second.y - first.y) * 0.2)
    return pointInOrNearPolygon(target, [
      first,
      { x: second.x, y: second.y - spread },
      { x: second.x, y: second.y + spread },
    ])
  }
  if (tool === 'disjoint-channel' && points[2] && points[3]) {
    return distanceToSegment(target, first, second) <= 7
      || distanceToSegment(target, points[2], points[3]) <= 7
  }
  if (!CHAIN_SEGMENT_HIT_TEST_TOOLS.has(tool)) {
    return false
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    if (distanceToSegment(target, points[index], points[index + 1]) <= 7) {
      return true
    }
  }
  return false
}

const CHAIN_SEGMENT_HIT_TEST_TOOLS = new Set<CatalogDrawingToolId>([
  'anchored-text',
  'arrow',
  'bars-pattern',
  'brush',
  'callout',
  'gann-fan',
  'highlighter',
  'info-line',
  'path',
  'polyline',
  'price-label',
  'price-note',
  'projection',
  'trend-angle',
])

function pointInOrNearPolygon(
  point: ViewPoint,
  polygon: readonly ViewPoint[],
): boolean {
  if (pointInPolygon(point, polygon)) {
    return true
  }
  for (let index = 0; index < polygon.length; index += 1) {
    const next = (index + 1) % polygon.length
    if (distanceToSegment(point, polygon[index], polygon[next]) <= 7) {
      return true
    }
  }
  return false
}

function distanceToEllipse(
  point: ViewPoint,
  start: ViewPoint,
  end: ViewPoint,
): number {
  const center = midpoint(start, end)
  const radiusX = Math.abs(end.x - start.x) / 2
  const radiusY = Math.abs(end.y - start.y) / 2
  if (radiusX < 0.001 || radiusY < 0.001) {
    return distanceToSegment(point, start, end)
  }
  const dx = point.x - center.x
  const dy = point.y - center.y
  const angle = Math.atan2(dy * radiusX, dx * radiusY)
  const edge = {
    x: center.x + Math.cos(angle) * radiusX,
    y: center.y + Math.sin(angle) * radiusY,
  }
  return Math.hypot(point.x - edge.x, point.y - edge.y)
}

function distanceToBezier(
  point: ViewPoint,
  start: ViewPoint,
  control1: ViewPoint,
  control2: ViewPoint,
  end: ViewPoint,
): number {
  return distanceToSampledCurve(point, (ratio) => {
    const inverse = 1 - ratio
    const a = inverse ** 3
    const b = 3 * inverse ** 2 * ratio
    const c = 3 * inverse * ratio ** 2
    const d = ratio ** 3
    return {
      x: a * start.x + b * control1.x + c * control2.x + d * end.x,
      y: a * start.y + b * control1.y + c * control2.y + d * end.y,
    }
  })
}

function distanceToQuadratic(
  point: ViewPoint,
  start: ViewPoint,
  control: ViewPoint,
  end: ViewPoint,
): number {
  return distanceToSampledCurve(point, (ratio) => {
    const inverse = 1 - ratio
    return {
      x: inverse ** 2 * start.x
        + 2 * inverse * ratio * control.x
        + ratio ** 2 * end.x,
      y: inverse ** 2 * start.y
        + 2 * inverse * ratio * control.y
        + ratio ** 2 * end.y,
    }
  })
}

function distanceToSampledCurve(
  point: ViewPoint,
  sample: (ratio: number) => ViewPoint,
): number {
  let nearest = Number.POSITIVE_INFINITY
  let previous = sample(0)
  for (let step = 1; step <= 24; step += 1) {
    const current = sample(step / 24)
    nearest = Math.min(nearest, distanceToSegment(point, previous, current))
    previous = current
  }
  return nearest
}

function pointInBounds(
  point: ViewPoint,
  bounds: { left: number, right: number, top: number, bottom: number },
): boolean {
  return point.x >= bounds.left
    && point.x <= bounds.right
    && point.y >= bounds.top
    && point.y <= bounds.bottom
}

function pointInPolygon(
  point: ViewPoint,
  polygon: readonly ViewPoint[],
): boolean {
  let inside = false
  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const first = polygon[current]
    const second = polygon[previous]
    const crosses = (first.y > point.y) !== (second.y > point.y)
      && point.x < (second.x - first.x) * (point.y - first.y)
      / (second.y - first.y) + first.x
    if (crosses) {
      inside = !inside
    }
  }
  return inside
}

function distanceToSegment(
  point: ViewPoint,
  start: ViewPoint,
  end: ViewPoint,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const squared = dx * dx + dy * dy
  if (squared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const ratio = Math.max(0, Math.min(1, (
    (point.x - start.x) * dx + (point.y - start.y) * dy
  ) / squared))
  return Math.hypot(
    point.x - (start.x + ratio * dx),
    point.y - (start.y + ratio * dy),
  )
}

function distanceToInfiniteLine(
  point: ViewPoint,
  start: ViewPoint,
  end: ViewPoint,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  return length === 0
    ? Math.hypot(point.x - start.x, point.y - start.y)
    : Math.abs(dy * point.x - dx * point.y + end.x * start.y
      - end.y * start.x) / length
}

function distanceToRay(
  point: ViewPoint,
  start: ViewPoint,
  end: ViewPoint,
): number {
  const direction = subtract(end, start)
  const projection = dot(subtract(point, start), direction)
  return projection < 0
    ? Math.hypot(point.x - start.x, point.y - start.y)
    : distanceToInfiniteLine(point, start, end)
}

function boundingBox(points: readonly ViewPoint[]): {
  left: number
  right: number
  top: number
  bottom: number
} {
  let left = points[0].x
  let right = points[0].x
  let top = points[0].y
  let bottom = points[0].y
  for (let index = 1; index < points.length; index += 1) {
    left = Math.min(left, points[index].x)
    right = Math.max(right, points[index].x)
    top = Math.min(top, points[index].y)
    bottom = Math.max(bottom, points[index].y)
  }
  return { left, right, top, bottom }
}

function add(first: ViewPoint, second: ViewPoint): ViewPoint {
  return { x: first.x + second.x, y: first.y + second.y }
}

function subtract(first: ViewPoint, second: ViewPoint): ViewPoint {
  return { x: first.x - second.x, y: first.y - second.y }
}

function scale(point: ViewPoint, value: number): ViewPoint {
  return { x: point.x * value, y: point.y * value }
}

function dot(first: ViewPoint, second: ViewPoint): number {
  return first.x * second.x + first.y * second.y
}

function midpoint(first: ViewPoint, second: ViewPoint): ViewPoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function lerp(first: ViewPoint, second: ViewPoint, ratio: number): ViewPoint {
  return {
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio,
  }
}

function mirror(point: ViewPoint, center: ViewPoint): ViewPoint {
  return { x: center.x * 2 - point.x, y: center.y * 2 - point.y }
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || !Number.isFinite(price)) {
    return '—'
  }
  if (Math.abs(price) >= 1000) {
    return price.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  }
  return price.toLocaleString('pt-BR', { maximumSignificantDigits: 7 })
}

export function colorWithAlpha(color: string, alpha: number): string {
  if (/^#[\da-f]{6}$/i.test(color)) {
    const red = Number.parseInt(color.slice(1, 3), 16)
    const green = Number.parseInt(color.slice(3, 5), 16)
    const blue = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
  }
  return color
}

function assertNever(value: never): never {
  throw new Error(`Ferramenta sem renderer: ${String(value)}`)
}
