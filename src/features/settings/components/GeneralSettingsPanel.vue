<script setup lang="ts">
import {
  Check,
  Maximize2,
  Moon,
  Move,
  Plug,
  Plus,
  SlidersHorizontal,
  Sun,
  SwatchBook,
  Trash2,
  X,
} from '@lucide/vue'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  appTheme,
  appThemePreset,
  customThemePresets,
  deleteCustomTheme,
  setTheme,
  setThemePreset,
} from '@settings/services/theme'
import {
  isCustomThemeId,
  themePresets,
  type CustomThemeId,
  type ThemeSelectionId,
} from '@settings/services/themeCatalog'
import CustomThemeEditor from './CustomThemeEditor.vue'
import ThemePresetPreview from './ThemePresetPreview.vue'
import ProviderAccountsPanel
  from '@providers/components/ProviderAccountsPanel.vue'
import { useSecuritySession } from '@security/services/securitySession'
import SecurityPreferencesPanel from './SecurityPreferencesPanel.vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  requestAccess: []
}>()

type SettingsSection = 'appearance' | 'general' | 'providers'
type ResizeEdge = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface WindowRect {
  left: number
  top: number
  width: number
  height: number
}

interface PointerOperation {
  kind: 'drag' | 'resize'
  pointerId: number
  startX: number
  startY: number
  startRect: WindowRect
  edge?: ResizeEdge
  nextRect: WindowRect
  captureTarget: HTMLElement
}

const WINDOW_LAYOUT_STORAGE_KEY = 'cryptopro.settings-window.v1'
const WINDOW_MARGIN = 8
const WINDOW_MIN_WIDTH = 620
const WINDOW_MIN_HEIGHT = 480

const activeSection = ref<SettingsSection>('appearance')
const security = useSecuritySession()
const editingTheme = ref(false)
const pendingDelete = ref<CustomThemeId | null>(null)
const panel = ref<HTMLElement | null>(null)
const resizeFrame = ref<HTMLElement | null>(null)
/** The geometry the user chose, kept whole even when it no longer fits. */
let preferredRect: WindowRect | undefined
/** The clamped geometry actually on screen. */
let currentRect: WindowRect | undefined
let operation: PointerOperation | undefined
let animationFrame = 0
let nextPointerX = 0
let nextPointerY = 0
let deleteConfirmationTimer = 0

const paletteCards = computed(() => [
  ...customThemePresets.value,
  ...themePresets,
].map((preset) => ({
  ...preset,
  custom: isCustomThemeId(preset.id),
  preview: preset[appTheme.value],
})))

function selectPreset(preset: ThemeSelectionId): void {
  setThemePreset(preset)
}

function selectSection(section: SettingsSection): void {
  activeSection.value = section
  editingTheme.value = false
}

function removeCustomTheme(id: CustomThemeId): void {
  if (pendingDelete.value === id) {
    window.clearTimeout(deleteConfirmationTimer)
    pendingDelete.value = null
    deleteCustomTheme(id)
    return
  }
  pendingDelete.value = id
  window.clearTimeout(deleteConfirmationTimer)
  deleteConfirmationTimer = window.setTimeout(() => {
    pendingDelete.value = null
  }, 4000)
}

function defaultWindowRect(): WindowRect {
  const width = Math.min(780, window.innerWidth - (WINDOW_MARGIN * 2))
  const height = Math.min(760, window.innerHeight - 90)
  return clampWindowRect({
    left: window.innerWidth - width - 12,
    top: 58,
    width,
    height,
  })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function clampWindowRect(rect: WindowRect): WindowRect {
  const maximumWidth = Math.max(
    WINDOW_MIN_WIDTH,
    window.innerWidth - (WINDOW_MARGIN * 2),
  )
  const maximumHeight = Math.max(
    WINDOW_MIN_HEIGHT,
    window.innerHeight - (WINDOW_MARGIN * 2),
  )
  const width = Math.min(maximumWidth, Math.max(WINDOW_MIN_WIDTH, rect.width))
  const height = Math.min(
    maximumHeight,
    Math.max(WINDOW_MIN_HEIGHT, rect.height),
  )
  return {
    left: clamp(
      rect.left,
      WINDOW_MARGIN,
      Math.max(WINDOW_MARGIN, window.innerWidth - width - WINDOW_MARGIN),
    ),
    top: clamp(
      rect.top,
      WINDOW_MARGIN,
      Math.max(WINDOW_MARGIN, window.innerHeight - height - WINDOW_MARGIN),
    ),
    width,
    height,
  }
}

function loadWindowRect(): WindowRect {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(WINDOW_LAYOUT_STORAGE_KEY) ?? 'null',
    )
    if (!value || typeof value !== 'object') {
      return defaultWindowRect()
    }
    const stored = value as Partial<WindowRect>
    if (
      !Number.isFinite(stored.left)
      || !Number.isFinite(stored.top)
      || !Number.isFinite(stored.width)
      || !Number.isFinite(stored.height)
    ) {
      return defaultWindowRect()
    }
    // Returned unclamped: this is the preference, and the current viewport
    // decides how much of it is shown, not how much of it is remembered.
    return stored as WindowRect
  } catch {
    return defaultWindowRect()
  }
}

function persistWindowRect(rect: WindowRect): void {
  try {
    window.localStorage.setItem(
      WINDOW_LAYOUT_STORAGE_KEY,
      JSON.stringify(rect),
    )
  } catch {
    // The current session still keeps the chosen window geometry.
  }
}

function applyWindowRect(rect: WindowRect): void {
  if (!panel.value) {
    return
  }
  currentRect = rect
  panel.value.style.left = `${rect.left}px`
  panel.value.style.top = `${rect.top}px`
  panel.value.style.width = `${rect.width}px`
  panel.value.style.height = `${rect.height}px`
  panel.value.style.right = 'auto'
  panel.value.style.bottom = 'auto'
}

/** Records a geometry the user asked for and shows as much of it as fits. */
function commitWindowRect(rect: WindowRect): void {
  preferredRect = rect
  applyWindowRect(clampWindowRect(rect))
  persistWindowRect(rect)
}

function resetWindowRect(): void {
  commitWindowRect(defaultWindowRect())
}

function panelRect(): WindowRect {
  const rect = panel.value?.getBoundingClientRect()
  return rect
    ? {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }
    : currentRect ?? defaultWindowRect()
}

function beginDrag(event: PointerEvent): void {
  if (
    event.button !== 0
    || (event.target as Element).closest('button, input, select')
  ) {
    return
  }
  event.preventDefault()
  startPointerOperation(event, 'drag')
}

function beginResize(event: PointerEvent, edge: ResizeEdge): void {
  if (event.button !== 0) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  startPointerOperation(event, 'resize', edge)
}

function startPointerOperation(
  event: PointerEvent,
  kind: PointerOperation['kind'],
  edge?: ResizeEdge,
): void {
  const startRect = panelRect()
  const captureTarget = event.currentTarget as HTMLElement
  captureTarget.setPointerCapture(event.pointerId)
  operation = {
    kind,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startRect,
    edge,
    nextRect: startRect,
    captureTarget,
  }
  nextPointerX = event.clientX
  nextPointerY = event.clientY
  panel.value?.classList.add(`is-${kind}`)
  if (kind === 'resize') {
    showResizeFrame(startRect)
  }
  window.addEventListener('pointermove', handlePointerMove, { passive: true })
  window.addEventListener('pointerup', finishPointerOperation)
  window.addEventListener('pointercancel', finishPointerOperation)
}

function handlePointerMove(event: PointerEvent): void {
  if (!operation || event.pointerId !== operation.pointerId) {
    return
  }
  nextPointerX = event.clientX
  nextPointerY = event.clientY
  if (!animationFrame) {
    animationFrame = requestAnimationFrame(renderPointerOperation)
  }
}

function renderPointerOperation(): void {
  animationFrame = 0
  if (!operation || !panel.value) {
    return
  }
  const deltaX = nextPointerX - operation.startX
  const deltaY = nextPointerY - operation.startY
  if (operation.kind === 'drag') {
    const target = clampWindowRect({
      ...operation.startRect,
      left: operation.startRect.left + deltaX,
      top: operation.startRect.top + deltaY,
    })
    operation.nextRect = target
    panel.value.style.transform = `translate3d(${
      target.left - operation.startRect.left
    }px, ${target.top - operation.startRect.top}px, 0)`
    return
  }
  const target = resizedWindowRect(
    operation.startRect,
    operation.edge!,
    deltaX,
    deltaY,
  )
  operation.nextRect = target
  showResizeFrame(target)
}

function resizedWindowRect(
  start: WindowRect,
  edge: ResizeEdge,
  deltaX: number,
  deltaY: number,
): WindowRect {
  let left = start.left
  let top = start.top
  let right = start.left + start.width
  let bottom = start.top + start.height

  if (edge.includes('w')) {
    left = clamp(
      start.left + deltaX,
      WINDOW_MARGIN,
      right - WINDOW_MIN_WIDTH,
    )
  }
  if (edge.includes('e')) {
    right = clamp(
      right + deltaX,
      left + WINDOW_MIN_WIDTH,
      window.innerWidth - WINDOW_MARGIN,
    )
  }
  if (edge.includes('n')) {
    top = clamp(
      start.top + deltaY,
      WINDOW_MARGIN,
      bottom - WINDOW_MIN_HEIGHT,
    )
  }
  if (edge.includes('s')) {
    bottom = clamp(
      bottom + deltaY,
      top + WINDOW_MIN_HEIGHT,
      window.innerHeight - WINDOW_MARGIN,
    )
  }
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

function showResizeFrame(rect: WindowRect): void {
  if (!resizeFrame.value) {
    return
  }
  resizeFrame.value.hidden = false
  resizeFrame.value.style.left = `${rect.left}px`
  resizeFrame.value.style.top = `${rect.top}px`
  resizeFrame.value.style.width = `${rect.width}px`
  resizeFrame.value.style.height = `${rect.height}px`
  resizeFrame.value.dataset.size = (
    `${Math.round(rect.width)} × ${Math.round(rect.height)}`
  )
}

/** Undoes everything `startPointerOperation` put in place, in either exit. */
function releasePointerOperation(): void {
  if (!operation) {
    return
  }
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
  }
  if (operation.captureTarget.hasPointerCapture(operation.pointerId)) {
    operation.captureTarget.releasePointerCapture(operation.pointerId)
  }
  panel.value?.classList.remove(`is-${operation.kind}`)
  if (panel.value) {
    panel.value.style.transform = ''
  }
  if (resizeFrame.value) {
    resizeFrame.value.hidden = true
  }
  operation = undefined
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', finishPointerOperation)
  window.removeEventListener('pointercancel', finishPointerOperation)
}

function finishPointerOperation(event: PointerEvent): void {
  if (!operation || event.pointerId !== operation.pointerId) {
    return
  }
  if (animationFrame) {
    // The last move may still be pending: render it so the committed rect is
    // the one under the pointer, not the one from the previous frame.
    cancelAnimationFrame(animationFrame)
    animationFrame = 0
    renderPointerOperation()
  }
  const finalRect = operation.nextRect
  releasePointerOperation()
  commitWindowRect(finalRect)
}

function handleViewportResize(): void {
  if (!props.open || operation) {
    return
  }
  // Re-fit only. Persisting the clamped rect here would let a narrowed app
  // window overwrite the geometry the user chose, and widening it again would
  // not bring it back — the same rule `useResizableSidebar` follows.
  applyWindowRect(clampWindowRect(
    preferredRect ?? currentRect ?? panelRect(),
  ))
}

function handleWindowKey(event: KeyboardEvent): void {
  if (props.open && event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

function handlePanelKey(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void nextTick(() => {
        if (!preferredRect) {
          preferredRect = loadWindowRect()
        }
        applyWindowRect(clampWindowRect(preferredRect))
        panel.value?.focus()
      })
    } else {
      releasePointerOperation()
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKey)
  window.addEventListener('resize', handleViewportResize)
})

onBeforeUnmount(() => {
  // The pointer listeners only exist while an operation does, and
  // `releasePointerOperation` owns them.
  releasePointerOperation()
  window.clearTimeout(deleteConfirmationTimer)
  window.removeEventListener('keydown', handleWindowKey)
  window.removeEventListener('resize', handleViewportResize)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="settings-panel-layer"
      role="presentation"
    >
      <!--
        Non-modal on purpose: the layer below lets pointer events through so
        the chart stays usable. No `aria-modal`, and no focus trap — either
        would claim the rest of the app is inert when it is not.
      -->
      <aside
        id="general-settings-panel"
        ref="panel"
        aria-label="Configurações gerais"
        class="settings-panel"
        role="dialog"
        tabindex="-1"
        @keydown="handlePanelKey"
      >
        <header
          class="settings-panel-header"
          title="Arraste para mover · duplo clique para restaurar"
          @dblclick="resetWindowRect"
          @pointerdown="beginDrag"
        >
          <span class="settings-drag-indicator">
            <Move aria-hidden="true" />
          </span>
          <div>
            <span>CRYPTO PRO</span>
            <h2>Configurações</h2>
            <p>Arraste a janela ou use suas bordas para redimensionar.</p>
          </div>
          <div class="settings-window-actions">
            <button
              aria-label="Restaurar tamanho e posição"
              title="Restaurar tamanho e posição"
              type="button"
              @click="resetWindowRect"
            >
              <Maximize2 aria-hidden="true" />
            </button>
            <button
              aria-label="Fechar configurações"
              class="settings-close"
              title="Fechar (Esc)"
              type="button"
              @click="emit('close')"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div class="settings-panel-body">
          <nav
            aria-label="Seções das configurações"
            class="settings-navigation"
          >
            <button
              :class="{ active: activeSection === 'appearance' }"
              type="button"
              @click="selectSection('appearance')"
            >
              <SwatchBook aria-hidden="true" />
              <span>
                <strong>Aparência</strong>
                <small>Tema e paleta</small>
              </span>
            </button>
            <button
              :class="{ active: activeSection === 'general' }"
              type="button"
              @click="selectSection('general')"
            >
              <SlidersHorizontal aria-hidden="true" />
              <span>
                <strong>Geral</strong>
                <small>Preferências do app</small>
              </span>
            </button>
            <button
              :class="{ active: activeSection === 'providers' }"
              type="button"
              @click="selectSection('providers')"
            >
              <Plug aria-hidden="true" />
              <span>
                <strong>Provedores</strong>
                <small>Conexões e APIs</small>
              </span>
            </button>
          </nav>

          <CustomThemeEditor
            v-if="activeSection === 'appearance' && editingTheme"
            @cancel="editingTheme = false"
            @saved="editingTheme = false"
          />

          <section
            v-else-if="activeSection === 'appearance'"
            class="settings-content appearance-settings"
          >
            <div class="settings-section-heading">
              <div>
                <span>APARÊNCIA</span>
                <h3>Tema da plataforma</h3>
                <p>
                  As miniaturas usam as cores reais de fundo, alta e baixa.
                </p>
              </div>
              <div class="settings-heading-actions">
                <button
                  class="create-theme-button"
                  type="button"
                  @click="editingTheme = true"
                >
                  <Plus aria-hidden="true" />
                  Criar tema
                </button>
                <div
                  class="theme-mode-switch"
                  aria-label="Luminosidade do tema"
                  role="group"
                >
                  <button
                    :aria-pressed="appTheme === 'dark'"
                    :class="{ active: appTheme === 'dark' }"
                    type="button"
                    @click="setTheme('dark')"
                  >
                    <Moon aria-hidden="true" />
                    Escuro
                  </button>
                  <button
                    :aria-pressed="appTheme === 'light'"
                    :class="{ active: appTheme === 'light' }"
                    type="button"
                    @click="setTheme('light')"
                  >
                    <Sun aria-hidden="true" />
                    Claro
                  </button>
                </div>
              </div>
            </div>

            <div class="theme-catalog-heading">
              <div>
                <strong>Paletas disponíveis</strong>
                <small>
                  {{ themePresets.length }} predefinidas
                  <template v-if="customThemePresets.length">
                    · {{ customThemePresets.length }} personalizadas
                  </template>
                </small>
              </div>
              <span>{{ paletteCards.length }} temas</span>
            </div>

            <div class="theme-preset-grid">
              <article
                v-for="preset in paletteCards"
                :key="preset.id"
                :class="{ active: appThemePreset === preset.id }"
                class="theme-preset-card"
              >
                <button
                  :aria-pressed="appThemePreset === preset.id"
                  class="theme-preset-select"
                  type="button"
                  @click="selectPreset(preset.id)"
                >
                  <ThemePresetPreview :palette="preset.preview" />
                  <span class="theme-preset-copy">
                    <strong>{{ preset.name }}</strong>
                    <small>
                      {{ preset.custom ? 'Personalizado' : preset.description }}
                    </small>
                  </span>
                  <span class="theme-selected-mark">
                    <Check
                      v-if="appThemePreset === preset.id"
                      aria-hidden="true"
                    />
                  </span>
                </button>
                <button
                  v-if="preset.custom"
                  :aria-label="pendingDelete === preset.id
                    ? `Confirmar exclusão do tema ${preset.name}`
                    : `Excluir tema ${preset.name}`"
                  :class="{ confirming: pendingDelete === preset.id }"
                  class="delete-custom-theme"
                  :title="pendingDelete === preset.id
                    ? 'Clique novamente para confirmar'
                    : 'Excluir tema'"
                  type="button"
                  @click="removeCustomTheme(preset.id as CustomThemeId)"
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </article>
            </div>
          </section>

          <ProviderAccountsPanel
            v-else-if="activeSection === 'providers'"
            :snapshot="security.snapshot.value"
            @request-access="emit('requestAccess')"
          />

          <SecurityPreferencesPanel
            v-else-if="activeSection === 'general'"
            :snapshot="security.snapshot.value"
          />

          <section v-else class="settings-content settings-placeholder">
            <span class="settings-placeholder-icon">
              <Plug aria-hidden="true" />
            </span>
            <span>ESTRUTURA PREPARADA</span>
            <h3>
              {{
                'Configurações'
              }}
            </h3>
            <p>
              Esta seção está reservada para configurações da plataforma.
            </p>
          </section>
        </div>

        <!--
          Pointer-only affordances: unreachable by keyboard, and the panel is
          already resettable from its header button. Announcing eight controls
          named after a compass point would be noise, not access.
        -->
        <button
          v-for="edge in ([
            'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw',
          ] as ResizeEdge[])"
          :key="edge"
          :class="`edge-${edge}`"
          aria-hidden="true"
          class="settings-resize-handle"
          tabindex="-1"
          type="button"
          @pointerdown="beginResize($event, edge)"
        />
      </aside>

      <div
        ref="resizeFrame"
        class="settings-resize-frame"
        hidden
      />
    </div>
  </Teleport>
</template>
