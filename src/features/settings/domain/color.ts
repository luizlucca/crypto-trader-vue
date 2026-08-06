/**
 * Colour arithmetic, in one place.
 *
 * These primitives existed twice — once for the readable-colour walk, once for
 * the theme catalog — with two different sRGB thresholds, `0.03928` and
 * `0.04045`. Both are legitimate: the first is the number WCAG prints, the
 * second the one the sRGB specification does. They disagree only for channel
 * values between 10.016 and 10.315, and **no 8-bit integer falls in that
 * band**, so the two implementations always agreed. Unifying them is therefore
 * arithmetic-neutral, which is why it was safe to do at all.
 */

export type RgbChannels = [number, number, number]

/** Accepts `#abc` and `#aabbcc`; anything else is not a colour we can read. */
export function hexChannels(color: string): RgbChannels | null {
  const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim())
  if (!match) {
    return null
  }
  const hex = match[1].length === 3
    ? `${match[1][0]}${match[1][0]}${match[1][1]}${match[1][1]}`
    + `${match[1][2]}${match[1][2]}`
    : match[1]
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function channelHex(channel: number): string {
  return Math.round(Math.max(0, Math.min(255, channel)))
    .toString(16)
    .padStart(2, '0')
}

export function toHex([red, green, blue]: RgbChannels): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`
}

/** sRGB channel to linear light, for luminance that matches perception. */
export function linearChannel(channel: number): number {
  const scaled = channel / 255
  return scaled <= 0.03928
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4
}

export function relativeLuminance([red, green, blue]: RgbChannels): number {
  return (0.2126 * linearChannel(red))
    + (0.7152 * linearChannel(green))
    + (0.0722 * linearChannel(blue))
}

/** WCAG 1.4.11 asks 3:1 for graphical objects; a thin line needs every bit. */
export const MIN_GRAPHIC_CONTRAST = 3

/** Ratio between two luminances already computed. */
export function luminanceContrast(first: number, second: number): number {
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Null when either colour cannot be read, never a made-up ratio. */
export function contrastRatio(first: string, second: string): number | null {
  const left = hexChannels(first)
  const right = hexChannels(second)
  if (!left || !right) {
    return null
  }
  return luminanceContrast(relativeLuminance(left), relativeLuminance(right))
}
