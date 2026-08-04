<script setup lang="ts">
import { GripHorizontal, X } from '@lucide/vue'
import { nextTick, onMounted, shallowRef } from 'vue'
import {
  copyPlotStyles,
  type IndicatorDefinition,
  type IndicatorInputs,
  type IndicatorPlotStyle,
} from '@/domain/indicators'
import { useDraggableDialog } from '@/composables/useDraggableDialog'
import IndicatorForm from './IndicatorForm.vue'

/**
 * Floating editor for an indicator already on the chart.
 *
 * Changes are applied live so they can be judged against real data; cancelling
 * restores the values the dialog opened with.
 */
const props = defineProps<{
  definition: IndicatorDefinition
  inputs: IndicatorInputs
  styles: Record<string, IndicatorPlotStyle>
  populatedPlots: readonly string[]
  calculated: boolean
}>()

const emit = defineEmits<{
  close: []
  inputs: [inputs: IndicatorInputs]
  styles: [styles: Record<string, IndicatorPlotStyle>]
}>()

const { panel, startDrag, center } = useDraggableDialog()

// Snapshot taken on open, so Cancel has something to restore to.
const originalInputs = shallowRef<IndicatorInputs>({ ...props.inputs })
const originalStyles = shallowRef(copyPlotStyles(props.styles))

function cancel(): void {
  emit('inputs', { ...originalInputs.value })
  emit('styles', copyPlotStyles(originalStyles.value))
  emit('close')
}

onMounted(() => {
  void nextTick(center)
})
</script>

<template>
  <!--
    Teleported to the body: a `position: fixed` panel is positioned against the
    nearest ancestor that establishes a containing block, and the chart panels
    use `contain` for paint isolation. Rendering in place put the dialog at an
    arbitrary offset instead of the viewport centre.
  -->
  <Teleport to="body">
    <section
      ref="panel"
      :aria-label="`Configurar ${definition.name}`"
      class="indicator-settings"
      role="dialog"
      @keydown.esc.prevent="cancel"
    >
      <header
        class="indicator-settings-header"
        title="Arraste para mover"
        @pointerdown="startDrag"
      >
        <GripHorizontal aria-hidden="true" class="indicator-drag-grip" />
        <div>
          <span>INDICADOR</span>
          <h3>{{ definition.name }}</h3>
        </div>
        <button
          aria-label="Fechar"
          title="Fechar (Esc)"
          type="button"
          @click="cancel"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <IndicatorForm
        :calculated="calculated"
        :definition="definition"
        :inputs="inputs"
        :populated-plots="populatedPlots"
        :styles="styles"
        @inputs="emit('inputs', $event)"
        @styles="emit('styles', $event)"
      />

      <footer class="indicator-dialog-actions">
        <button type="button" @click="cancel">Cancelar</button>
        <button class="indicator-apply" type="button" @click="emit('close')">
          Aplicar
        </button>
      </footer>
    </section>
  </Teleport>
</template>
