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

/** WCAG 1.4.11 asks 3:1 for graphical objects; a thin line needs every bit. */
export const MIN_GRAPHIC_CONTRAST = 3

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

function channels(color: string): [number, number, number] | null {
  const match = HEX.exec(color.trim())
  if (!match) {
    return null
  }
  const hex = match[1].length === 3
    ? [...match[1]].map((digit) => digit + digit).join('')
    : match[1]
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function toHex([red, green, blue]: [number, number, number]): string {
  const part = (channel: number): string => Math.round(Math.max(0, Math.min(255, channel)))
    .toString(16)
    .padStart(2, '0')
  return `#${part(red)}${part(green)}${part(blue)}`
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const scaled = channel / 255
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4
  })
  return (0.2126 * r) + (0.7152 * g) + (0.0722 * b)
}

export function contrastRatio(first: string, second: string): number | null {
  const left = channels(first)
  const right = channels(second)
  if (!left || !right) {
    return null
  }
  const one = relativeLuminance(left)
  const other = relativeLuminance(right)
  const [lighter, darker] = one > other ? [one, other] : [other, one]
  return (lighter + 0.05) / (darker + 0.05)
}

function toHsl(
  [red, green, blue]: [number, number, number],
): [number, number, number] {
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

function fromHsl(
  [hue, saturation, light]: [number, number, number],
): [number, number, number] {
  if (saturation === 0) {
    const channel = light * 255
    return [channel, channel, channel]
  }
  const q = light < 0.5
    ? light * (1 + saturation)
    : light + saturation - (light * saturation)
  const p = (2 * light) - q
  const component = (offset: number): number => {
    let t = hue + offset
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + ((q - p) * 6 * t)
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + ((q - p) * ((2 / 3) - t) * 6)
    return p
  }
  return [
    component(1 / 3) * 255,
    component(0) * 255,
    component(-1 / 3) * 255,
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
  const current = contrastRatio(color, background)
  const source = channels(color)
  const surface = channels(background)
  if (current === null || !source || !surface || current >= minimum) {
    return color
  }

  /*
   * The direction is decided by which end of the scale has more room against
   * this surface, not by whether the surface is "dark". On a mid grey — the
   * light variant of a deep neutral theme — going towards white tops out
   * around 3:1 while going towards black reaches 7:1, and choosing by
   * lightness alone would leave the line barely visible.
   */
  const towardsWhite = (contrastRatio('#ffffff', background) ?? 0)
    > (contrastRatio('#000000', background) ?? 0)
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
      if ((contrastRatio(next, background) ?? 0) >= minimum) {
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
