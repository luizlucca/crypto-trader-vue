import type { DrawingToolId } from '@/domain/chartDrawings'

type IconLine = readonly [x1: number, y1: number, x2: number, y2: number]
type IconCircle = readonly [cx: number, cy: number, radius: number]
type IconEllipse = readonly [cx: number, cy: number, rx: number, ry: number]
type IconRect = readonly [
  x: number,
  y: number,
  width: number,
  height: number,
  radius?: number,
]

export interface DrawingToolIconDefinition {
  paths?: readonly string[]
  lines?: readonly IconLine[]
  circles?: readonly IconCircle[]
  ellipses?: readonly IconEllipse[]
  rects?: readonly IconRect[]
  polylines?: readonly string[]
}

const endpointPair: readonly IconCircle[] = [[4, 19, 1.5], [20, 5, 1.5]]
const diagonal: readonly IconLine[] = [[5.2, 17.8, 18.8, 6.2]]
const pitchfork: DrawingToolIconDefinition = {
  lines: [[4, 19, 12, 5], [12, 5, 21, 19], [8, 12, 18, 12]],
  circles: [[4, 19, 1.2], [12, 5, 1.2], [21, 19, 1.2]],
}

/**
 * Purpose-built, dependency-free charting glyphs.
 *
 * They deliberately describe the geometry of each tool instead of borrowing
 * unrelated application icons. This keeps the market convention familiar
 * while leaving the artwork under the application's control.
 */
export const DRAWING_TOOL_ICONS: Record<
  DrawingToolId,
  DrawingToolIconDefinition
> = {
  'trend-line': { lines: diagonal, circles: endpointPair },
  'ray': {
    lines: [[4, 19, 21, 4]],
    circles: [[4, 19, 1.5]],
    polylines: ['17 4 21 4 21 8'],
  },
  'arrow': {
    lines: [[4, 19, 20, 5]],
    polylines: ['14 5 20 5 20 11'],
  },
  'extended-line': {
    lines: [[2, 21, 22, 3]],
    circles: [[8, 15.6, 1.2], [16, 8.4, 1.2]],
  },
  'info-line': {
    circles: [[3, 18, 1.2], [17, 6, 1.2], [20, 16, 3]],
    lines: [[3, 18, 17, 6], [20, 15, 20, 18]],
  },
  'trend-angle': {
    lines: [[4, 19, 21, 19], [4, 19, 17, 6]],
    paths: ['M9 19a5 5 0 0 0-1.4-3.5'],
    circles: [[4, 19, 1.2]],
  },
  'horizontal-line': { lines: [[3, 12, 21, 12]] },
  'horizontal-ray': {
    lines: [[4, 12, 22, 12]],
    circles: [[4, 12, 1.5]],
  },
  'vertical-line': { lines: [[12, 3, 12, 21]] },
  'cross-line': { lines: [[3, 12, 21, 12], [12, 3, 12, 21]] },
  'regression-trend': {
    lines: [[3, 18, 18, 5], [6, 21, 21, 8], [2, 13, 15, 2]],
    paths: ['M4 15.5l15-13'],
  },
  'flat-top-bottom': {
    lines: [[3, 6, 20, 6], [3, 18, 20, 18], [5, 18, 18, 6]],
    circles: [[5, 18, 1.1], [18, 6, 1.1]],
  },
  'disjoint-channel': {
    lines: [[3, 18, 11, 10], [13, 14, 21, 6], [3, 11, 10, 4], [14, 21, 21, 14]],
    circles: [[3, 18, 1], [11, 10, 1], [13, 14, 1], [21, 6, 1]],
  },
  'andrews-pitchfork': pitchfork,
  'schiff-pitchfork': {
    lines: [[4, 16, 12, 5], [7, 19, 21, 8], [9, 12, 19, 17]],
    circles: [[4, 16, 1.1], [12, 5, 1.1], [7, 19, 1.1]],
  },
  'modified-schiff-pitchfork': {
    lines: [[3, 18, 11, 7], [7, 20, 21, 9], [8, 13, 20, 18]],
    paths: ['M11 7l3-3'],
    circles: [[3, 18, 1.1], [11, 7, 1.1], [7, 20, 1.1]],
  },
  'inside-pitchfork': {
    lines: [
      [4, 19, 12, 5], [12, 5, 21, 19],
      [8, 12, 18, 12], [10, 8.5, 14, 8.5],
    ],
    circles: [[4, 19, 1], [12, 5, 1], [21, 19, 1]],
  },
  'fib-retracement': {
    lines: [
      [4, 19, 20, 5], [6, 7, 21, 7], [6, 11, 18, 11],
      [6, 15, 15, 15], [6, 19, 12, 19],
    ],
    circles: [[4, 19, 1.2], [20, 5, 1.2]],
  },
  'fib-extension': {
    polylines: ['3 18 10 7 15 16'],
    lines: [[15, 5, 21, 5], [15, 9, 20, 9], [15, 13, 19, 13], [15, 17, 21, 17]],
    circles: [[3, 18, 1], [10, 7, 1], [15, 16, 1]],
  },
  'fib-channel': {
    lines: [[2, 18, 15, 5], [5, 21, 18, 8], [8, 21, 21, 8], [2, 14, 13, 3]],
    circles: [[2, 18, 1], [15, 5, 1]],
  },
  'fib-time-zone': {
    lines: [[4, 4, 4, 20], [8, 4, 8, 20], [13, 4, 13, 20], [20, 4, 20, 20]],
    circles: [[4, 20, 1], [8, 20, 1]],
  },
  'fib-speed-fan': {
    lines: [
      [4, 20, 4, 4], [4, 20, 21, 20], [4, 20, 20, 5],
      [4, 20, 20, 10], [4, 20, 20, 15],
    ],
    circles: [[4, 20, 1.2]],
  },
  'fib-time-extension': {
    polylines: ['3 18 9 7 14 16'],
    lines: [[14, 4, 14, 20], [17, 4, 17, 20], [21, 4, 21, 20]],
    circles: [[3, 18, 1], [9, 7, 1], [14, 16, 1]],
  },
  'fib-circles': {
    ellipses: [[12, 12, 3, 2], [12, 12, 6, 4], [12, 12, 10, 7]],
    lines: [[3, 18, 21, 6]],
  },
  'fib-spiral': {
    paths: ['M12 12c0-2 3-2 3 0 0 3-5 4-7 1-3-5 4-10 9-6 7 5 3 15-6 17'],
    circles: [[12, 12, 1]],
  },
  'fib-arcs': {
    paths: [
      'M4 19A7 7 0 0 1 11 12',
      'M4 19A12 12 0 0 1 16 7',
      'M4 19A17 17 0 0 1 21 2',
    ],
    lines: [[4, 19, 20, 5]],
  },
  'fib-wedge': {
    lines: [[4, 19, 20, 6], [4, 19, 21, 19]],
    paths: ['M10 14a8 8 0 0 1 2 5', 'M14 11a13 13 0 0 1 3 8'],
    circles: [[4, 19, 1.2]],
  },
  'pitchfan': {
    lines: [[4, 19, 12, 5], [4, 19, 21, 8], [4, 19, 21, 13], [4, 19, 21, 18]],
    circles: [[4, 19, 1.2], [12, 5, 1.2]],
  },
  'gann-box': {
    rects: [[3, 3, 18, 18, 1]],
    lines: [[3, 21, 21, 3], [3, 12, 21, 12], [12, 3, 12, 21]],
  },
  'gann-fan': {
    lines: [
      [3, 20, 3, 4], [3, 20, 21, 20], [3, 20, 20, 4],
      [3, 20, 20, 9], [3, 20, 20, 14],
    ],
  },
  'gann-square-fixed': {
    rects: [[3, 3, 18, 18, 1], [7, 7, 10, 10]],
    lines: [[3, 3, 21, 21], [21, 3, 3, 21]],
  },
  'gann-square': {
    rects: [[3, 3, 18, 18, 1]],
    lines: [[3, 3, 21, 21], [21, 3, 3, 21], [3, 12, 21, 12], [12, 3, 12, 21]],
  },
  'parallel-channel': {
    lines: [[3, 17, 17, 3], [7, 21, 21, 7]],
    circles: [[3, 17, 1.2], [17, 3, 1.2], [7, 21, 1.2]],
  },
  'rectangle': { rects: [[4, 5, 16, 14, 1]] },
  'rotated-rectangle': {
    polylines: ['3 13 12 4 21 11 12 20 3 13'],
    circles: [[3, 13, 1], [12, 4, 1], [21, 11, 1]],
  },
  'circle': { circles: [[12, 12, 8]] },
  'ellipse': { ellipses: [[12, 12, 9, 6]] },
  'arc': {
    paths: ['M3 18Q12 2 21 18'],
    circles: [[3, 18, 1.1], [12, 6, 1.1], [21, 18, 1.1]],
  },
  'triangle': { polylines: ['12 3 21 20 3 20 12 3'] },
  'path': {
    paths: ['M3 18C7 4 10 20 14 8s5-4 7-2'],
    circles: [[3, 18, 1], [21, 6, 1]],
  },
  'polyline': {
    polylines: ['3 18 8 7 13 15 20 5'],
    circles: [[3, 18, 1], [8, 7, 1], [13, 15, 1], [20, 5, 1]],
  },
  'curve': {
    paths: ['M3 18C8 2 16 2 21 18'],
    lines: [[3, 18, 8, 5], [21, 18, 16, 5]],
    circles: [[3, 18, 1], [8, 5, 1], [16, 5, 1], [21, 18, 1]],
  },
  'double-curve': {
    paths: [
      'M3 17C7 5 10 5 12 12S17 19 21 7',
      'M3 20C8 10 11 10 13 15s5 4 8-1',
    ],
  },
  'long-position': {
    rects: [[4, 4, 16, 16, 1]],
    lines: [[4, 12, 20, 12], [12, 17, 12, 7]],
    polylines: ['8.5 10.5 12 7 15.5 10.5'],
  },
  'short-position': {
    rects: [[4, 4, 16, 16, 1]],
    lines: [[4, 12, 20, 12], [12, 7, 12, 17]],
    polylines: ['8.5 13.5 12 17 15.5 13.5'],
  },
  'forecast': {
    polylines: ['3 17 7 12 10 15 14 8'],
    paths: ['M14 8c2-3 4-2 7-5', 'M14 8c3 1 4 5 7 7'],
    circles: [[14, 8, 1]],
  },
  'projection': {
    polylines: ['3 18 9 7 14 15'],
    paths: ['M14 15l7-10', 'M18 5h3v3'],
    circles: [[3, 18, 1], [9, 7, 1], [14, 15, 1]],
  },
  'bars-pattern': {
    lines: [[5, 4, 5, 18], [10, 7, 10, 21], [15, 3, 15, 16], [20, 6, 20, 20]],
    rects: [[3.5, 7, 3, 7], [8.5, 11, 3, 6], [13.5, 6, 3, 6], [18.5, 10, 3, 6]],
  },
  'measure': {
    lines: [[4, 19, 20, 5]],
    polylines: ['4 14 4 19 9 19', '15 5 20 5 20 10'],
    paths: ['M8 15l1.5 1.5', 'M11 12l1.5 1.5', 'M14 9l1.5 1.5'],
  },
  'price-range': {
    lines: [[12, 4, 12, 20], [7, 4, 17, 4], [7, 20, 17, 20]],
    polylines: ['9 7 12 4 15 7', '9 17 12 20 15 17'],
  },
  'date-range': {
    lines: [[4, 12, 20, 12], [4, 7, 4, 17], [20, 7, 20, 17]],
    polylines: ['7 9 4 12 7 15', '17 9 20 12 17 15'],
  },
  'date-price-range': {
    rects: [[4, 4, 16, 16, 1]],
    lines: [[4, 12, 20, 12], [12, 4, 12, 20]],
    polylines: ['9 7 12 4 15 7', '17 9 20 12 17 15'],
  },
  'text-annotation': {
    lines: [[5, 5, 19, 5], [12, 5, 12, 20], [8, 20, 16, 20]],
  },
  'callout': {
    paths: ['M4 5h16v11H10l-5 4 1-4H4z'],
    lines: [[8, 9, 16, 9], [8, 12, 14, 12]],
  },
  'anchored-text': {
    lines: [[5, 4, 19, 4], [12, 4, 12, 17], [8, 17, 16, 17], [12, 17, 12, 21]],
    circles: [[12, 21, 1.2]],
  },
  'note': {
    paths: ['M5 3h11l4 4v14H5z', 'M16 3v5h4'],
    lines: [[8, 12, 17, 12], [8, 16, 15, 16]],
  },
  'price-note': {
    paths: ['M4 5h13l3 4-3 4H4z'],
    lines: [[7, 9, 15, 9], [12, 13, 12, 20]],
  },
  'price-label': {
    paths: ['M4 6h13l3 6-3 6H4z'],
    circles: [[8, 12, 1.2]],
    lines: [[11, 10, 16, 10], [11, 14, 15, 14]],
  },
  'flag-mark': {
    lines: [[5, 3, 5, 21]],
    paths: ['M5 4h13l-3 4 3 4H5'],
  },
  'pin': {
    paths: ['M12 21s6-6 6-11a6 6 0 1 0-12 0c0 5 6 11 6 11z'],
    circles: [[12, 10, 2]],
  },
  'comment': {
    paths: ['M4 4h16v13H9l-5 4z'],
    circles: [[8, 10, 0.7], [12, 10, 0.7], [16, 10, 0.7]],
  },
  'signpost': {
    lines: [[8, 3, 8, 21]],
    paths: ['M8 5h11l2 3-2 3H8', 'M8 13H3l-2 3 2 3h5'],
  },
  'table': {
    rects: [[3, 4, 18, 16, 1]],
    lines: [[3, 9, 21, 9], [3, 14, 21, 14], [10, 4, 10, 20], [16, 4, 16, 20]],
  },
  'brush': {
    paths: ['M4 18c2-5 5-2 7-7s5-8 9-7c1 4-3 8-7 9s-2 7-9 7z'],
  },
  'highlighter': {
    paths: ['M5 15L15 5l4 4-10 10H5z'],
    lines: [[4, 21, 20, 21], [13, 7, 17, 11]],
  },
  'arrow-marker': {
    lines: [[4, 18, 19, 5]],
    polylines: ['13 5 19 5 19 11'],
    circles: [[4, 18, 2]],
  },
  'arrow-mark-up': {
    lines: [[12, 21, 12, 5]],
    polylines: ['6 11 12 5 18 11'],
  },
  'arrow-mark-down': {
    lines: [[12, 3, 12, 19]],
    polylines: ['6 13 12 19 18 13'],
  },
}
