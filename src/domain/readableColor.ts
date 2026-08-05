/**
 * Keeps a colour visible against the surface it is drawn on.
 *
 * The indicator catalog carries 217 fixed colours, written for one dark theme.
 * Against the app's own presets they are not always readable: a pale yellow
 * disappears on any light theme, a navy disappears on any dark one. The
 * operator would find out by seeing nothing — the worst possible way, on a
 * screen used to decide trades.
 *
 * The fix is deliberately conservative. Hue and saturation are preserved, only
 * lightness moves, and it moves the minimum needed to clear the threshold. A
 * colour that already reads is returned untouched, so a theme where the catalog
 * happens to work looks exactly as its author intended.
 */

import {
  contrastRatio,
  hexChannels,
  luminanceContrast,
  relativeLuminance,
  toHex,
  type RgbChannels,
} from './color'

export { contrastRatio }

/** WCAG 1.4.11 asks 3:1 for graphical objects; a thin line needs every bit. */
export const MIN_GRAPHIC_CONTRAST = 3

type HslChannels = [number, number, number]

function toHsl(
  [red, green, blue]: RgbChannels,
): HslChannels {
  const r = red / 255
  const g = green / 255
  const b = blue / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const light = (max + min) / 2
  if (max === min) {
    return [0, 0, light]
  }
  const delta = max - min
  const saturation = light > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min)
  let hue: number
  if (max === r) {
    hue = ((g - b) / delta) + (g < b ? 6 : 0)
  } else if (max === g) {
    hue = ((b - r) / delta) + 2
  } else {
    hue = ((r - g) / delta) + 4
  }
  return [hue / 6, saturation, light]
}

function hueComponent(hue: number, p: number, q: number): number {
  let normalizedHue = hue
  if (normalizedHue < 0) normalizedHue += 1
  if (normalizedHue > 1) normalizedHue -= 1
  if (normalizedHue < 1 / 6) return p + ((q - p) * 6 * normalizedHue)
  if (normalizedHue < 1 / 2) return q
  if (normalizedHue < 2 / 3) {
    return p + ((q - p) * ((2 / 3) - normalizedHue) * 6)
  }
  return p
}

function fromHsl(
  [hue, saturation, light]: HslChannels,
): RgbChannels {
  if (saturation === 0) {
    const channel = light * 255
    return [channel, channel, channel]
  }
  const q = light < 0.5
    ? light * (1 + saturation)
    : light + saturation - (light * saturation)
  const p = (2 * light) - q
  return [
    hueComponent(hue + (1 / 3), p, q) * 255,
    hueComponent(hue, p, q) * 255,
    hueComponent(hue - (1 / 3), p, q) * 255,
  ]
}

/**
 * Returns `color` if it already reads on `background`, otherwise the nearest
 * lighter or darker version of it that does.
 *
 * Walking in small steps and stopping at the first success is what keeps the
 * result recognisable as the original colour rather than a generic bright
 * substitute.
 */
export function readableOn(
  color: string,
  background: string,
  minimum: number = MIN_GRAPHIC_CONTRAST,
): string {
  const source = hexChannels(color)
  const surface = hexChannels(background)
  if (!source || !surface) {
    return color
  }
  const surfaceLuminance = relativeLuminance(surface)
  const current = luminanceContrast(
    relativeLuminance(source),
    surfaceLuminance,
  )
  if (current >= minimum) {
    return color
  }

  /*
   * The direction is decided by which end of the scale has more room against
   * this surface, not by whether the surface is "dark". On a mid grey — the
   * light variant of a deep neutral theme — going towards white tops out
   * around 3:1 while going towards black reaches 7:1, and choosing by
   * lightness alone would leave the line barely visible.
   */
  const towardsWhite = luminanceContrast(1, surfaceLuminance)
    > luminanceContrast(0, surfaceLuminance)
  const [hue, saturation, light] = toHsl(source)
  const step = 0.03

  const walk = (up: boolean): string | null => {
    let candidate = light
    for (let i = 0; i < 34; i += 1) {
      candidate = up ? candidate + step : candidate - step
      if (candidate <= 0 || candidate >= 1) {
        return null
      }
      const next = toHex(fromHsl([hue, saturation, candidate]))
      const nextChannels = hexChannels(next)
      if (nextChannels && luminanceContrast(
        relativeLuminance(nextChannels),
        surfaceLuminance,
      ) >= minimum) {
        return next
      }
    }
    return null
  }

  // The preferred direction first, then the other: a hue can run out of room
  // on one side and still have plenty on the opposite one.
  const found = walk(towardsWhite) ?? walk(!towardsWhite)
  if (found) {
    return found
  }
  // The hue cannot reach the threshold at any lightness: take the extreme that
  // contrasts most, which is still better than an invisible line.
  return towardsWhite ? '#ffffff' : '#000000'
}

/**
 * Memoised for the drawing path: marker sets repeat two or three colours over
 * hundreds of points, and the palette changes only when the theme does.
 */
const cache = new Map<string, string>()

export function readableOnCached(
  color: string,
  background: string,
  minimum: number = MIN_GRAPHIC_CONTRAST,
): string {
  const key = `${color}|${background}|${minimum}`
  const known = cache.get(key)
  if (known !== undefined) {
    return known
  }
  const resolved = readableOn(color, background, minimum)
  if (cache.size > 512) {
    cache.clear()
  }
  cache.set(key, resolved)
  return resolved
}
