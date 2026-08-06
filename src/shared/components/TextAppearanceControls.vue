<script setup lang="ts">
import { Bold, Italic } from '@lucide/vue'
import type {
  TextAppearance,
  TextFontFamilyId,
  TextFontStyle,
  TextFontWeight,
} from '@renderer-shared/domain/textAppearance'
import {
  TEXT_FONT_OPTIONS,
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  TEXT_FONT_WEIGHTS,
  TEXT_SIZE_PRESETS,
  normalizeTextAppearance,
  textFontFamilyStack,
} from '@renderer-shared/domain/textAppearance'

defineProps<{ compact?: boolean }>()

const appearance = defineModel<TextAppearance>({ required: true })

function update(patch: Partial<TextAppearance>): void {
  appearance.value = normalizeTextAppearance({
    ...appearance.value,
    ...patch,
  })
}

function updateFontFamily(event: Event): void {
  update({
    fontFamily: (event.currentTarget as HTMLSelectElement)
      .value as TextFontFamilyId,
  })
}

function updateFontSize(event: Event): void {
  update({ fontSize: Number((event.currentTarget as HTMLInputElement).value) })
}

function updateFontWeight(event: Event): void {
  update({
    fontWeight: Number(
      (event.currentTarget as HTMLSelectElement).value,
    ) as TextFontWeight,
  })
}

function updateColor(event: Event): void {
  update({ color: (event.currentTarget as HTMLInputElement).value })
}

function toggleBold(): void {
  update({ fontWeight: appearance.value.fontWeight === 700 ? 600 : 700 })
}

function toggleItalic(): void {
  const fontStyle: TextFontStyle = appearance.value.fontStyle === 'italic'
    ? 'normal'
    : 'italic'
  update({ fontStyle })
}
</script>

<template>
  <div class="text-appearance-controls" :class="{ compact }">
    <div
      class="text-size-presets"
      role="group"
      aria-label="Tamanhos rápidos de texto"
    >
      <button
        v-for="preset in TEXT_SIZE_PRESETS"
        :key="preset.id"
        type="button"
        :class="{ active: appearance.fontSize === preset.fontSize }"
        :aria-pressed="appearance.fontSize === preset.fontSize"
        :aria-label="`${preset.name}: ${preset.fontSize} pixels`"
        :title="`${preset.name} · ${preset.fontSize}px`"
        @click="update({ fontSize: preset.fontSize })"
      >
        {{ preset.label }}
      </button>
    </div>

    <template v-if="!compact">
      <div class="text-appearance-fields">
        <label>
          <span>Fonte</span>
          <select
            :value="appearance.fontFamily"
            @change="updateFontFamily"
          >
            <option
              v-for="font in TEXT_FONT_OPTIONS"
              :key="font.id"
              :value="font.id"
              :style="{ fontFamily: font.stack }"
            >
              {{ font.label }}
            </option>
          </select>
        </label>

        <label class="text-size-field">
          <span>Tamanho</span>
          <span>
            <input
              type="number"
              :min="TEXT_FONT_SIZE_MIN"
              :max="TEXT_FONT_SIZE_MAX"
              :value="appearance.fontSize"
              @input="updateFontSize"
            >
            <i>px</i>
          </span>
        </label>

        <label>
          <span>Peso</span>
          <select
            :value="appearance.fontWeight"
            @change="updateFontWeight"
          >
            <option
              v-for="weight in TEXT_FONT_WEIGHTS"
              :key="weight.value"
              :value="weight.value"
            >
              {{ weight.label }}
            </option>
          </select>
        </label>

        <label class="text-color-field">
          <span>Cor</span>
          <span>
            <i :style="{ '--text-color': appearance.color }" />
            <code>{{ appearance.color.toUpperCase() }}</code>
            <input
              type="color"
              :value="appearance.color"
              aria-label="Cor do texto"
              @input="updateColor"
            >
          </span>
        </label>
      </div>

      <div class="text-style-buttons" role="group" aria-label="Estilo do texto">
        <button
          type="button"
          :class="{ active: appearance.fontWeight === 700 }"
          :aria-pressed="appearance.fontWeight === 700"
          title="Negrito"
          @click="toggleBold"
        >
          <Bold aria-hidden="true" />
          Negrito
        </button>
        <button
          type="button"
          :class="{ active: appearance.fontStyle === 'italic' }"
          :aria-pressed="appearance.fontStyle === 'italic'"
          title="Itálico"
          @click="toggleItalic"
        >
          <Italic aria-hidden="true" />
          Itálico
        </button>
        <span
          class="text-style-preview"
          :style="{
            color: appearance.color,
            fontFamily: textFontFamilyStack(appearance.fontFamily),
            fontSize: `${appearance.fontSize}px`,
            fontStyle: appearance.fontStyle,
            fontWeight: appearance.fontWeight,
          }"
        >
          Aa
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.text-appearance-controls {
  display: grid;
  gap: 10px;
}

.text-size-presets {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 5px;
}

.text-size-presets button,
.text-style-buttons button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  color: var(--text);
  background: color-mix(in srgb, var(--selected-bg) 20%, transparent);
  font-size: 10px;
  font-weight: 600;
}

.text-size-presets button:hover,
.text-size-presets button.active,
.text-style-buttons button:hover,
.text-style-buttons button.active {
  border-color: color-mix(in srgb, var(--accent-hover) 48%, var(--border));
  color: var(--accent-hover);
  background: var(--selected-bg);
}

.text-appearance-controls.compact {
  width: 132px;
}

.text-appearance-controls.compact .text-size-presets {
  gap: 3px;
}

.text-appearance-controls.compact .text-size-presets button {
  min-height: 27px;
  padding: 0;
  font-family: "JetBrains Mono Variable", monospace;
  font-size: 9px;
}

.text-appearance-fields {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(76px, .6fr);
  gap: 8px;
}

.text-appearance-fields > label {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.text-appearance-fields > label > span:first-child {
  color: var(--muted);
  font-size: 9px;
  font-weight: 600;
}

.text-appearance-fields select,
.text-size-field > span,
.text-color-field > span {
  width: 100%;
  height: 31px;
  border: 1px solid var(--border-soft);
  border-radius: 5px;
  color: var(--text-strong);
  background: color-mix(in srgb, var(--navigation-bg) 65%, transparent);
}

.text-appearance-fields select {
  padding: 0 7px;
  outline: none;
  font-size: 10px;
}

.text-size-field > span,
.text-color-field > span {
  position: relative;
  display: flex;
  align-items: center;
}

.text-size-field input {
  width: 100%;
  height: 100%;
  padding: 0 25px 0 7px;
  border: 0;
  outline: none;
  color: var(--text-strong);
  background: transparent;
  font: 500 10px "JetBrains Mono Variable", monospace;
}

.text-size-field i {
  position: absolute;
  right: 7px;
  color: var(--muted);
  font-size: 9px;
  font-style: normal;
}

.text-color-field > span > i {
  flex: 0 0 auto;
  width: 17px;
  height: 17px;
  margin-left: 7px;
  border: 1px solid color-mix(in srgb, var(--text-strong) 25%, transparent);
  border-radius: 50%;
  background: var(--text-color);
}

.text-color-field code {
  min-width: 0;
  margin-left: 7px;
  overflow: hidden;
  color: var(--muted);
  font: 500 8.5px "JetBrains Mono Variable", monospace;
  text-overflow: ellipsis;
}

.text-color-field input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
  opacity: 0;
}

.text-style-buttons {
  display: flex;
  align-items: center;
  gap: 5px;
}

.text-style-buttons button {
  gap: 5px;
}

.text-style-buttons button svg {
  width: 13px;
  height: 13px;
}

.text-style-preview {
  display: grid;
  min-width: 46px;
  height: 32px;
  margin-left: auto;
  overflow: hidden;
  place-items: center;
}
</style>
