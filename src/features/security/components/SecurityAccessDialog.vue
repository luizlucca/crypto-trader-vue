<script setup lang="ts">
import { KeyRound, LockKeyhole, ShieldCheck, X } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import type {
  SecuritySnapshot,
  SecurityState,
} from '@shared/contracts/security'
import {
  createSecurityAccessController,
} from '@security/services/securityAccessController'
import { useSecuritySession } from '@security/services/securitySession'

const props = defineProps<{
  open: boolean
  state: SecurityState
}>()

const emit = defineEmits<{
  close: []
  authenticated: [snapshot: SecuritySnapshot]
}>()

const session = useSecuritySession()
const controller = createSecurityAccessController(session)
const passwordInput = ref<HTMLInputElement>()
const confirmationInput = ref<HTMLInputElement>()

const isSetup = computed(() => controller.mode.value === 'setup')
const isReset = computed(() => controller.mode.value === 'reset')
const isUnlock = computed(() => controller.mode.value === 'unlock')
const dialogTitle = computed(() => (
  isSetup.value
    ? 'Proteger credenciais'
    : isReset.value
      ? 'Apagar credenciais'
      : 'Desbloquear plataforma'
))
const submitLabel = computed(() => (
  isSetup.value
    ? 'Criar cofre seguro'
    : isReset.value
      ? 'Apagar credenciais'
      : 'Entrar'
))

watch(() => props.open, async (open) => {
  if (!open) {
    controller.clear()
    return
  }
  controller.openForState(props.state)
  await nextTick()
  passwordInput.value?.focus()
})

function showReset(): void {
  controller.setMode('reset')
  void nextTick(() => confirmationInput.value?.focus())
}

function returnToUnlock(): void {
  controller.setMode('unlock')
  void nextTick(() => passwordInput.value?.focus())
}

function close(): void {
  controller.clear()
  emit('close')
}

async function submit(): Promise<void> {
  const reset = isReset.value
  const snapshot = reset
    ? await controller.submitReset()
    : isSetup.value
      ? await controller.submitSetup()
      : await controller.submitUnlock()
  if (!snapshot) {
    return
  }
  if (!reset) {
    emit('authenticated', snapshot)
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <section
      v-if="open"
      aria-describedby="security-access-description"
      aria-labelledby="security-access-title"
      aria-modal="true"
      class="security-access-dialog"
      role="dialog"
      @keydown.esc="close"
    >
      <header class="security-access-header">
        <span class="security-access-icon">
          <ShieldCheck v-if="isSetup" aria-hidden="true" />
          <LockKeyhole v-else aria-hidden="true" />
        </span>
        <div>
          <p>Credenciais locais</p>
          <h2 id="security-access-title">{{ dialogTitle }}</h2>
        </div>
        <button aria-label="Fechar" type="button" @click="close">
          <X aria-hidden="true" />
        </button>
      </header>

      <form class="security-access-form" @submit.prevent="submit">
        <p
          id="security-access-description"
          class="security-access-description"
        >
          <template v-if="isSetup">
            Sua senha cifra as credenciais neste computador. Ela não pode ser
            recuperada.
          </template>
          <template v-else-if="isUnlock">
            Dados públicos continuam ativos. Entre para acessar contas privadas.
          </template>
          <template v-else>
            Sua senha não pode ser recuperada. Confirme a remoção das
            credenciais locais.
          </template>
        </p>

        <label v-if="!isReset">
          <span>Senha pessoal</span>
          <input
            ref="passwordInput"
            v-model="controller.password.value"
            :autocomplete="isSetup ? 'new-password' : 'current-password'"
            :disabled="controller.pending.value"
            minlength="8"
            required
            type="password"
          >
        </label>

        <label v-if="isSetup">
          <span>Confirmar senha</span>
          <input
            v-model="controller.confirmation.value"
            autocomplete="new-password"
            :disabled="controller.pending.value"
            minlength="8"
            required
            type="password"
          >
        </label>

        <template v-if="isReset">
          <p class="security-reset-warning">
            Sua senha não pode ser recuperada. Todas as API keys, secrets,
            contas e conexões salvas serão apagadas e precisarão ser
            cadastradas novamente.
          </p>
          <label>
            <span>Digite APAGAR para confirmar</span>
            <input
              ref="confirmationInput"
              v-model="controller.confirmation.value"
              :disabled="controller.pending.value"
              autocomplete="off"
            >
          </label>
        </template>

        <p v-if="isSetup" class="security-access-hint">
          Use 8+ caracteres, com maiúscula, minúscula, número e símbolo.
        </p>
        <button
          v-if="isUnlock"
          class="security-access-recovery"
          :disabled="controller.pending.value"
          type="button"
          @click="showReset"
        >
          Esqueci minha senha
        </button>
        <p
          v-if="controller.error.value"
          class="security-access-error"
          role="alert"
        >
          {{ controller.error.value }}
        </p>

        <footer>
          <button
            v-if="isReset"
            class="secondary"
            :disabled="controller.pending.value"
            type="button"
            @click="returnToUnlock"
          >
            Voltar
          </button>
          <button
            v-else
            class="secondary"
            :disabled="controller.pending.value"
            type="button"
            @click="close"
          >
            Cancelar
          </button>
          <button
            :class="isReset ? 'danger' : 'primary'"
            :disabled="controller.pending.value"
            type="submit"
          >
            <KeyRound aria-hidden="true" />
            {{ controller.pending.value
              ? 'Verificando…'
              : submitLabel
            }}
          </button>
        </footer>
      </form>
    </section>
  </Teleport>
</template>
