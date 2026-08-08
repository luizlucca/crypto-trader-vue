<script setup lang="ts">
import {
  providerCatalog,
  type ProviderDefinition,
} from '@providers/domain/providerCatalog'
import ProviderIcon from './ProviderIcon.vue'

const emit = defineEmits<{
  select: [id: ProviderDefinition['id']]
  cancel: []
}>()

function selectProvider(provider: ProviderDefinition): void {
  if (provider.available) {
    emit('select', provider.id)
  }
}
</script>

<template>
  <section aria-labelledby="provider-catalog-title" class="provider-catalog">
    <header>
      <div>
        <span>ADICIONAR PROVEDOR</span>
        <h4 id="provider-catalog-title">Escolha uma corretora</h4>
        <p>Selecione o provedor para cadastrar uma conta privada.</p>
      </div>
      <button class="secondary" type="button" @click="emit('cancel')">
        Cancelar
      </button>
    </header>

    <button
      v-for="provider in providerCatalog"
      :key="provider.id"
      :disabled="!provider.available"
      class="provider-catalog-card"
      type="button"
      @click="selectProvider(provider)"
    >
      <span class="provider-account-icon">
        <ProviderIcon :id="provider.id" />
      </span>
      <span class="provider-catalog-copy">
        <strong>{{ provider.name }}</strong>
        <small>{{ provider.description }}</small>
      </span>
      <span class="provider-availability">
        {{ provider.available ? 'Disponível' : 'Em breve' }}
      </span>
    </button>
  </section>
</template>
