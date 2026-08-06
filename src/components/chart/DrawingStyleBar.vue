<script setup lang="ts">
import {
  Check,
  ChevronDown,
  Palette,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from '@lucide/vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  shallowRef,
  useId,
  watch,
} from 'vue'
import type {
  ChartDrawing,
  DrawingConfiguration,
  DrawingLineStyle,
} from '@/domain/chartDrawings'
import {
  DRAWING_COLORS,
  DRAWING_DEFAULT_COLOR,
  DRAWING_DEFAULT_LINE_STYLE,
  DRAWING_DEFAULT_NEGATIVE_COLOR,
  DRAWING_DEFAULT_POSITIVE_COLOR,
  DRAWING_DEFAULT_WIDTH,
  DRAWING_LINE_STYLES,
  DRAWING_LINE_WIDTHS,
  DRAWING_TOOL_LABELS,
  drawingStyleCapabilities,
} from '@/domain/chartDrawings'
import DrawingPropertiesEditor from './DrawingPropertiesEditor.vue'
import DrawingToolIcon from './DrawingToolIcon.vue'

const props = defineProps<{ drawing: ChartDrawing }>()

const emit = defineEmits<{
  restyle: [style: {
    color?: string
    lineWidth?: number
    lineStyle?: DrawingLineStyle
  }]
  configure: [configuration: DrawingConfiguration]
  remove: []
  close: []
}>()

type StyleSection = 'color' | 'width' | 'line-style' | 'properties'

const POPOVER_NAVIGATION_KEYS = new Set([
  'ArrowDown',
  'ArrowRight',
  'ArrowUp',
  'ArrowLeft',
  'Home',
  'End',
])

const inspector = shallowRef<HTMLElement | null>(null)
const openSection = shallowRef<StyleSection | null>(null)
const componentId = useId().replaceAll(':', '')
const colors = DRAWING_COLORS
const widths = DRAWING_LINE_WIDTHS
const lineStyles = DRAWING_LINE_STYLES

const label = computed(() => DRAWING_TOOL_LABELS[props.drawing.tool])
const capabilities = computed(() => (
  drawingStyleCapabilities(props.drawing.tool)
))
const selectedLineStyle = computed(() => (
  props.drawing.lineStyle ?? DRAWING_DEFAULT_LINE_STYLE
))
const selectedLineStyleOption = computed(() => {
  const selected = lineStyles.find(({ id }) => id === selectedLineStyle.value)
  return selected ?? lineStyles[0]
})
const selectedColor = computed(() => props.drawing.color.toLowerCase())
const hasProperties = computed(() => (
  capabilities.value.levels
  || capabilities.value.signedColors
  || capabilities.value.text
))
const positiveColor = computed(() => {
  const configured = props.drawing.configuration?.positiveColor
  return configured ?? DRAWING_DEFAULT_POSITIVE_COLOR
})
const negativeColor = computed(() => {
  const configured = props.drawing.configuration?.negativeColor
  return configured ?? DRAWING_DEFAULT_NEGATIVE_COLOR
})

function triggerId(section: StyleSection): string {
  return `${componentId}-${section}`
}

function panelId(section: StyleSection): string {
  return `${triggerId(section)}-panel`
}

function addDismissListeners(): void {
  document.addEventListener('pointerdown', handleOutsidePointerDown)
  document.addEventListener('keydown', handleMenuKeydown, true)
}

function removeDismissListeners(): void {
  document.removeEventListener('pointerdown', handleOutsidePointerDown)
  document.removeEventListener('keydown', handleMenuKeydown, true)
}

function closeSection(restoreFocus = false): void {
  const section = openSection.value
  if (!section) {
    return
  }
  openSection.value = null
  removeDismissListeners()
  if (restoreFocus) {
    void nextTick(() => document.getElementById(triggerId(section))?.focus())
  }
}

function toggleSection(section: StyleSection): void {
  if (openSection.value === section) {
    closeSection(true)
    return
  }
  if (!openSection.value) {
    addDismissListeners()
  }
  openSection.value = section
  void nextTick(() => {
    const panel = document.getElementById(panelId(section))
    const selected = panel?.querySelector<HTMLElement>('[aria-checked="true"]')
    const first = panel?.querySelector<HTMLElement>(
      '[role="menuitemradio"], input, textarea, button',
    )
    const itemToFocus = selected ?? first
    itemToFocus?.focus()
  })
}

function openProperties(): void {
  if (!hasProperties.value || openSection.value === 'properties') {
    return
  }
  toggleSection('properties')
}

function handleOutsidePointerDown(event: PointerEvent): void {
  const isInside = event.target instanceof Node
    && inspector.value?.contains(event.target)
  if (isInside) {
    return
  }
  closeSection()
}

function handleMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !openSection.value) {
    return
  }
  // MarketChart also owns Escape. The open selector gets first refusal, so
  // one key closes the selector and a second one deselects the drawing.
  event.preventDefault()
  event.stopImmediatePropagation()
  closeSection(true)
}

function handlePopoverKeydown(event: KeyboardEvent): void {
  if (!POPOVER_NAVIGATION_KEYS.has(event.key)) {
    return
  }
  const panel = event.currentTarget as HTMLElement
  const items = Array.from(
    panel.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  )
  if (items.length === 0) {
    return
  }
  event.preventDefault()
  const focused = document.activeElement as HTMLElement
  const current = Math.max(0, items.indexOf(focused))
  let next = current
  if (event.key === 'Home') {
    next = 0
  } else if (event.key === 'End') {
    next = items.length - 1
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % items.length
  } else {
    next = (current - 1 + items.length) % items.length
  }
  items[next].focus()
}

function chooseColor(color: string): void {
  emit('restyle', { color })
  closeSection(true)
}

function chooseCustomColor(event: Event): void {
  const color = (event.currentTarget as HTMLInputElement).value
  emit('restyle', { color })
  closeSection(true)
}

function chooseWidth(lineWidth: number): void {
  emit('restyle', { lineWidth })
  closeSection(true)
}

function chooseLineStyle(lineStyle: DrawingLineStyle): void {
  emit('restyle', { lineStyle })
  closeSection(true)
}

function applyConfiguration(configuration: DrawingConfiguration): void {
  emit('configure', configuration)
  closeSection(true)
}

function resetStyle(): void {
  const style: {
    color?: string
    lineWidth: number
    lineStyle?: DrawingLineStyle
  } = { lineWidth: DRAWING_DEFAULT_WIDTH }
  if (capabilities.value.color) {
    style.color = DRAWING_DEFAULT_COLOR
  }
  if (capabilities.value.lineStyle) {
    style.lineStyle = DRAWING_DEFAULT_LINE_STYLE
  }
  emit('restyle', style)
  closeSection()
}

watch(() => props.drawing.id, () => closeSection())
onBeforeUnmount(removeDismissListeners)

defineExpose({ openProperties })
</script>

<template>
  <div
    ref="inspector"
    class="drawing-inspector"
    role="toolbar"
    :aria-label="`Configurar ${label}`"
  >
    <div class="drawing-inspector__identity" :title="label">
      <DrawingToolIcon :tool="drawing.tool" />
      <span>
        <small>Desenho selecionado</small>
        <strong>{{ label }}</strong>
      </span>
    </div>

    <span class="drawing-inspector__separator" aria-hidden="true" />

    <div v-if="capabilities.color" class="drawing-style-field">
      <button
        :id="triggerId('color')"
        class="drawing-style-control"
        type="button"
        :aria-controls="panelId('color')"
        :aria-expanded="openSection === 'color'"
        aria-haspopup="menu"
        title="Alterar cor"
        @click="toggleSection('color')"
      >
        <i
          class="drawing-current-color"
          :style="{ '--drawing-color': drawing.color }"
        />
        <span>Cor</span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div
        v-if="openSection === 'color'"
        :id="panelId('color')"
        class="drawing-style-popover drawing-color-popover"
        role="menu"
        aria-label="Cor da linha"
        @keydown="handlePopoverKeydown"
      >
        <header>
          <strong>Cor da linha</strong>
          <small>{{ drawing.color.toUpperCase() }}</small>
        </header>
        <div class="drawing-color-grid" role="group" aria-label="Paleta">
          <button
            v-for="color in colors"
            :key="color"
            class="drawing-color-option"
            :class="{ active: selectedColor === color.toLowerCase() }"
            :style="{ '--drawing-color': color }"
            type="button"
            role="menuitemradio"
            :aria-label="`Usar a cor ${color}`"
            :aria-checked="selectedColor === color.toLowerCase()"
            @click="chooseColor(color)"
          >
            <Check
              v-if="selectedColor === color.toLowerCase()"
              aria-hidden="true"
            />
          </button>
        </div>
        <label class="drawing-custom-color">
          <Palette aria-hidden="true" />
          <span>Cor personalizada</span>
          <i :style="{ '--drawing-color': drawing.color }" />
          <input
            class="drawing-native-color"
            type="color"
            :value="drawing.color"
            aria-label="Escolher uma cor personalizada"
            @change="chooseCustomColor"
          >
        </label>
      </div>
    </div>

    <div
      v-else-if="capabilities.levels"
      class="drawing-style-control drawing-level-colors"
      title="Este desenho usa cores independentes por nível"
    >
      <Palette aria-hidden="true" />
      <span>Cores por níveis</span>
    </div>

    <div
      v-else-if="capabilities.signedColors"
      class="drawing-style-control drawing-level-colors"
      title="Cores para resultados positivos e negativos"
    >
      <span class="drawing-signed-color-pair" aria-hidden="true">
        <i :style="{ '--drawing-color': positiveColor }" />
        <i :style="{ '--drawing-color': negativeColor }" />
      </span>
      <span>Cores por resultado</span>
    </div>

    <div class="drawing-style-field">
      <button
        :id="triggerId('width')"
        class="drawing-style-control"
        type="button"
        :aria-controls="panelId('width')"
        :aria-expanded="openSection === 'width'"
        aria-haspopup="menu"
        title="Alterar espessura"
        @click="toggleSection('width')"
      >
        <i
          class="drawing-line-preview"
          data-line-style="0"
          :style="{ '--drawing-line-width': `${drawing.lineWidth}px` }"
        />
        <span>{{ drawing.lineWidth }} px</span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div
        v-if="openSection === 'width'"
        :id="panelId('width')"
        class="drawing-style-popover"
        role="menu"
        aria-label="Espessura da linha"
        @keydown="handlePopoverKeydown"
      >
        <header>
          <strong>Espessura</strong>
          <small>{{ drawing.lineWidth }} px</small>
        </header>
        <button
          v-for="width in widths"
          :key="width"
          class="drawing-style-option"
          :class="{ active: drawing.lineWidth === width }"
          type="button"
          role="menuitemradio"
          :aria-checked="drawing.lineWidth === width"
          @click="chooseWidth(width)"
        >
          <i
            class="drawing-line-preview"
            data-line-style="0"
            :style="{ '--drawing-line-width': `${width}px` }"
          />
          <span>{{ width }} px</span>
          <Check v-if="drawing.lineWidth === width" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="capabilities.lineStyle" class="drawing-style-field">
      <button
        :id="triggerId('line-style')"
        class="drawing-style-control"
        type="button"
        :aria-controls="panelId('line-style')"
        :aria-expanded="openSection === 'line-style'"
        aria-haspopup="menu"
        title="Alterar estilo da linha"
        @click="toggleSection('line-style')"
      >
        <i
          class="drawing-line-preview"
          :data-line-style="selectedLineStyle"
          :style="{ '--drawing-line-width': '2px' }"
        />
        <span>{{ selectedLineStyleOption.label }}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div
        v-if="openSection === 'line-style'"
        :id="panelId('line-style')"
        class="drawing-style-popover drawing-line-style-popover"
        role="menu"
        aria-label="Estilo da linha"
        @keydown="handlePopoverKeydown"
      >
        <header>
          <strong>Estilo da linha</strong>
        </header>
        <button
          v-for="option in lineStyles"
          :key="option.id"
          class="drawing-style-option"
          :class="{ active: selectedLineStyle === option.id }"
          type="button"
          role="menuitemradio"
          :aria-checked="selectedLineStyle === option.id"
          @click="chooseLineStyle(option.id)"
        >
          <i
            class="drawing-line-preview"
            :data-line-style="option.id"
            :style="{ '--drawing-line-width': '2px' }"
          />
          <span>{{ option.label }}</span>
          <Check v-if="selectedLineStyle === option.id" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="hasProperties" class="drawing-style-field">
      <button
        :id="triggerId('properties')"
        class="drawing-style-control"
        type="button"
        :aria-controls="panelId('properties')"
        :aria-expanded="openSection === 'properties'"
        aria-haspopup="dialog"
        title="Configurações avançadas"
        @click="toggleSection('properties')"
      >
        <Settings2 aria-hidden="true" />
        <span>Opções</span>
        <ChevronDown aria-hidden="true" />
      </button>

      <div
        v-if="openSection === 'properties'"
        :id="panelId('properties')"
        class="drawing-style-popover drawing-properties-popover"
        role="dialog"
        :aria-label="`Configurações de ${label}`"
      >
        <DrawingPropertiesEditor
          :drawing="drawing"
          @apply="applyConfiguration"
          @close="closeSection(true)"
        />
      </div>
    </div>

    <span class="drawing-inspector__separator" aria-hidden="true" />

    <button
      class="drawing-inspector__action"
      aria-label="Restaurar estilo padrão"
      title="Restaurar estilo padrão"
      type="button"
      @click="resetStyle"
    >
      <RotateCcw aria-hidden="true" />
    </button>
    <button
      class="drawing-inspector__action danger"
      aria-label="Excluir desenho"
      title="Excluir desenho (Delete)"
      type="button"
      @click="emit('remove')"
    >
      <Trash2 aria-hidden="true" />
    </button>
    <button
      class="drawing-inspector__action"
      aria-label="Fechar configurações"
      title="Fechar (Esc)"
      type="button"
      @click="emit('close')"
    >
      <X aria-hidden="true" />
    </button>
  </div>
</template>
