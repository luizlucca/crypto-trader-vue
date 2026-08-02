<script setup lang="ts">
import {
  Check,
  ChevronRight,
  GripHorizontal,
  Search,
  TriangleAlert,
  X,
} from '@lucide/vue'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { useDraggableDialog } from '@/composables/useDraggableDialog'
import type {
  IndicatorDefinition,
  IndicatorInputs,
  IndicatorInstance,
  IndicatorPlotStyle,
} from '@/domain/indicators'
import { selectTop } from '@/domain/topSelection'
import IndicatorForm from './IndicatorForm.vue'

const props = defineProps<{
  open: boolean
  /** Resolved lazily: loading the catalog spins up the worker. */
  load: () => Promise<IndicatorDefinition[]>
  /**
   * The instance whose settings are expanded, if any. Choosing an indicator
   * applies it to the chart and opens it here — the accordion edits something
   * that already exists, it does not propose something that might.
   */
  editing:
    | { instance: IndicatorInstance, definition: IndicatorDefinition }
    | null
  /** Everything currently on the chart, so a row can show its own state. */
  applied: readonly {
    instance: IndicatorInstance
    definition: IndicatorDefinition
  }[]
  populatedPlots: readonly string[]
  calculated: boolean
}>()

const emit = defineEmits<{
  close: []
  /** Put this indicator on the chart now and expand its settings. */
  apply: [definition: IndicatorDefinition]
  /** Collapse the settings, keeping the indicator. */
  collapse: []
  /** Take the expanded indicator off the chart. */
  remove: []
  inputs: [inputs: IndicatorInputs]
  styles: [styles: Record<string, IndicatorPlotStyle>]
}>()

/**
 * Each section is filled independently. A single shared budget was silently
 * starving the community list: the 140 curated entries consumed it before any
 * ported indicator could appear.
 */
const MAX_PER_SECTION = 60

/** Pseudo-category: what is on the chart, listed with the rows already known. */
const APPLIED_FILTER = '@applied'

const { panel, startDrag, center } = useDraggableDialog()

const definitions = shallowRef<IndicatorDefinition[]>([])
const loading = ref(false)
const query = ref('')
const activeCategory = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

/** How many instances of each definition are on the chart. */
const appliedCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const entry of props.applied) {
    counts.set(
      entry.definition.id,
      (counts.get(entry.definition.id) ?? 0) + 1,
    )
  }
  return counts
})

const categories = computed(() => {
  const counts = new Map<string, number>()
  for (const definition of definitions.value) {
    counts.set(definition.category, (counts.get(definition.category) ?? 0) + 1)
  }
  return [...counts].sort((left, right) => right[1] - left[1])
})

/**
 * Lower sorts first: an exact short-name hit beats a prefix, which beats a
 * match anywhere. Without this, searching "RSI" surfaced "Connors RSI" ahead
 * of the actual Relative Strength Index.
 */
function relevance(definition: IndicatorDefinition, term: string): number {
  if (!term) {
    return definition.group === 'standard' ? 0 : 1
  }
  const short = definition.shortName.toUpperCase()
  const name = definition.name.toUpperCase()
  if (short === term) return 0
  if (short.startsWith(term)) return 1
  if (name.startsWith(term)) return 2
  if (short.includes(term)) return 3
  return 4
}

function matches(
  definition: IndicatorDefinition,
  term: string,
  category: string,
): boolean {
  if (category === APPLIED_FILTER) {
    if (!appliedCounts.value.has(definition.id)) {
      return false
    }
  } else if (category && definition.category !== category) {
    return false
  }
  if (!term) {
    return true
  }
  return definition.name.toUpperCase().includes(term)
    || definition.shortName.toUpperCase().includes(term)
}

/**
 * The catalog holds 457 entries. `selectTop` allocates only the visible slice —
 * this runs on the thread that draws the chart, on every keystroke.
 */
function section(community: boolean) {
  const term = query.value.trim().toUpperCase()
  const category = activeCategory.value
  return selectTop(
    definitions.value,
    MAX_PER_SECTION,
    (left, right) => {
      const byRelevance = relevance(left, term) - relevance(right, term)
      return byRelevance !== 0
        ? byRelevance
        : left.name.localeCompare(right.name)
    },
    (definition) => (definition.group === 'community') === community
      && matches(definition, term, category),
  )
}

const verified = computed(() => section(false))
const unverified = computed(() => section(true))
const results = computed(
  () => verified.value.length + unverified.value.length,
)

/** The two lists share one row template; only the warning separates them. */
const sections = computed(() => [
  { community: false, items: verified.value },
  { community: true, items: unverified.value },
])

async function ensureCatalog(): Promise<void> {
  if (definitions.value.length > 0 || loading.value) {
    return
  }
  loading.value = true
  try {
    definitions.value = await props.load()
  } finally {
    loading.value = false
  }
}

function handleKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

function expanded(definition: IndicatorDefinition): boolean {
  return props.editing?.definition.id === definition.id
}

/**
 * Clicking a row puts the indicator on the chart; clicking the expanded one
 * collapses it and keeps it there. Applying twice is therefore deliberate —
 * collapse, then choose again — which is how two moving averages with
 * different lengths end up on the same chart.
 */
function choose(definition: IndicatorDefinition): void {
  if (expanded(definition)) {
    emit('collapse')
    return
  }
  emit('apply', definition)
}

watch(() => props.open, (open) => {
  if (!open) {
    return
  }
  void ensureCatalog()
  void nextTick(() => {
    center()
    searchInput.value?.focus()
  })
})

onMounted(() => {
  if (props.open) {
    void ensureCatalog()
  }
})
</script>

<template>
  <Teleport to="body">
    <section
      v-if="open"
      ref="panel"
      aria-label="Escolher indicador"
      class="indicator-picker"
      role="dialog"
      @keydown="handleKey"
    >
      <header
        class="indicator-picker-header"
        title="Arraste para mover"
        @pointerdown="startDrag"
      >
        <GripHorizontal aria-hidden="true" class="indicator-drag-grip" />
        <div>
          <span>ANÁLISE TÉCNICA</span>
          <h2>Indicadores</h2>
        </div>
        <button
          aria-label="Fechar"
          title="Fechar (Esc)"
          type="button"
          @click="emit('close')"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <label class="indicator-search">
        <Search aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="query"
          aria-label="Buscar indicador"
          placeholder="Buscar por nome…"
        >
      </label>

      <div class="indicator-picker-body">
        <nav aria-label="Categorias" class="indicator-categories">
          <!--
            What is on the chart comes first: after choosing an indicator the
            count grows here, which is the confirmation that the click stuck.
          -->
          <button
            :class="{ active: activeCategory === APPLIED_FILTER }"
            :disabled="applied.length === 0"
            class="indicator-category-applied"
            type="button"
            @click="activeCategory = APPLIED_FILTER"
          >
            No gráfico <i>{{ applied.length }}</i>
          </button>
          <button
            :class="{ active: activeCategory === '' }"
            type="button"
            @click="activeCategory = ''"
          >
            Todas <i>{{ definitions.length }}</i>
          </button>
          <button
            v-for="[name, count] in categories"
            :key="name"
            :class="{ active: activeCategory === name }"
            type="button"
            @click="activeCategory = name"
          >
            {{ name }} <i>{{ count }}</i>
          </button>
        </nav>

        <div class="indicator-results">
          <p v-if="loading" class="indicator-empty">Carregando catálogo…</p>
          <p
            v-else-if="results === 0"
            class="indicator-empty"
          >
            Nenhum indicador encontrado
          </p>

          <template v-else>
            <template v-for="group in sections" :key="String(group.community)">
              <div
                v-if="group.community && group.items.length"
                class="indicator-unverified-note"
              >
                <TriangleAlert aria-hidden="true" />
                <span>
                  Portados da comunidade a partir de PineScript. Utilizáveis,
                  mas sem garantia de equivalência com o original.
                </span>
              </div>

              <div
                v-for="definition in group.items"
                :key="definition.id"
                class="indicator-entry"
              >
                <button
                  :aria-expanded="expanded(definition)"
                  :class="{
                    expanded: expanded(definition),
                    unverified: group.community,
                    'on-chart': appliedCounts.has(definition.id),
                  }"
                  class="indicator-option"
                  type="button"
                  @click="choose(definition)"
                >
                  <ChevronRight aria-hidden="true" class="indicator-option-chevron" />
                  <span class="indicator-option-body">
                    <span class="indicator-option-title">
                      <strong>{{ definition.name }}</strong>
                      <small>
                        {{ definition.overlay ? 'Sobre o preço' : 'Painel próprio' }}
                      </small>
                    </span>
                    <span class="indicator-option-description">
                      {{ definition.description }}
                    </span>
                  </span>
                  <span
                    v-if="appliedCounts.has(definition.id)"
                    :title="`${appliedCounts.get(definition.id)} no gráfico`"
                    class="indicator-option-applied"
                  >
                    <Check aria-hidden="true" />
                    <i v-if="(appliedCounts.get(definition.id) ?? 0) > 1">
                      {{ appliedCounts.get(definition.id) }}
                    </i>
                  </span>
                </button>

                <!--
                  Accordion body. The indicator is already on the chart at this
                  point, so every change is judged against real data and
                  closing the panel cannot undo it.
                -->
                <section
                  v-if="editing && expanded(definition)"
                  class="indicator-inline-settings"
                >
                  <IndicatorForm
                    :key="editing.instance.instanceId"
                    :calculated="calculated"
                    :definition="editing.definition"
                    :inputs="editing.instance.inputs"
                    :populated-plots="populatedPlots"
                    :styles="editing.instance.styles"
                    @inputs="emit('inputs', $event)"
                    @styles="emit('styles', $event)"
                  />
                  <footer class="indicator-inline-actions">
                    <button
                      class="indicator-destructive"
                      type="button"
                      @click="emit('remove')"
                    >
                      Remover do gráfico
                    </button>
                    <button
                      class="indicator-apply"
                      type="button"
                      @click="emit('collapse')"
                    >
                      Concluído
                    </button>
                  </footer>
                </section>
              </div>
            </template>
          </template>
        </div>
      </div>
    </section>
  </Teleport>
</template>
