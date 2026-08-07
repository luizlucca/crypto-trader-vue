export type TextSizePresetId = 'small' | 'medium' | 'large' | 'extra-large'
export type TextFontFamilyId = 'inter' | 'mono' | 'system' | 'serif'
export type TextFontWeight = 400 | 500 | 600 | 700
export type TextFontStyle = 'normal' | 'italic'

export interface TextAppearance {
  fontFamily: TextFontFamilyId
  fontSize: number
  fontWeight: TextFontWeight
  fontStyle: TextFontStyle
  color: string
}

export interface TextSizePreset {
  id: TextSizePresetId
  label: 'S' | 'M' | 'L' | 'XL'
  name: string
  fontSize: number
}

export interface TextFontOption {
  id: TextFontFamilyId
  label: string
  stack: string
}

export const TEXT_FONT_SIZE_MIN = 8
export const TEXT_FONT_SIZE_MAX = 48

export const TEXT_SIZE_PRESETS = [
  { id: 'small', label: 'S', name: 'Pequeno', fontSize: 10 },
  { id: 'medium', label: 'M', name: 'Médio', fontSize: 12 },
  { id: 'large', label: 'L', name: 'Grande', fontSize: 16 },
  { id: 'extra-large', label: 'XL', name: 'Extra grande', fontSize: 22 },
] as const satisfies readonly TextSizePreset[]

export const TEXT_FONT_OPTIONS = [
  {
    id: 'inter',
    label: 'Inter',
    stack: '"Inter Variable", Inter, sans-serif',
  },
  {
    id: 'mono',
    label: 'JetBrains Mono',
    stack: '"JetBrains Mono Variable", "SFMono-Regular", monospace',
  },
  {
    id: 'system',
    label: 'Sistema',
    stack: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif',
    stack: 'Georgia, "Times New Roman", serif',
  },
] as const satisfies readonly TextFontOption[]

export const TEXT_FONT_WEIGHTS = [
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Médio' },
  { value: 600, label: 'Semibold' },
  { value: 700, label: 'Negrito' },
] as const satisfies readonly { value: TextFontWeight, label: string }[]

export const DEFAULT_TEXT_APPEARANCE: Readonly<TextAppearance> = {
  fontFamily: 'inter',
  fontSize: 12,
  fontWeight: 600,
  fontStyle: 'normal',
  color: '#DCE8EF',
}

/** Reusable surface colour behind text rendered over dense chart content. */
export const DEFAULT_TEXT_BACKGROUND_COLOR = '#07141C'

const FONT_IDS = new Set<TextFontFamilyId>(
  TEXT_FONT_OPTIONS.map(({ id }) => id),
)
const FONT_WEIGHTS = new Set<TextFontWeight>(
  TEXT_FONT_WEIGHTS.map(({ value }) => value),
)
const FONT_STACKS = Object.fromEntries(
  TEXT_FONT_OPTIONS.map(({ id, stack }) => [id, stack]),
) as Record<TextFontFamilyId, string>
const HEX_COLOR = /^#[\da-f]{6}$/i

export function normalizeTextBackgroundColor(value: unknown): string {
  return typeof value === 'string' && HEX_COLOR.test(value)
    ? value
    : DEFAULT_TEXT_BACKGROUND_COLOR
}

export function normalizeTextAppearance(value: unknown): TextAppearance {
  const stored = value as Partial<TextAppearance> | null
  const knownFont = stored
    && FONT_IDS.has(stored.fontFamily as TextFontFamilyId)
  const fontFamily = knownFont
    ? stored.fontFamily as TextFontFamilyId
    : DEFAULT_TEXT_APPEARANCE.fontFamily
  const fontWeight = stored
    && FONT_WEIGHTS.has(stored.fontWeight as TextFontWeight)
    ? stored.fontWeight as TextFontWeight
    : DEFAULT_TEXT_APPEARANCE.fontWeight
  const fontStyle = stored?.fontStyle === 'italic'
    ? 'italic'
    : DEFAULT_TEXT_APPEARANCE.fontStyle
  const color = typeof stored?.color === 'string'
    && HEX_COLOR.test(stored.color)
    ? stored.color
    : DEFAULT_TEXT_APPEARANCE.color
  const requestedSize = Number.isFinite(stored?.fontSize)
    ? Math.round(stored?.fontSize as number)
    : DEFAULT_TEXT_APPEARANCE.fontSize
  return {
    fontFamily,
    fontSize: Math.min(
      TEXT_FONT_SIZE_MAX,
      Math.max(TEXT_FONT_SIZE_MIN, requestedSize),
    ),
    fontWeight,
    fontStyle,
    color,
  }
}

export function copyTextAppearance(value: TextAppearance): TextAppearance {
  return { ...value }
}

export function textFontFamilyStack(fontFamily: TextFontFamilyId): string {
  return FONT_STACKS[fontFamily] ?? FONT_STACKS.inter
}

export function textCanvasFont(appearance: TextAppearance): string {
  return `${appearance.fontStyle} ${appearance.fontWeight} `
    + `${appearance.fontSize}px ${textFontFamilyStack(appearance.fontFamily)}`
}

export function estimateTextWidth(
  text: string,
  appearance: TextAppearance,
): number {
  const characterRatio = appearance.fontFamily === 'mono' ? 0.62 : 0.56
  return text.length * appearance.fontSize * characterRatio
}

export function textBoxHeight(appearance: TextAppearance): number {
  return Math.max(22, appearance.fontSize + 10)
}

export function sameTextAppearance(
  first: TextAppearance,
  second: TextAppearance,
): boolean {
  return first.fontFamily === second.fontFamily
    && first.fontSize === second.fontSize
    && first.fontWeight === second.fontWeight
    && first.fontStyle === second.fontStyle
    && first.color === second.color
}
