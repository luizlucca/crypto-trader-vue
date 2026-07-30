export interface ThemePalette {
  background: string
  panel: string
  panelRaised: string
  panelMuted: string
  header: string
  workspace: string
  navigation: string
  control: string
  input: string
  hover: string
  selected: string
  border: string
  borderSoft: string
  text: string
  textStrong: string
  muted: string
  accent: string
  accentHover: string
  accentSoft: string
  accentContrast: string
  positive: string
  negative: string
  secondary: string
  warning: string
  chartBackground: string
  chartGrid: string
  chartBorder: string
  chartText: string
  chartCrosshair: string
  chartCrosshairLabel: string
  watermarkPrimary: string
  watermarkSecondary: string
  candleUp: string
  candleDown: string
  volumeUp: string
  volumeDown: string
}

interface ThemeDefinition {
  id: string
  name: string
  description: string
  accentDark: string
  accentLight: string
  upDark: string
  upLight: string
  downDark: string
  downLight: string
  secondaryDark: string
  secondaryLight: string
  tintDark?: string
  tintLight?: string
}

const DEFINITIONS = [
  {
    id: 'cryptopro',
    name: 'CryptoPro',
    description: 'Azul técnico e candles turquesa',
    accentDark: '#35a7ff',
    accentLight: '#087fd3',
    upDark: '#2dd4bf',
    upLight: '#078c68',
    downDark: '#fb7185',
    downLight: '#d63f50',
    secondaryDark: '#a78bfa',
    secondaryLight: '#7c3fb2',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Azul oceano com alto contraste',
    accentDark: '#38bdf8',
    accentLight: '#0369a1',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#818cf8',
    secondaryLight: '#4f46e5',
    tintDark: '#075985',
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    description: 'Safira limpa para sessões longas',
    accentDark: '#60a5fa',
    accentLight: '#1d4ed8',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#f87171',
    downLight: '#dc2626',
    secondaryDark: '#c084fc',
    secondaryLight: '#7e22ce',
    tintDark: '#1e3a8a',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    description: 'Ciano frio e leitura cristalina',
    accentDark: '#22d3ee',
    accentLight: '#0891b2',
    upDark: '#5eead4',
    upLight: '#0f766e',
    downDark: '#fda4af',
    downLight: '#e11d48',
    secondaryDark: '#a5b4fc',
    secondaryLight: '#4f46e5',
    tintDark: '#164e63',
  },
  {
    id: 'teal',
    name: 'Teal',
    description: 'Verde azulado equilibrado',
    accentDark: '#2dd4bf',
    accentLight: '#0f766e',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#67e8f9',
    secondaryLight: '#0e7490',
    tintDark: '#134e4a',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Esmeralda viva e objetiva',
    accentDark: '#34d399',
    accentLight: '#047857',
    upDark: '#4ade80',
    upLight: '#15803d',
    downDark: '#fb7185',
    downLight: '#dc2626',
    secondaryDark: '#2dd4bf',
    secondaryLight: '#0f766e',
    tintDark: '#064e3b',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Verde profundo de baixa fadiga',
    accentDark: '#4ade80',
    accentLight: '#166534',
    upDark: '#22c55e',
    upLight: '#15803d',
    downDark: '#fb7185',
    downLight: '#c2414b',
    secondaryDark: '#a3e635',
    secondaryLight: '#4d7c0f',
    tintDark: '#14532d',
  },
  {
    id: 'lime',
    name: 'Lime',
    description: 'Lima energético para momentum',
    accentDark: '#a3e635',
    accentLight: '#4d7c0f',
    upDark: '#84cc16',
    upLight: '#4d7c0f',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#facc15',
    secondaryLight: '#a16207',
    tintDark: '#365314',
  },
  {
    id: 'amber',
    name: 'Amber',
    description: 'Âmbar quente e confortável',
    accentDark: '#fbbf24',
    accentLight: '#b45309',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#fb923c',
    secondaryLight: '#c2410c',
    tintDark: '#78350f',
  },
  {
    id: 'gold',
    name: 'Gold',
    description: 'Dourado sóbrio para foco no preço',
    accentDark: '#facc15',
    accentLight: '#a16207',
    upDark: '#4ade80',
    upLight: '#15803d',
    downDark: '#f87171',
    downLight: '#dc2626',
    secondaryDark: '#fde68a',
    secondaryLight: '#b45309',
    tintDark: '#713f12',
  },
  {
    id: 'tangerine',
    name: 'Tangerine',
    description: 'Laranja nítido e contemporâneo',
    accentDark: '#fb923c',
    accentLight: '#c2410c',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#f43f5e',
    downLight: '#be123c',
    secondaryDark: '#fbbf24',
    secondaryLight: '#a16207',
    tintDark: '#7c2d12',
  },
  {
    id: 'coral',
    name: 'Coral',
    description: 'Coral suave com candles definidos',
    accentDark: '#fb7185',
    accentLight: '#e11d48',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#f87171',
    downLight: '#b91c1c',
    secondaryDark: '#f9a8d4',
    secondaryLight: '#be185d',
    tintDark: '#881337',
  },
  {
    id: 'ruby',
    name: 'Ruby',
    description: 'Rubi intenso com verde limpo',
    accentDark: '#f43f5e',
    accentLight: '#be123c',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#c084fc',
    secondaryLight: '#7e22ce',
    tintDark: '#881337',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    description: 'Vermelho profundo e preciso',
    accentDark: '#ef4444',
    accentLight: '#b91c1c',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#f87171',
    downLight: '#b91c1c',
    secondaryDark: '#fb923c',
    secondaryLight: '#c2410c',
    tintDark: '#7f1d1d',
  },
  {
    id: 'rose',
    name: 'Rose',
    description: 'Rosa moderno e bem contrastado',
    accentDark: '#fb7185',
    accentLight: '#be123c',
    upDark: '#5eead4',
    upLight: '#0f766e',
    downDark: '#f43f5e',
    downLight: '#be123c',
    secondaryDark: '#f0abfc',
    secondaryLight: '#a21caf',
    tintDark: '#831843',
  },
  {
    id: 'magenta',
    name: 'Magenta',
    description: 'Magenta vibrante sem perder leitura',
    accentDark: '#f472b6',
    accentLight: '#be185d',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#c084fc',
    secondaryLight: '#7e22ce',
    tintDark: '#701a75',
  },
  {
    id: 'orchid',
    name: 'Orchid',
    description: 'Orquídea elegante para baixa luz',
    accentDark: '#e879f9',
    accentLight: '#a21caf',
    upDark: '#5eead4',
    upLight: '#0f766e',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#a78bfa',
    secondaryLight: '#6d28d9',
    tintDark: '#701a75',
  },
  {
    id: 'violet',
    name: 'Violet',
    description: 'Violeta suave com alto contraste',
    accentDark: '#a78bfa',
    accentLight: '#6d28d9',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#60a5fa',
    secondaryLight: '#1d4ed8',
    tintDark: '#4c1d95',
  },
  {
    id: 'amethyst',
    name: 'Amethyst',
    description: 'Ametista profunda e sofisticada',
    accentDark: '#c084fc',
    accentLight: '#7e22ce',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#f0abfc',
    secondaryLight: '#a21caf',
    tintDark: '#581c87',
  },
  {
    id: 'indigo',
    name: 'Indigo',
    description: 'Índigo técnico para alta densidade',
    accentDark: '#818cf8',
    accentLight: '#4338ca',
    upDark: '#2dd4bf',
    upLight: '#0f766e',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#60a5fa',
    secondaryLight: '#1d4ed8',
    tintDark: '#312e81',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Azul noturno e discreto',
    accentDark: '#64748b',
    accentLight: '#334155',
    upDark: '#22d3ee',
    upLight: '#0e7490',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#818cf8',
    secondaryLight: '#4338ca',
    tintDark: '#172554',
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Ardósia neutra e profissional',
    accentDark: '#94a3b8',
    accentLight: '#475569',
    upDark: '#34d399',
    upLight: '#047857',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#67e8f9',
    secondaryLight: '#0e7490',
    tintDark: '#334155',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'Grafite minimalista e concentrado',
    accentDark: '#a1a1aa',
    accentLight: '#3f3f46',
    upDark: '#4ade80',
    upLight: '#15803d',
    downDark: '#f87171',
    downLight: '#dc2626',
    secondaryDark: '#d4d4d8',
    secondaryLight: '#52525b',
    tintDark: '#27272a',
    tintLight: '#71717a',
  },
  {
    id: 'nordic',
    name: 'Nordic',
    description: 'Paleta nórdica de baixa saturação',
    accentDark: '#88c0d0',
    accentLight: '#4c7190',
    upDark: '#a3be8c',
    upLight: '#4d7c0f',
    downDark: '#bf616a',
    downLight: '#a83242',
    secondaryDark: '#b48ead',
    secondaryLight: '#80577a',
    tintDark: '#2e3440',
    tintLight: '#d8dee9',
  },
  {
    id: 'solarized',
    name: 'Solarized',
    description: 'Contraste clássico e baixa fadiga',
    accentDark: '#268bd2',
    accentLight: '#006d9c',
    upDark: '#2aa198',
    upLight: '#087f76',
    downDark: '#dc4b45',
    downLight: '#c5221f',
    secondaryDark: '#b58900',
    secondaryLight: '#8b6c00',
    tintDark: '#073642',
    tintLight: '#eee8d5',
  },
  {
    id: 'tokyo',
    name: 'Tokyo Night',
    description: 'Azul elétrico com tons suaves',
    accentDark: '#7aa2f7',
    accentLight: '#34548a',
    upDark: '#9ece6a',
    upLight: '#587539',
    downDark: '#f7768e',
    downLight: '#b25563',
    secondaryDark: '#bb9af7',
    secondaryLight: '#735e9e',
    tintDark: '#1a1b26',
    tintLight: '#d5d6db',
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Roxo icônico com candles vivos',
    accentDark: '#bd93f9',
    accentLight: '#7445a8',
    upDark: '#50fa7b',
    upLight: '#168a3d',
    downDark: '#ff6e6e',
    downLight: '#c72c41',
    secondaryDark: '#ff79c6',
    secondaryLight: '#b12c7b',
    tintDark: '#282a36',
    tintLight: '#d7d2e0',
  },
  {
    id: 'monokai',
    name: 'Monokai',
    description: 'Verde ácido e rosa expressivo',
    accentDark: '#e6db74',
    accentLight: '#806d0d',
    upDark: '#a6e22e',
    upLight: '#4f7f00',
    downDark: '#f92672',
    downLight: '#c50d52',
    secondaryDark: '#ae81ff',
    secondaryLight: '#7144b5',
    tintDark: '#272822',
    tintLight: '#d9d8cf',
  },
  {
    id: 'copper',
    name: 'Copper',
    description: 'Cobre quente e acabamento sóbrio',
    accentDark: '#f59e6a',
    accentLight: '#b4532a',
    upDark: '#5eead4',
    upLight: '#0f766e',
    downDark: '#fb7185',
    downLight: '#be123c',
    secondaryDark: '#fbbf24',
    secondaryLight: '#a16207',
    tintDark: '#7c2d12',
    tintLight: '#c9a18b',
  },
  {
    id: 'icefire',
    name: 'Ice & Fire',
    description: 'Ciano gelado e vermelho intenso',
    accentDark: '#67e8f9',
    accentLight: '#0e7490',
    upDark: '#38f2c2',
    upLight: '#0f766e',
    downDark: '#ff6b6b',
    downLight: '#c81e3a',
    secondaryDark: '#60a5fa',
    secondaryLight: '#1d4ed8',
    tintDark: '#164e63',
  },
] as const satisfies readonly ThemeDefinition[]

export type ThemePresetId = typeof DEFINITIONS[number]['id']
export type ThemeMode = 'dark' | 'light'

export interface ThemePreset<TId extends string = string> {
  id: TId
  name: string
  description: string
  dark: ThemePalette
  light: ThemePalette
}

export interface ThemeVariantCustomization {
  accent: string
  candleUp: string
  candleDown: string
  chartBackground: string
  candleOpacity: number
  backgroundOpacity: number
}

export type CustomThemeId = `custom:${string}`
export type ThemeSelectionId = ThemePresetId | CustomThemeId

export interface CustomThemeDefinition {
  version: 1
  id: CustomThemeId
  name: string
  basePresetId: ThemePresetId
  createdAt: number
  dark: ThemeVariantCustomization
  light: ThemeVariantCustomization
}

function hexChannels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function channelHex(value: number): string {
  return Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, '0')
}

function mix(base: string, overlay: string, amount: number): string {
  const [baseR, baseG, baseB] = hexChannels(base)
  const [overlayR, overlayG, overlayB] = hexChannels(overlay)
  return `#${channelHex(baseR + ((overlayR - baseR) * amount))}${
    channelHex(baseG + ((overlayG - baseG) * amount))
  }${channelHex(baseB + ((overlayB - baseB) * amount))}`
}

function rgba(hex: string, alpha: number): string {
  const [red, green, blue] = hexChannels(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function relativeLuminance(hex: string): number {
  const channels = hexChannels(hex).map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return (
    (0.2126 * channels[0])
    + (0.7152 * channels[1])
    + (0.0722 * channels[2])
  )
}

function accentContrast(accent: string): string {
  return relativeLuminance(accent) > 0.46 ? '#071117' : '#ffffff'
}

function darkPalette(definition: ThemeDefinition): ThemePalette {
  const tint = definition.tintDark ?? definition.accentDark
  const accent = definition.accentDark
  const text = mix('#c9d5db', tint, 0.025)
  return {
    background: mix('#030e15', tint, 0.08),
    panel: mix('#071a24', tint, 0.08),
    panelRaised: mix('#0a222d', tint, 0.11),
    panelMuted: mix('#071d27', tint, 0.09),
    header: mix('#051722', tint, 0.08),
    workspace: mix('#031018', tint, 0.06),
    navigation: mix('#061923', tint, 0.10),
    control: mix('#081d28', tint, 0.11),
    input: mix('#061923', tint, 0.08),
    hover: mix('#0d2834', accent, 0.18),
    selected: mix('#0a3041', accent, 0.25),
    border: mix('#123440', accent, 0.12),
    borderSoft: mix('#0e2b36', accent, 0.10),
    text,
    textStrong: mix('#edf5f8', tint, 0.02),
    muted: mix('#728793', tint, 0.035),
    accent,
    accentHover: mix(accent, '#ffffff', 0.18),
    accentSoft: rgba(accent, 0.13),
    accentContrast: accentContrast(accent),
    positive: definition.upDark,
    negative: definition.downDark,
    secondary: definition.secondaryDark,
    warning: '#f4b740',
    chartBackground: mix('#061821', tint, 0.075),
    chartGrid: mix('#12303b', tint, 0.10),
    chartBorder: mix('#173744', accent, 0.10),
    chartText: mix('#8195a3', tint, 0.035),
    chartCrosshair: mix('#5b7280', accent, 0.08),
    chartCrosshairLabel: mix('#24414e', accent, 0.14),
    watermarkPrimary: rgba(text, 0.10),
    watermarkSecondary: rgba(text, 0.072),
    candleUp: definition.upDark,
    candleDown: definition.downDark,
    volumeUp: rgba(definition.upDark, 0.42),
    volumeDown: rgba(definition.downDark, 0.40),
  }
}

function lightPalette(definition: ThemeDefinition): ThemePalette {
  const tint = definition.tintLight ?? definition.accentLight
  const accent = definition.accentLight
  const text = mix('#263d48', tint, 0.025)
  return {
    background: mix('#e7eef1', tint, 0.035),
    panel: mix('#f9fcfd', tint, 0.018),
    panelRaised: mix('#edf4f6', tint, 0.045),
    panelMuted: mix('#f0f6f8', tint, 0.04),
    header: mix('#f5f9fa', tint, 0.035),
    workspace: mix('#d9e4e8', tint, 0.045),
    navigation: mix('#edf4f6', tint, 0.045),
    control: mix('#ffffff', tint, 0.025),
    input: mix('#ffffff', tint, 0.018),
    hover: mix('#dfecef', accent, 0.10),
    selected: mix('#d6eaf2', accent, 0.16),
    border: mix('#bfd0d7', accent, 0.08),
    borderSoft: mix('#d8e3e7', accent, 0.07),
    text,
    textStrong: mix('#203844', tint, 0.02),
    muted: mix('#657984', tint, 0.025),
    accent,
    accentHover: mix(accent, '#000000', 0.12),
    accentSoft: rgba(accent, 0.10),
    accentContrast: accentContrast(accent),
    positive: definition.upLight,
    negative: definition.downLight,
    secondary: definition.secondaryLight,
    warning: '#a96b00',
    chartBackground: mix('#f8fbfc', tint, 0.022),
    chartGrid: mix('#dce7eb', tint, 0.045),
    chartBorder: mix('#bfd0d7', accent, 0.07),
    chartText: mix('#526975', tint, 0.025),
    chartCrosshair: mix('#718995', accent, 0.06),
    chartCrosshairLabel: mix('#526975', accent, 0.10),
    watermarkPrimary: rgba(text, 0.085),
    watermarkSecondary: rgba(text, 0.062),
    candleUp: definition.upLight,
    candleDown: definition.downLight,
    volumeUp: rgba(definition.upLight, 0.36),
    volumeDown: rgba(definition.downLight, 0.34),
  }
}

export const themePresets: readonly ThemePreset<ThemePresetId>[] = DEFINITIONS.map(
  (definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    dark: darkPalette(definition),
    light: lightPalette(definition),
  }),
)

const presetMap = new Map(
  themePresets.map((preset) => [preset.id, preset]),
)

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = 'cryptopro'

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return typeof value === 'string' && presetMap.has(value as ThemePresetId)
}

export function getThemePreset(id: ThemePresetId): ThemePreset {
  return presetMap.get(id) ?? presetMap.get(DEFAULT_THEME_PRESET_ID)!
}

export function getThemePalette(
  id: ThemePresetId,
  mode: ThemeMode,
): ThemePalette {
  return getThemePreset(id)[mode]
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

function clampedOpacity(value: number): number {
  return Math.max(0.1, Math.min(1, value))
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value)
}

export function isCustomThemeId(value: unknown): value is CustomThemeId {
  return typeof value === 'string'
    && /^custom:[a-z0-9-]{6,80}$/i.test(value)
}

export function isThemeVariantCustomization(
  value: unknown,
): value is ThemeVariantCustomization {
  if (!value || typeof value !== 'object') {
    return false
  }
  const variant = value as Partial<ThemeVariantCustomization>
  return isHexColor(variant.accent)
    && isHexColor(variant.candleUp)
    && isHexColor(variant.candleDown)
    && isHexColor(variant.chartBackground)
    && typeof variant.candleOpacity === 'number'
    && Number.isFinite(variant.candleOpacity)
    && variant.candleOpacity >= 0.1
    && variant.candleOpacity <= 1
    && typeof variant.backgroundOpacity === 'number'
    && Number.isFinite(variant.backgroundOpacity)
    && variant.backgroundOpacity >= 0.1
    && variant.backgroundOpacity <= 1
}

export function isCustomThemeDefinition(
  value: unknown,
): value is CustomThemeDefinition {
  if (!value || typeof value !== 'object') {
    return false
  }
  const definition = value as Partial<CustomThemeDefinition>
  return definition.version === 1
    && isCustomThemeId(definition.id)
    && typeof definition.name === 'string'
    && definition.name.trim().length >= 2
    && definition.name.trim().length <= 32
    && isThemePresetId(definition.basePresetId)
    && typeof definition.createdAt === 'number'
    && Number.isFinite(definition.createdAt)
    && isThemeVariantCustomization(definition.dark)
    && isThemeVariantCustomization(definition.light)
}

export function defaultThemeCustomization(
  basePresetId: ThemePresetId,
  mode: ThemeMode,
): ThemeVariantCustomization {
  const palette = getThemePalette(basePresetId, mode)
  return {
    accent: palette.accent,
    candleUp: palette.positive,
    candleDown: palette.negative,
    chartBackground: palette.chartBackground,
    candleOpacity: 1,
    backgroundOpacity: 1,
  }
}

export function customizeThemePalette(
  base: ThemePalette,
  customization: ThemeVariantCustomization,
  mode: ThemeMode,
): ThemePalette {
  const accent = customization.accent
  const candleOpacity = clampedOpacity(customization.candleOpacity)
  const backgroundOpacity = clampedOpacity(customization.backgroundOpacity)
  const accentHover = mix(
    accent,
    mode === 'dark' ? '#ffffff' : '#000000',
    mode === 'dark' ? 0.18 : 0.12,
  )
  return {
    ...base,
    hover: mix(base.hover, accent, 0.15),
    selected: mix(base.selected, accent, 0.20),
    border: mix(base.border, accent, 0.08),
    borderSoft: mix(base.borderSoft, accent, 0.06),
    accent,
    accentHover,
    accentSoft: rgba(accent, mode === 'dark' ? 0.13 : 0.10),
    accentContrast: accentContrast(accent),
    positive: customization.candleUp,
    negative: customization.candleDown,
    chartBackground: rgba(
      customization.chartBackground,
      backgroundOpacity,
    ),
    chartBorder: mix(base.chartBorder, accent, 0.08),
    chartCrosshair: mix(base.chartCrosshair, accent, 0.08),
    chartCrosshairLabel: mix(base.chartCrosshairLabel, accent, 0.12),
    candleUp: rgba(customization.candleUp, candleOpacity),
    candleDown: rgba(customization.candleDown, candleOpacity),
    volumeUp: rgba(
      customization.candleUp,
      (mode === 'dark' ? 0.42 : 0.36) * candleOpacity,
    ),
    volumeDown: rgba(
      customization.candleDown,
      (mode === 'dark' ? 0.40 : 0.34) * candleOpacity,
    ),
  }
}

export function createCustomThemePreset(
  definition: CustomThemeDefinition,
): ThemePreset<CustomThemeId> {
  const base = getThemePreset(definition.basePresetId)
  return {
    id: definition.id,
    name: definition.name,
    description: 'Tema personalizado',
    dark: customizeThemePalette(base.dark, definition.dark, 'dark'),
    light: customizeThemePalette(base.light, definition.light, 'light'),
  }
}
