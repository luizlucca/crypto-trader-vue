<script setup lang="ts">
import {
  Check,
  Moon,
  Plug,
  SlidersHorizontal,
  Sun,
  SwatchBook,
  X,
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  appTheme,
  appThemePreset,
  setTheme,
  setThemePreset,
} from '../../services/theme'
import {
  getThemePalette,
  themePresets,
  type ThemePresetId,
} from '../../services/themeCatalog'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

type SettingsSection = 'appearance' | 'general' | 'providers'

const activeSection = ref<SettingsSection>('appearance')
const panel = ref<HTMLElement | null>(null)

const paletteCards = computed(() => themePresets.map((preset) => ({
  ...preset,
  preview: getThemePalette(preset.id, appTheme.value),
})))

function selectPreset(preset: ThemePresetId): void {
  setThemePreset(preset)
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
      void nextTick(() => panel.value?.focus())
    }
  },
)

window.addEventListener('keydown', handleWindowKey)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKey)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      class="settings-panel-layer"
      role="presentation"
    >
      <aside
        id="general-settings-panel"
        ref="panel"
        aria-label="Configurações gerais"
        class="settings-panel"
        tabindex="-1"
        @keydown="handlePanelKey"
      >
        <header class="settings-panel-header">
          <div>
            <span>CRYPTO PRO</span>
            <h2>Configurações</h2>
            <p>Preferências salvas automaticamente neste dispositivo.</p>
          </div>
          <button
            aria-label="Fechar configurações"
            class="settings-close"
            title="Fechar (Esc)"
            type="button"
            @click="emit('close')"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div class="settings-panel-body">
          <nav class="settings-navigation" aria-label="Seções das configurações">
            <button
              :class="{ active: activeSection === 'appearance' }"
              type="button"
              @click="activeSection = 'appearance'"
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
              @click="activeSection = 'general'"
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
              @click="activeSection = 'providers'"
            >
              <Plug aria-hidden="true" />
              <span>
                <strong>Provedores</strong>
                <small>Conexões e APIs</small>
              </span>
            </button>
          </nav>

          <section
            v-if="activeSection === 'appearance'"
            class="settings-content appearance-settings"
          >
            <div class="settings-section-heading">
              <div>
                <span>APARÊNCIA</span>
                <h3>Tema da plataforma</h3>
                <p>
                  Escolha a luminosidade e uma paleta otimizada para leitura
                  rápida dos candles.
                </p>
              </div>
              <div class="theme-mode-switch" aria-label="Luminosidade do tema">
                <button
                  :class="{ active: appTheme === 'dark' }"
                  type="button"
                  @click="setTheme('dark')"
                >
                  <Moon aria-hidden="true" />
                  Escuro
                </button>
                <button
                  :class="{ active: appTheme === 'light' }"
                  type="button"
                  @click="setTheme('light')"
                >
                  <Sun aria-hidden="true" />
                  Claro
                </button>
              </div>
            </div>

            <div class="theme-catalog-heading">
              <div>
                <strong>Paletas predefinidas</strong>
                <small>30 opções · cada uma com versão clara e escura</small>
              </div>
              <span>{{ themePresets.length }} temas</span>
            </div>

            <div class="theme-preset-grid">
              <button
                v-for="preset in paletteCards"
                :key="preset.id"
                :aria-pressed="appThemePreset === preset.id"
                :class="{ active: appThemePreset === preset.id }"
                class="theme-preset-card"
                type="button"
                @click="selectPreset(preset.id)"
              >
                <span
                  class="theme-preview"
                  :style="{
                    '--preview-bg': preset.preview.chartBackground,
                    '--preview-grid': preset.preview.chartGrid,
                    '--preview-accent': preset.preview.accent,
                    '--preview-up': preset.preview.candleUp,
                    '--preview-down': preset.preview.candleDown,
                  }"
                >
                  <i class="preview-grid-line line-one" />
                  <i class="preview-grid-line line-two" />
                  <i class="preview-candle candle-one" />
                  <i class="preview-candle candle-two" />
                  <i class="preview-candle candle-three" />
                  <i class="preview-accent" />
                </span>
                <span class="theme-preset-copy">
                  <strong>{{ preset.name }}</strong>
                  <small>{{ preset.description }}</small>
                </span>
                <span class="theme-selected-mark">
                  <Check v-if="appThemePreset === preset.id" aria-hidden="true" />
                </span>
              </button>
            </div>
          </section>

          <section v-else class="settings-content settings-placeholder">
            <span class="settings-placeholder-icon">
              <SlidersHorizontal
                v-if="activeSection === 'general'"
                aria-hidden="true"
              />
              <Plug v-else aria-hidden="true" />
            </span>
            <span>ESTRUTURA PREPARADA</span>
            <h3>
              {{
                activeSection === 'general'
                  ? 'Preferências gerais'
                  : 'Provedores e chaves de API'
              }}
            </h3>
            <p>
              Esta seção já está reservada para as próximas configurações da
              plataforma, sem misturar credenciais com preferências visuais.
            </p>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
