export interface ThemePalette {
  background: string
  panel: string
  panelRaised: string
  panelMuted: string
  /**
   * Floating panels sit on this, not on `panel`. Without a dimmed backdrop —
   * removed so the chart stays readable while parameters change — a 1px border
   * was the only boundary between a dialog and the chart behind it.
   */
  overlaySurface: string
  overlayBorder: string
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

/**
 * How the chrome ramp is retuned for a theme.
 *
 * The forty surface colours are written once, in the cool blue the app was
 * born with. A theme that wants another character does not restate them: it
 * declares a tone, and every surface is neutralised to the grey of the same
 * perceived lightness and then shifted towards the given hue. Lightness is
 * preserved, so the whole ramp — background, panels, borders, text — keeps the
 * contrast relationships that were tuned once.
 *
 * Omitting `hue` leaves pure greys, which is what a neutral theme is.
 */
interface SurfaceTone {
  hue?: string
  /** How far towards the hue's own chroma, 0 to 1. */
  amount?: number
  /**
   * Lightens (positive) or deepens (negative) the whole ramp, proportionally
   * to the room each surface still has. It is what separates three greys from
   * one: near-black, charcoal and slate are the same ramp at three depths.
   */
  lift?: number
}

interface ThemeDefinition {
  id: string
  name: string
  description: string
  /** Absent keeps the original cool ramp, untouched. */
  surface?: SurfaceTone
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
  /*
   * Neutral first: three depths of the same greyscale ramp, no hue anywhere in
   * the chrome. Candles keep their green and red — up and down are data, not
   * decoration, and a monochrome candle costs the reading it exists for.
   */
  {
    id: 'onyx',
    name: 'Ônix',
    description: 'Preto neutro, sem matiz',
    surface: { lift: -0.34 },
    accentDark: '#e4e4e4',
    accentLight: '#3d3d3d',
    upDark: '#63b37f',
    upLight: '#2c7d52',
    downDark: '#d4676f',
    downLight: '#bb3b46',
    secondaryDark: '#a8a8a8',
    secondaryLight: '#5c5c5c',
    tintDark: '#0a0a0a',
    tintLight: '#8f8f8f',
  },
  {
    id: 'carbon',
    name: 'Carbono',
    description: 'Cinza-chumbo neutro, contraste médio',
    surface: {},
    accentDark: '#d6d6d6',
    accentLight: '#454545',
    upDark: '#63b37f',
    upLight: '#2c7d52',
    downDark: '#d4676f',
    downLight: '#bb3b46',
    secondaryDark: '#9c9c9c',
    secondaryLight: '#616161',
    tintDark: '#343434',
    tintLight: '#a3a3a3',
  },
  {
    id: 'ash',
    name: 'Cinza',
    description: 'Cinza médio neutro, luz suave',
    surface: { lift: 0.17 },
    accentDark: '#c4c4c4',
    accentLight: '#4f4f4f',
    upDark: '#63b37f',
    upLight: '#2c7d52',
    downDark: '#d4676f',
    downLight: '#bb3b46',
    secondaryDark: '#949494',
    secondaryLight: '#6b6b6b',
    tintDark: '#5a5a5a',
    tintLight: '#b5b5b5',
  },
  {
    id: 'tradingview',
    name: 'TradingView',
    description: 'O padrão da TradingView, claro e escuro',
    surface: { hue: '#3f4c6b', amount: 0.42, lift: 0.05 },
    accentDark: '#2962ff',
    accentLight: '#2962ff',
    upDark: '#26a69a',
    upLight: '#26a69a',
    downDark: '#ef5350',
    downLight: '#ef5350',
    secondaryDark: '#7e57c2',
    secondaryLight: '#673ab7',
    tintDark: '#2a3245',
    tintLight: '#8c9bbd',
  },
  {
    id: 'paper',
    name: 'Papel',
    description: 'Branco quente de baixo ofuscamento',
    surface: { hue: '#a8763c', amount: 0.30 },
    accentDark: '#c99a5b',
    accentLight: '#2b6cb0',
    upDark: '#4fae7e',
    upLight: '#25794f',
    downDark: '#e0796d',
    downLight: '#bf3d34',
    secondaryDark: '#c0a080',
    secondaryLight: '#8a5a2b',
    tintDark: '#5a4426',
    tintLight: '#c9a978',
  },
  {
    id: 'mist',
    name: 'Névoa',
    description: 'Cinza-azulado claro, leitura nítida',
    surface: { hue: '#5b7a99', amount: 0.24 },
    accentDark: '#7aa7d9',
    accentLight: '#2563eb',
    upDark: '#4fb286',
    upLight: '#1f7a52',
    downDark: '#e07a83',
    downLight: '#c23b4a',
    secondaryDark: '#9db4cc',
    secondaryLight: '#4c6b8a',
    tintDark: '#33495e',
    tintLight: '#9db4cc',
  },
  {
    id: 'high-contrast',
    name: 'Alto Contraste',
    description: 'Máxima legibilidade em ambiente claro',
    surface: { hue: '#6b7280', amount: 0.10, lift: 0.06 },
    accentDark: '#7fb3ff',
    accentLight: '#0b4fc4',
    upDark: '#3fd18b',
    upLight: '#00713d',
    downDark: '#ff7b7b',
    downLight: '#c00000',
    secondaryDark: '#c4b5fd',
    secondaryLight: '#4c2f9e',
    tintDark: '#1c1c1c',
    tintLight: '#dcdcdc',
  },
  {
    id: 'sepia',
    name: 'Sépia',
    description: 'Âmbar suave para sessões longas',
    surface: { hue: '#8a5a2b', amount: 0.42, lift: 0.02 },
    accentDark: '#d8a15a',
    accentLight: '#8a5a2b',
    upDark: '#7fa86a',
    upLight: '#4d6f2f',
    downDark: '#cf7060',
    downLight: '#a63a28',
    secondaryDark: '#b99b7a',
    secondaryLight: '#6f4a2a',
    tintDark: '#4a3520',
    tintLight: '#cbb08a',
  },
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

/** sRGB channel to linear light, for luminance that matches perception. */
function toLinear(channel: number): number {
  const scaled = channel / 255
  return scaled <= 0.04045
    ? scaled / 12.92
    : ((scaled + 0.055) / 1.055) ** 2.4
}

function fromLinear(value: number): number {
  const scaled = value <= 0.0031308
    ? value * 12.92
    : (1.055 * (value ** (1 / 2.4))) - 0.055
  return scaled * 255
}

/** The grey a colour would be if its hue were removed but its lightness kept. */
function grayValue(hex: string): number {
  const [red, green, blue] = hexChannels(hex)
  return fromLinear(
    (0.2126 * toLinear(red))
    + (0.7152 * toLinear(green))
    + (0.0722 * toLinear(blue)),
  )
}

/**
 * Retunes one surface colour: strip the hue, then add back the hue offsets of
 * the tone. Adding offsets rather than mixing towards a colour is what keeps
 * the ramp usable at both ends — mixing a near-white towards a dark blue would
 * darken it, and the light theme would lose its light surfaces.
 */
function toned(hex: string, tone: SurfaceTone | undefined): string {
  if (!tone) {
    return hex
  }
  const plain = grayValue(hex)
  const lift = tone.lift ?? 0
  const gray = lift === 0
    ? plain
    : plain + (lift * (lift > 0 ? 255 - plain : plain))
  if (!tone.hue) {
    const channel = channelHex(gray)
    return `#${channel}${channel}${channel}`
  }
  /*
   * The same chroma offset reads mildly on a mid grey and garishly on a near
   * black, where it is most of the colour. Attenuating at the dark end keeps a
   * warm theme warm without turning its deepest surfaces brown.
   */
  const attenuated = Math.min(1, Math.max(0.5, gray / 48))
  const amount = (tone.amount ?? 0.4) * attenuated
  const [hueR, hueG, hueB] = hexChannels(tone.hue)
  const hueGray = grayValue(tone.hue)
  return `#${channelHex(gray + ((hueR - hueGray) * amount))}${
    channelHex(gray + ((hueG - hueGray) * amount))
  }${channelHex(gray + ((hueB - hueGray) * amount))}`
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
  const surface = (hex: string): string => toned(hex, definition.surface)
  const tint = surface(definition.tintDark ?? definition.accentDark)
  const accent = definition.accentDark
  const text = mix(surface('#c9d5db'), tint, 0.025)
  return {
    background: mix(surface('#030e15'), tint, 0.08),
    panel: mix(surface('#071a24'), tint, 0.08),
    panelRaised: mix(surface('#0a222d'), tint, 0.11),
    panelMuted: mix(surface('#071d27'), tint, 0.09),
    // Dark theme: elevating means moving towards the light.
    overlaySurface: mix(mix(surface('#132c38'), tint, 0.10), '#ffffff', 0.04),
    overlayBorder: mix(mix(surface('#385c6c'), tint, 0.10), accent, 0.18),
    header: mix(surface('#051722'), tint, 0.08),
    workspace: mix(surface('#031018'), tint, 0.06),
    navigation: mix(surface('#061923'), tint, 0.10),
    control: mix(surface('#081d28'), tint, 0.11),
    input: mix(surface('#061923'), tint, 0.08),
    hover: mix(surface('#0d2834'), accent, 0.18),
    selected: mix(surface('#0a3041'), accent, 0.25),
    border: mix(surface('#123440'), accent, 0.12),
    borderSoft: mix(surface('#0e2b36'), accent, 0.10),
    text,
    textStrong: mix(surface('#edf5f8'), tint, 0.02),
    muted: mix(surface('#728793'), tint, 0.035),
    accent,
    accentHover: mix(accent, '#ffffff', 0.18),
    accentSoft: rgba(accent, 0.13),
    accentContrast: accentContrast(accent),
    positive: definition.upDark,
    negative: definition.downDark,
    secondary: definition.secondaryDark,
    warning: '#f4b740',
    chartBackground: mix(surface('#061821'), tint, 0.075),
    chartGrid: mix(surface('#12303b'), tint, 0.10),
    chartBorder: mix(surface('#173744'), accent, 0.10),
    chartText: mix(surface('#8195a3'), tint, 0.035),
    chartCrosshair: mix(surface('#5b7280'), accent, 0.08),
    chartCrosshairLabel: mix(surface('#24414e'), accent, 0.14),
    watermarkPrimary: rgba(text, 0.10),
    watermarkSecondary: rgba(text, 0.072),
    candleUp: definition.upDark,
    candleDown: definition.downDark,
    volumeUp: rgba(definition.upDark, 0.42),
    volumeDown: rgba(definition.downDark, 0.40),
  }
}

function lightPalette(definition: ThemeDefinition): ThemePalette {
  const surface = (hex: string): string => toned(hex, definition.surface)
  const tint = surface(definition.tintLight ?? definition.accentLight)
  const accent = definition.accentLight
  const text = mix(surface('#263d48'), tint, 0.025)
  return {
    background: mix(surface('#e7eef1'), tint, 0.035),
    panel: mix(surface('#f9fcfd'), tint, 0.018),
    panelRaised: mix(surface('#edf4f6'), tint, 0.045),
    panelMuted: mix(surface('#f0f6f8'), tint, 0.04),
    /*
     * Light theme: the workspace panels are already near-white, so elevating
     * has to darken. A soft grey reads as "above" without shouting; reusing
     * the dark theme's direction would make the dialog vanish.
     */
    overlaySurface: mix(mix(surface('#e9eff2'), tint, 0.03), '#000000', 0.012),
    overlayBorder: mix(mix(surface('#94a9b4'), tint, 0.10), accent, 0.20),
    header: mix(surface('#f5f9fa'), tint, 0.035),
    workspace: mix(surface('#d9e4e8'), tint, 0.045),
    navigation: mix(surface('#edf4f6'), tint, 0.045),
    control: mix(surface('#ffffff'), tint, 0.025),
    input: mix(surface('#ffffff'), tint, 0.018),
    hover: mix(surface('#dfecef'), accent, 0.10),
    selected: mix(surface('#d6eaf2'), accent, 0.16),
    border: mix(surface('#bfd0d7'), accent, 0.08),
    borderSoft: mix(surface('#d8e3e7'), accent, 0.07),
    text,
    textStrong: mix(surface('#203844'), tint, 0.02),
    muted: mix(surface('#657984'), tint, 0.025),
    accent,
    accentHover: mix(accent, '#000000', 0.12),
    accentSoft: rgba(accent, 0.10),
    accentContrast: accentContrast(accent),
    positive: definition.upLight,
    negative: definition.downLight,
    secondary: definition.secondaryLight,
    warning: '#a96b00',
    chartBackground: mix(surface('#f8fbfc'), tint, 0.022),
    chartGrid: mix(surface('#dce7eb'), tint, 0.045),
    chartBorder: mix(surface('#bfd0d7'), accent, 0.07),
    chartText: mix(surface('#526975'), tint, 0.025),
    chartCrosshair: mix(surface('#718995'), accent, 0.06),
    chartCrosshairLabel: mix(surface('#526975'), accent, 0.10),
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
