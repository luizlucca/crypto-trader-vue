<script setup lang="ts">
import { ArrowLeft, Check, Moon, Sun } from '@lucide/vue'
import { computed, reactive, ref } from 'vue'
import {
  appTheme,
  appThemePreset,
  saveCustomTheme,
  type AppTheme,
} from '@settings/services/theme'
import {
  customizeThemePalette,
  defaultThemeCustomization,
  getThemePalette,
  isThemePresetId,
  themePresets,
  DEFAULT_THEME_PRESET_ID,
  type ThemePresetId,
  type ThemeVariantCustomization,
} from '@settings/services/themeCatalog'
import { MIN_GRAPHIC_CONTRAST, contrastRatio } from '@settings/domain/color'
import ThemePresetPreview from './ThemePresetPreview.vue'

const emit = defineEmits<{
  cancel: []
  saved: []
}>()

const initialBasePresetId = isThemePresetId(appThemePreset.value)
  ? appThemePreset.value
  : DEFAULT_THEME_PRESET_ID
const name = ref('Meu tema')
const basePresetId = ref<ThemePresetId>(initialBasePresetId)
const editingMode = ref<AppTheme>(appTheme.value)
const variants = reactive<Record<AppTheme, ThemeVariantCustomization>>({
  dark: defaultThemeCustomization(initialBasePresetId, 'dark'),
  light: defaultThemeCustomization(initialBasePresetId, 'light'),
})

const currentVariant = computed(() => variants[editingMode.value])
const previewPalette = computed(() => customizeThemePalette(
  getThemePalette(basePresetId.value, editingMode.value),
  currentVariant.value,
  editingMode.value,
))
const canSave = computed(() => name.value.trim().length >= 2)

function resetFromBase(): void {
  variants.dark = defaultThemeCustomization(basePresetId.value, 'dark')
  variants.light = defaultThemeCustomization(basePresetId.value, 'light')
}

function updateOpacity(
  key: 'candleOpacity' | 'backgroundOpacity',
  event: Event,
): void {
  const value = Number((event.target as HTMLInputElement).value)
  currentVariant.value[key] = value
}

function save(): void {
  if (!canSave.value) {
    return
  }
  saveCustomTheme({
    name: name.value,
    basePresetId: basePresetId.value,
    dark: { ...variants.dark },
    light: { ...variants.light },
  })
  emit('saved')
}

/**
 * Warns when a chosen candle colour disappears against the chosen background.
 *
 * A warning and not a correction: the previews exist precisely to show what
 * the operator picked, and silently adjusting a decision would be worse than
 * the problem. The threshold is the one WCAG asks of graphical objects, shared
 * with the indicator palette so both surfaces judge legibility the same way.
 */
function contrastWarning(color: string): string {
  const ratio = contrastRatio(color, currentVariant.value.chartBackground)
  if (ratio === null || ratio >= MIN_GRAPHIC_CONTRAST) {
    return ''
  }
  return `Contraste ${ratio.toFixed(1)}:1 contra o fundo do gráfico.`
    + ` Abaixo de ${MIN_GRAPHIC_CONTRAST}:1 o candle some.`
}

const candleUpWarning = computed(
  () => contrastWarning(currentVariant.value.candleUp),
)
const candleDownWarning = computed(
  () => contrastWarning(currentVariant.value.candleDown),
)
</script>

<template>
  <section class="settings-content custom-theme-editor">
    <header class="custom-theme-editor-header">
      <button
        aria-label="Voltar para os temas"
        class="theme-editor-back"
        title="Voltar"
        type="button"
        @click="emit('cancel')"
      >
        <ArrowLeft aria-hidden="true" />
      </button>
      <div>
        <span>EDITOR DE TEMA</span>
        <h3>Criar tema personalizado</h3>
        <p>
          Configure as duas variantes. A prévia usa exatamente as cores que
          serão aplicadas ao gráfico.
        </p>
      </div>
      <button
        :disabled="!canSave"
        class="save-custom-theme"
        type="button"
        @click="save"
      >
        <Check aria-hidden="true" />
        Salvar tema
      </button>
    </header>

    <div class="custom-theme-editor-scroll">
      <div class="theme-editor-preview-card">
        <ThemePresetPreview :palette="previewPalette" large />
        <div>
          <span>PRÉVIA · {{ editingMode === 'dark' ? 'ESCURO' : 'CLARO' }}</span>
          <strong>{{ name.trim() || 'Meu tema' }}</strong>
          <small>
            Transparência real sobre a superfície da plataforma
          </small>
        </div>
      </div>

      <div class="theme-editor-basics">
        <label>
          <span>Nome do tema</span>
          <input
            v-model="name"
            maxlength="32"
            placeholder="Ex.: Terminal pessoal"
            type="text"
          >
        </label>
        <label>
          <span>Usar como base</span>
          <select v-model="basePresetId" @change="resetFromBase">
            <option
              v-for="preset in themePresets"
              :key="preset.id"
              :value="preset.id"
            >
              {{ preset.name }}
            </option>
          </select>
        </label>
      </div>

      <div class="theme-editor-variant-bar">
        <div>
          <strong>Variante de cores</strong>
          <small>Configure claro e escuro antes de salvar</small>
        </div>
        <div
          class="theme-mode-switch"
          aria-label="Variante de cores em edição"
          role="group"
        >
          <button
            :aria-pressed="editingMode === 'dark'"
            :class="{ active: editingMode === 'dark' }"
            type="button"
            @click="editingMode = 'dark'"
          >
            <Moon aria-hidden="true" />
            Escuro
          </button>
          <button
            :aria-pressed="editingMode === 'light'"
            :class="{ active: editingMode === 'light' }"
            type="button"
            @click="editingMode = 'light'"
          >
            <Sun aria-hidden="true" />
            Claro
          </button>
        </div>
      </div>

      <div class="theme-color-controls">
        <label class="theme-color-field">
          <span>Destaque</span>
          <div>
            <input v-model="currentVariant.accent" type="color">
            <code>{{ currentVariant.accent }}</code>
          </div>
        </label>
        <label class="theme-color-field">
          <span>Candle de alta</span>
          <div>
            <input v-model="currentVariant.candleUp" type="color">
            <code>{{ currentVariant.candleUp }}</code>
          </div>
          <small
            v-if="candleUpWarning"
            class="theme-contrast-warning"
            role="status"
          >{{ candleUpWarning }}</small>
        </label>
        <label class="theme-color-field">
          <span>Candle de baixa</span>
          <div>
            <input v-model="currentVariant.candleDown" type="color">
            <code>{{ currentVariant.candleDown }}</code>
          </div>
          <small
            v-if="candleDownWarning"
            class="theme-contrast-warning"
            role="status"
          >{{ candleDownWarning }}</small>
        </label>
        <label class="theme-color-field">
          <span>Fundo do gráfico</span>
          <div>
            <input v-model="currentVariant.chartBackground" type="color">
            <code>{{ currentVariant.chartBackground }}</code>
          </div>
        </label>
      </div>

      <div class="theme-opacity-controls">
        <label>
          <span>
            <strong>Opacidade dos candles</strong>
            <b>{{ Math.round(currentVariant.candleOpacity * 100) }}%</b>
          </span>
          <input
            :value="currentVariant.candleOpacity"
            max="1"
            min=".1"
            step=".05"
            type="range"
            @input="updateOpacity('candleOpacity', $event)"
          >
          <small>
            Controla corpo, pavio e intensidade das barras de volume.
          </small>
        </label>
        <label>
          <span>
            <strong>Opacidade do fundo</strong>
            <b>{{ Math.round(currentVariant.backgroundOpacity * 100) }}%</b>
          </span>
          <input
            :value="currentVariant.backgroundOpacity"
            max="1"
            min=".1"
            step=".05"
            type="range"
            @input="updateOpacity('backgroundOpacity', $event)"
          >
          <small>
            Deixa a superfície abaixo do canvas aparecer gradualmente.
          </small>
        </label>
      </div>
    </div>
  </section>
</template>
