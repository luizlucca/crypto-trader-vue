<script setup lang="ts">
import { Check, Settings2, X } from '@lucide/vue'
import { nextTick, onMounted, shallowRef } from 'vue'
import { DRAWING_MAX_TEXT_LENGTH } from '@/domain/chartDrawings'
import type { TextAppearance } from '@/domain/textAppearance'
import {
  copyTextAppearance,
  textFontFamilyStack,
} from '@/domain/textAppearance'
import TextAppearanceControls
  from '@/components/shared/TextAppearanceControls.vue'

interface TextEditValue {
  text: string
  appearance: TextAppearance
}

const props = defineProps<{
  text: string
  appearance: TextAppearance
}>()

const emit = defineEmits<{
  save: [value: TextEditValue]
  settings: [value: TextEditValue]
  cancel: []
}>()

const root = shallowRef<HTMLElement | null>(null)
const input = shallowRef<HTMLInputElement | null>(null)
const draft = shallowRef(props.text)
const draftAppearance = shallowRef(copyTextAppearance(props.appearance))
let finished = false

function currentValue(): TextEditValue {
  return {
    text: draft.value.slice(0, DRAWING_MAX_TEXT_LENGTH),
    appearance: copyTextAppearance(draftAppearance.value),
  }
}

function finish(event: 'save' | 'settings'): void {
  if (finished) {
    return
  }
  finished = true
  const value = currentValue()
  if (event === 'save') {
    emit('save', value)
  } else {
    emit('settings', value)
  }
}

function cancel(): void {
  if (finished) {
    return
  }
  finished = true
  emit('cancel')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    finish('save')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    cancel()
  }
}

function handleFocusOut(event: FocusEvent): void {
  if (
    event.relatedTarget instanceof Node
    && root.value?.contains(event.relatedTarget)
  ) {
    return
  }
  finish('save')
}

onMounted(() => {
  void nextTick(() => {
    input.value?.focus()
    input.value?.select()
  })
})
</script>

<template>
  <form
    ref="root"
    class="drawing-text-inline-editor"
    role="dialog"
    aria-label="Editar texto do desenho"
    @submit.prevent="finish('save')"
    @focusout="handleFocusOut"
    @dblclick.stop
    @pointerdown.stop
  >
    <label>
      <span>Editar anotação</span>
      <input
        ref="input"
        v-model="draft"
        type="text"
        :maxlength="DRAWING_MAX_TEXT_LENGTH"
        autocomplete="off"
        spellcheck="true"
        :style="{
          color: draftAppearance.color,
          fontFamily: textFontFamilyStack(draftAppearance.fontFamily),
          fontSize: `${draftAppearance.fontSize}px`,
          fontStyle: draftAppearance.fontStyle,
          fontWeight: draftAppearance.fontWeight,
        }"
        @keydown="handleKeydown"
      >
    </label>
    <div class="drawing-text-inline-editor__quick-size">
      <span>Tamanho rápido</span>
      <TextAppearanceControls v-model="draftAppearance" compact />
    </div>
    <div class="drawing-text-inline-editor__actions">
      <small><kbd>Enter</kbd> salvar · <kbd>Esc</kbd> cancelar</small>
      <button
        type="button"
        aria-label="Abrir todas as configurações"
        title="Mais configurações"
        @mousedown.prevent
        @click="finish('settings')"
      >
        <Settings2 aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Cancelar edição"
        title="Cancelar"
        @mousedown.prevent
        @click="cancel"
      >
        <X aria-hidden="true" />
      </button>
      <button
        class="confirm"
        type="submit"
        aria-label="Salvar texto"
        title="Salvar"
        @mousedown.prevent
      >
        <Check aria-hidden="true" />
      </button>
    </div>
  </form>
</template>
