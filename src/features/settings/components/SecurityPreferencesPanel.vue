<script setup lang="ts">
import { MonitorDown, ShieldCheck, TimerReset } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import type {
  SecurityPreferences,
  SecuritySnapshot,
} from '@shared/contracts/security'
import { useSecuritySession } from '@security/services/securitySession'

const props = defineProps<{
  snapshot: SecuritySnapshot
}>()

const session = useSecuritySession()
const draft = ref<SecurityPreferences>({ ...props.snapshot.preferences })
const pending = ref(false)
const error = ref<string>()
const isLinux = computed(() => window.cryptoPro?.platform === 'linux')
const securityStatusLabel = computed(() => (
  props.snapshot.state === 'unlocked'
    ? 'Cofre desbloqueado'
    : 'Cofre bloqueado'
))

watch(() => props.snapshot.preferences, (preferences) => {
  if (!pending.value) {
    draft.value = { ...preferences }
  }
}, { deep: false })

async function save(): Promise<void> {
  pending.value = true
  error.value = undefined
  try {
    await session.request({
      kind: 'update-preferences',
      preferences: { ...draft.value },
    })
  } catch {
    draft.value = { ...props.snapshot.preferences }
    error.value = 'Não foi possível salvar as preferências de segurança.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="settings-content security-preferences-panel">
    <div class="settings-section-heading">
      <div>
        <span>SEGURANÇA E SESSÃO</span>
        <h3>Bloqueio automático</h3>
        <p>
          Gráfico, livro e dados públicos continuam ativos quando a conta é
          bloqueada.
        </p>
      </div>
      <span class="security-panel-status">
        <ShieldCheck aria-hidden="true" />
        {{ securityStatusLabel }}
      </span>
    </div>

    <form class="security-preferences-form" @submit.prevent="save">
      <label>
        <input
          v-model="draft.lockOnMinimize"
          :disabled="pending"
          type="checkbox"
        >
        <span>
          <strong>Bloquear ao minimizar</strong>
          <small>Protege as contas privadas antes de ocultar a janela.</small>
        </span>
      </label>
      <label>
        <input
          v-model="draft.lockOnSuspend"
          :disabled="pending"
          type="checkbox"
        >
        <span>
          <strong>Bloquear ao suspender</strong>
          <small>
            Também se aplica ao bloqueio de sessão quando o sistema oferece o
            evento.
            <template v-if="isLinux">
              Indisponível para lock-screen no Linux.
            </template>
          </small>
        </span>
      </label>

      <label class="security-preference-select">
        <span><TimerReset aria-hidden="true" /> Tempo de inatividade</span>
        <select v-model.number="draft.idleTimeoutMinutes" :disabled="pending">
          <option :value="0">Nunca nesta sessão</option>
          <option
            v-for="minutes in [1, 5, 15, 30, 60, 120]"
            :key="minutes"
            :value="minutes"
          >
            {{ minutes }} minutos
          </option>
        </select>
      </label>

      <label class="security-preference-select">
        <span>
          <MonitorDown aria-hidden="true" /> Ao fechar a janela principal
        </span>
        <select v-model="draft.closeAction" :disabled="pending">
          <option value="quit-and-lock">Encerrar e bloquear</option>
          <option value="lock-and-minimize">Bloquear e minimizar</option>
        </select>
      </label>

      <p v-if="error" class="security-access-error" role="alert">
        {{ error }}
      </p>
      <footer>
        <button :disabled="pending" class="primary" type="submit">
          {{ pending ? 'Salvando…' : 'Salvar preferências' }}
        </button>
      </footer>
    </form>
  </section>
</template>
