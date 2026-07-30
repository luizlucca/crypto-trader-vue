interface BitmapPositionLength {
  position: number
  length: number
}

function optimalCandlestickWidth(
  barSpacing: number,
  pixelRatio: number,
): number {
  const specialCaseFrom = 2.5
  const specialCaseTo = 4
  if (barSpacing >= specialCaseFrom && barSpacing <= specialCaseTo) {
    return Math.floor(3 * pixelRatio)
  }

  const coefficient = 1 - (
    0.2
    * Math.atan(Math.max(specialCaseTo, barSpacing) - specialCaseTo)
  ) / (Math.PI * 0.5)
  const width = Math.floor(barSpacing * coefficient * pixelRatio)
  const scaledSpacing = Math.floor(barSpacing * pixelRatio)
  return Math.max(Math.floor(pixelRatio), Math.min(width, scaledSpacing))
}

export function candlestickWidth(
  barSpacing: number,
  horizontalPixelRatio: number,
): number {
  let width = optimalCandlestickWidth(barSpacing, horizontalPixelRatio)
  if (width >= 2) {
    const wickWidth = Math.floor(horizontalPixelRatio)
    if (wickWidth % 2 !== width % 2) {
      width -= 1
    }
  }
  return width
}

export function gridLineMediaWidth(horizontalPixelRatio: number): number {
  return Math.max(1, Math.floor(horizontalPixelRatio))
    / horizontalPixelRatio
}

export function positionsLine(
  positionMedia: number,
  pixelRatio: number,
  desiredWidthMedia = 1,
): BitmapPositionLength {
  const lineBitmapWidth = Math.round(desiredWidthMedia * pixelRatio)
  return {
    position: Math.round(pixelRatio * positionMedia)
      - Math.floor(lineBitmapWidth * 0.5),
    length: lineBitmapWidth,
  }
}

export function positionsBox(
  firstMedia: number,
  secondMedia: number,
  pixelRatio: number,
): BitmapPositionLength {
  const first = Math.round(pixelRatio * firstMedia)
  const second = Math.round(pixelRatio * secondMedia)
  return {
    position: Math.min(first, second),
    length: Math.abs(second - first) + 1,
  }
}
