<script setup lang="ts">
import type { ProviderDefinition } from '@providers/domain/providerCatalog'

defineProps<{
  id: ProviderDefinition['id']
}>()
</script>

<template>
  <svg
    v-if="id === 'binance'"
    aria-label="Binance"
    class="provider-icon"
    role="img"
    viewBox="0 0 24 24"
  >
    <title>Binance</title>
    <path d="m12 2.5 3.1 3.1L12 8.7 8.9 5.6 12 2.5Z" />
    <path d="m5.6 8.9 3.1 3.1-3.1 3.1L2.5 12l3.1-3.1Z" />
    <path d="m18.4 8.9 3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1Z" />
    <path d="m12 15.3 3.1 3.1-3.1 3.1-3.1-3.1 3.1-3.1Z" />
    <path d="m12 9.8 2.2 2.2-2.2 2.2-2.2-2.2L12 9.8Z" />
  </svg>
</template>
