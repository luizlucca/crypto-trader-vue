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
const validateAndConnect = ref(true)

const draft = computed<BinanceAccountDraft>(() => ({
  ...(props.account ? { accountId: props.account.accountId } : {}),
  label: label.value,
  markets: [
    ...(spot.value ? ['spot' as const] : []),
    ...(futures.value ? ['futures' as const] : []),
  ],
  apiKey: apiKey.value,
  apiSecret: apiSecret.value,
  validateAndConnect: validateAndConnect.value,
}))

const canSave = computed(() => canSaveBinanceDraft(draft.value))

watch(() => props.account, (account) => {
  const initial = emptyBinanceAccountDraft()
  label.value = account?.label ?? initial.label
  spot.value = account?.markets.includes('spot') ?? true
  futures.value = account?.markets.includes('futures') ?? false
  apiKey.value = ''
  apiSecret.value = ''
  validateAndConnect.value = initial.validateAndConnect
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

    <section
      aria-labelledby="provider-identification-title"
      class="provider-form-section"
    >
      <h5 id="provider-identification-title">Identificação</h5>
      <label>
        <span>Nome da conta</span>
        <input v-model.trim="label" autocomplete="off" maxlength="64" required>
      </label>
    </section>

    <section
      aria-labelledby="provider-markets-title"
      class="provider-form-section"
    >
      <h5 id="provider-markets-title">Mercados</h5>
      <fieldset>
        <legend>Mercados autorizados</legend>
        <label><input v-model="spot" type="checkbox"> Spot</label>
        <label><input v-model="futures" type="checkbox"> Futuros</label>
      </fieldset>
    </section>

    <section
      aria-labelledby="provider-credentials-title"
      class="provider-form-section"
    >
      <h5 id="provider-credentials-title">Credenciais</h5>
      <div class="provider-credential-grid">
        <label>
          <span>API key</span>
          <input
            v-model="apiKey"
            autocomplete="off"
            required
            spellcheck="false"
          >
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
      </div>
    </section>

    <section
      aria-labelledby="provider-save-title"
      class="provider-form-section"
    >
      <h5 id="provider-save-title">Ao salvar</h5>
      <label class="provider-connect-option">
        <input v-model="validateAndConnect" type="checkbox">
        <span>
          <strong>Validar e conectar ao salvar</strong>
          <small>
            Faz uma chamada autenticada de leitura após cifrar a conta.
          </small>
        </span>
      </label>
    </section>

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
