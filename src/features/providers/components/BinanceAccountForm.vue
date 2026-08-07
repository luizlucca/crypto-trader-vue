<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  BinanceAccountDraft,
  ProviderAccountSummary,
} from '@shared/contracts/security'
import {
  canSaveBinanceDraft,
  emptyBinanceAccountDraft,
} from '@providers/services/providerAccounts'

const props = defineProps<{
  account?: ProviderAccountSummary
  pending: boolean
}>()

const emit = defineEmits<{
  save: [draft: BinanceAccountDraft]
  cancel: []
}>()

const label = ref('')
const spot = ref(true)
const futures = ref(false)
const apiKey = ref('')
const apiSecret = ref('')
const enabled = ref(true)

const draft = computed<BinanceAccountDraft>(() => ({
  ...(props.account ? { accountId: props.account.accountId } : {}),
  label: label.value,
  markets: [
    ...(spot.value ? ['spot' as const] : []),
    ...(futures.value ? ['futures' as const] : []),
  ],
  apiKey: apiKey.value,
  apiSecret: apiSecret.value,
  enabled: enabled.value,
}))

const canSave = computed(() => canSaveBinanceDraft(draft.value))

watch(() => props.account, (account) => {
  const initial = emptyBinanceAccountDraft()
  label.value = account?.label ?? initial.label
  spot.value = account?.markets.includes('spot') ?? true
  futures.value = account?.markets.includes('futures') ?? false
  apiKey.value = ''
  apiSecret.value = ''
  enabled.value = account?.enabled ?? initial.enabled
}, { immediate: true })

function submit(): void {
  if (canSave.value) {
    emit('save', draft.value)
  }
}
</script>

<template>
  <form class="provider-account-form" @submit.prevent="submit">
    <header>
      <div>
        <span>BINANCE</span>
        <h4>{{ account ? 'Editar conta' : 'Adicionar conta' }}</h4>
      </div>
      <p v-if="account">
        Reinsira a API key e o secret para salvar alterações.
      </p>
    </header>

    <label>
      <span>Nome da conta</span>
      <input v-model.trim="label" autocomplete="off" maxlength="64" required>
    </label>

    <fieldset>
      <legend>Mercados autorizados</legend>
      <label><input v-model="spot" type="checkbox"> Spot</label>
      <label><input v-model="futures" type="checkbox"> Futuros</label>
    </fieldset>

    <label>
      <span>API key</span>
      <input v-model="apiKey" autocomplete="off" required spellcheck="false">
    </label>
    <label>
      <span>API secret</span>
      <input
        v-model="apiSecret"
        autocomplete="new-password"
        required
        spellcheck="false"
        type="password"
      >
    </label>
    <label class="provider-enabled">
      <input v-model="enabled" type="checkbox">
      Validar e conectar ao salvar
    </label>

    <footer>
      <button
        :disabled="pending"
        class="secondary"
        type="button"
        @click="emit('cancel')"
      >
        Cancelar
      </button>
      <button :disabled="pending || !canSave" class="primary" type="submit">
        {{ pending ? 'Salvando…' : 'Salvar conta' }}
      </button>
    </footer>
  </form>
</template>
