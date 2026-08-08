<script setup lang="ts">
import { computed } from 'vue'
import type { ProviderAccountSummary } from '@shared/contracts/security'
import { environmentLabel } from '@shared/domain/providerEnvironment'

/**
 * Asks before a switch, every time — not only when a position is open.
 *
 * The reset destroys work that has no other copy: the tabs the operator laid
 * out, the periods chosen on them, the indicators configured there. Nothing
 * about that is recoverable, and money is not the only thing worth confirming.
 */
const props = defineProps<{
  target: ProviderAccountSummary
  openTabs: number
  pending: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const targetName = computed(() => environmentLabel(props.target.environment))
const closingTabs = computed(() => (
  props.openTabs === 1
    ? 'A aba aberta será fechada'
    : `As ${props.openTabs} abas abertas serão fechadas`
))
</script>

<template>
  <!--
    Teleported like every other dialog here: rendered in place it would be a
    child of the workspace grid, which places its children by explicit column.
  -->
  <Teleport to="body">
    <div class="environment-switch-scrim" @click="emit('cancel')" />
    <section
      aria-labelledby="environment-switch-title"
      aria-modal="true"
      class="environment-switch-dialog"
      role="dialog"
      @keydown.esc="emit('cancel')"
    >
      <header>
        <span>AMBIENTE</span>
        <h3 id="environment-switch-title">Trocar para {{ targetName }}?</h3>
      </header>

      <div class="environment-switch-body">
        <p>
          Conectar <strong>{{ target.label }}</strong> muda a corretora de
          origem dos dados.
          <template v-if="target.environment === 'test'">
            Preços, livro e catálogo passam a vir da testnet, que tem liquidez
            própria e não reflete o mercado.
          </template>
          <template v-else>
            Preços, livro e catálogo voltam a vir do mercado real.
          </template>
        </p>

        <p class="environment-switch-reset">
          <strong>{{ closingTabs }}</strong>
          e o workspace será reconstruído. Seus desenhos ficam guardados por
          ambiente e continuam onde estão.
        </p>
      </div>

      <footer>
        <button
          :disabled="pending"
          type="button"
          @click="emit('cancel')"
        >
          Cancelar
        </button>
        <button
          class="primary"
          :disabled="pending"
          type="button"
          @click="emit('confirm')"
        >
          {{ pending ? 'Trocando…' : 'Trocar e reconstruir' }}
        </button>
      </footer>
    </section>
  </Teleport>
</template>
