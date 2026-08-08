<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Market, MarketEnvironment } from '@shared/types/market'
import type {
  BinanceAccountDraft,
  ProviderAccountSummary,
} from '@shared/contracts/security'
import {
  MAX_API_CREDENTIAL_LENGTH,
  MIN_API_CREDENTIAL_LENGTH,
} from '@shared/contracts/security'
import { providerCapabilities } from '@shared/domain/providerCapabilities'
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
const environment = ref<MarketEnvironment>('live')
const spot = ref(true)
const futures = ref(false)
const apiKey = ref('')
const apiSecret = ref('')

/**
 * Immutable once saved: a credential is only valid in the venue that issued
 * it, so changing this on an existing account would describe a key that does
 * not exist. Creating the sibling account is the supported path.
 */
const environmentLocked = computed(() => props.account !== undefined)

const binance = providerCapabilities('binance')
const bothMarketsAllowed = computed(
  () => binance.coversBothMarkets(environment.value),
)

/**
 * Where this credential has to have come from. Named per market because the
 * two testnets are separate sign-ups, and pairing a key with the wrong one
 * fails as "credenciais inválidas" — which reads as a bad key.
 */
const testnetOrigin = computed(() => (
  spot.value ? 'testnet.binance.vision' : 'testnet.binancefuture.com'
))

/*
 * Leaving the test environment restores nothing: production genuinely allows
 * one key across both markets, but a selection narrowed under `test` is still
 * a valid production selection, so there is nothing to undo.
 */
watch(environment, (next) => {
  if (!binance.coversBothMarkets(next) && spot.value && futures.value) {
    futures.value = false
  }
})

/** Radio semantics under `test`, where exactly one market is possible. */
function selectMarket(market: Market): void {
  spot.value = market === 'spot'
  futures.value = market === 'futures'
}

const draft = computed<BinanceAccountDraft>(() => ({
  ...(props.account ? { accountId: props.account.accountId } : {}),
  environment: environment.value,
  label: label.value,
  markets: [
    ...(spot.value ? ['spot' as const] : []),
    ...(futures.value ? ['futures' as const] : []),
  ],
  apiKey: apiKey.value,
  apiSecret: apiSecret.value,
}))

const canSave = computed(() => canSaveBinanceDraft(draft.value))

watch(() => props.account, (account) => {
  const initial = emptyBinanceAccountDraft()
  label.value = account?.label ?? initial.label
  environment.value = account?.environment ?? initial.environment
  spot.value = account?.markets.includes('spot') ?? true
  futures.value = account?.markets.includes('futures') ?? false
  apiKey.value = ''
  apiSecret.value = ''
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
      aria-labelledby="provider-environment-title"
      class="provider-form-section"
    >
      <h5 id="provider-environment-title">Ambiente</h5>
      <fieldset :disabled="environmentLocked">
        <legend>Onde esta credencial é válida</legend>
        <label>
          <input v-model="environment" type="radio" value="live">
          <span>
            <strong>Produção</strong>
            <small>Conta real, dinheiro real.</small>
          </span>
        </label>
        <label>
          <input v-model="environment" type="radio" value="test">
          <span>
            <strong>Testes (testnet)</strong>
            <small>
              Dinheiro fictício. Exige uma chave própria da testnet — uma
              chave de produção não autentica aqui.
            </small>
          </span>
        </label>
      </fieldset>
      <p v-if="environmentLocked" class="provider-form-note">
        O ambiente não muda depois de salvo. Para operar no outro, adicione
        uma conta separada com a credencial dele.
      </p>
    </section>

    <section
      aria-labelledby="provider-markets-title"
      class="provider-form-section"
    >
      <h5 id="provider-markets-title">Mercados</h5>
      <fieldset v-if="bothMarketsAllowed">
        <legend>Mercados autorizados</legend>
        <label><input v-model="spot" type="checkbox"> Spot</label>
        <label><input v-model="futures" type="checkbox"> Futuros</label>
      </fieldset>
      <fieldset v-else>
        <legend>Mercado desta credencial</legend>
        <label>
          <input
            :checked="spot"
            name="test-market"
            type="radio"
            @change="selectMarket('spot')"
          >
          Spot
        </label>
        <label>
          <input
            :checked="futures"
            name="test-market"
            type="radio"
            @change="selectMarket('futures')"
          >
          Futuros
        </label>
      </fieldset>
      <p v-if="!bothMarketsAllowed" class="provider-form-note">
        As duas testnets da Binance são cadastros separados, e uma chave só
        vale na sua. Esta credencial precisa ter vindo de
        <strong>{{ testnetOrigin }}</strong>. Para operar no outro mercado,
        cadastre uma conta com a chave de lá.
      </p>
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
            :maxlength="MAX_API_CREDENTIAL_LENGTH"
            :minlength="MIN_API_CREDENTIAL_LENGTH"
            required
            spellcheck="false"
          >
        </label>
        <label>
          <span>API secret</span>
          <input
            v-model="apiSecret"
            autocomplete="new-password"
            :maxlength="MAX_API_CREDENTIAL_LENGTH"
            :minlength="MIN_API_CREDENTIAL_LENGTH"
            required
            spellcheck="false"
            type="password"
          >
        </label>
      </div>
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
