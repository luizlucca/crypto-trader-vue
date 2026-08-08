<script setup lang="ts">
import { ref, watch } from 'vue'
import type { MarketEnvironment } from '@shared/types/market'

/**
 * Marks a chart that is not showing the real market.
 *
 * Reads the environment off the selection being drawn rather than off the
 * security snapshot: the badge describes *these candles*, so it cannot
 * disagree with them during the moment between a credential connecting and
 * the workspace rebuilding.
 *
 * Nothing here is on the hot path. The environment changes when the operator
 * switches venue, never per tick, so this sits outside the render loop the
 * chart owns (ADR-0003).
 */
const props = defineProps<{
  environment: MarketEnvironment
}>()

/**
 * Dismissible, but not once and forever: it comes back on every entry into
 * the test environment. A warning that can be silenced permanently stops
 * being read exactly when the operator has grown used to ignoring it.
 */
const noticeDismissed = ref(false)

watch(() => props.environment, () => {
  noticeDismissed.value = false
})
</script>

<template>
  <div v-if="environment === 'test'" class="test-environment-badge">
    <p class="test-environment-badge__tag">
      <span aria-hidden="true" class="test-environment-badge__dot" />
      Ambiente de testes
    </p>
    <p v-if="!noticeDismissed" class="test-environment-badge__notice">
      <span>
        Preços e livro são sintéticos. A testnet tem liquidez própria e não
        serve para análise.
      </span>
      <button type="button" @click="noticeDismissed = true">Entendi</button>
    </p>
  </div>
</template>

<style scoped>
.test-environment-badge {
  /*
   * `.chart-workspace` carries `contain: layout`, which already makes it the
   * containing block.
   *
   * Three things sit above the plot area and none of them may be covered: the
   * 38px tab strip, the 38px chart toolbar, and the legend line that carries
   * the OHLC values. Hiding those numbers to warn about the venue would trade
   * one kind of misreading for another.
   */
  position: absolute;
  top: calc(38px + 38px + 35px);
  left: 50%;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: center;
  transform: translateX(-50%);
  pointer-events: none;
}

.test-environment-badge__tag,
.test-environment-badge__notice {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--warning) 38%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 12%, var(--overlay-surface));
  color: var(--warning);
}

.test-environment-badge__tag {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.25rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.test-environment-badge__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: currentcolor;
}

.test-environment-badge__notice {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  max-width: 34rem;
  padding: 0.35rem 0.5rem 0.35rem 0.9rem;
  border-radius: 0.6rem;
  font-size: 0.75rem;
  line-height: 1.35;
  pointer-events: auto;
}

.test-environment-badge__notice button {
  flex-shrink: 0;
  padding: 0.2rem 0.6rem;
  border: 1px solid currentcolor;
  border-radius: 0.4rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.72rem;
  cursor: pointer;
}

.test-environment-badge__notice button:hover {
  background: color-mix(in srgb, currentcolor 14%, transparent);
}
</style>
