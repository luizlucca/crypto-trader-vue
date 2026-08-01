<script setup lang="ts">
import { Search, TriangleAlert, X } from '@lucide/vue'
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { IndicatorDefinition } from '@/domain/indicators'
import { selectTop } from '@/domain/topSelection'

const props = defineProps<{
  open: boolean
  /** Resolved lazily: loading the catalog spins up the worker. */
  load: () => Promise<IndicatorDefinition[]>
}>()

const emit = defineEmits<{
  close: []
  select: [definition: IndicatorDefinition]
}>()

/**
 * Each section is filled independently. A single shared budget was silently
 * starving the community list: the 140 curated entries consumed it before any
 * ported indicator could appear.
 */
const MAX_PER_SECTION = 60

const definitions = shallowRef<IndicatorDefinition[]>([])
const loading = ref(false)
const query = ref('')
const activeCategory = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

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
  if (category && definition.category !== category) {
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

watch(() => props.open, (open) => {
  if (!open) {
    return
  }
  void ensureCatalog()
  void Promise.resolve().then(() => searchInput.value?.focus())
})

onMounted(() => {
  if (props.open) {
    void ensureCatalog()
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="indicator-picker-layer"
      role="presentation"
      @click.self="emit('close')"
    >
      <section
        aria-label="Escolher indicador"
        class="indicator-picker"
        role="dialog"
        @keydown="handleKey"
      >
        <header class="indicator-picker-header">
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
              <button
                v-for="definition in verified"
                :key="definition.id"
                class="indicator-option"
                type="button"
                @click="emit('select', definition)"
              >
                <span class="indicator-option-title">
                  <strong>{{ definition.name }}</strong>
                  <small>{{ definition.overlay ? 'Sobre o preço' : 'Painel próprio' }}</small>
                </span>
                <span class="indicator-option-description">
                  {{ definition.description }}
                </span>
              </button>

              <div v-if="unverified.length" class="indicator-unverified-note">
                <TriangleAlert aria-hidden="true" />
                <span>
                  Portados da comunidade a partir de PineScript. Utilizáveis,
                  mas sem garantia de equivalência com o original.
                </span>
              </div>

              <button
                v-for="definition in unverified"
                :key="definition.id"
                class="indicator-option unverified"
                type="button"
                @click="emit('select', definition)"
              >
                <span class="indicator-option-title">
                  <strong>{{ definition.name }}</strong>
                  <small>{{ definition.overlay ? 'Sobre o preço' : 'Painel próprio' }}</small>
                </span>
                <span class="indicator-option-description">
                  {{ definition.description }}
                </span>
              </button>
            </template>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
