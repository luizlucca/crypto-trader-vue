<script setup lang="ts">
import { KeyRound, LockKeyhole, ShieldCheck, X } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type {
  SecuritySnapshot,
  SecurityState,
} from '@shared/contracts/security'
import {
  createSecurityAccessController,
  type SecurityAccessMode,
} from '@security/services/securityAccessController'
import { useSecuritySession } from '@security/services/securitySession'
import {
  bindSecurityAccessDialogEscape,
} from '@security/services/securityAccessDialogEscape'

const props = defineProps<{
  open: boolean
  state: SecurityState
  mode?: SecurityAccessMode
}>()

const emit = defineEmits<{
  close: []
  authenticated: [snapshot: SecuritySnapshot]
  passwordChanged: [snapshot: SecuritySnapshot]
}>()

const session = useSecuritySession()
const controller = createSecurityAccessController(session)
const passwordInput = ref<HTMLInputElement>()
const confirmationInput = ref<HTMLInputElement>()
const currentPasswordInput = ref<HTMLInputElement>()
let releaseEscape: (() => void) | undefined
let dialogCycle = 0
let active = true

const isSetup = computed(() => controller.mode.value === 'setup')
const isReset = computed(() => controller.mode.value === 'reset')
const isUnlock = computed(() => controller.mode.value === 'unlock')
const isPasswordChange = computed(
  () => controller.mode.value === 'change-password',
)
const dialogTitle = computed(() => {
  if (isSetup.value) {
    return 'Proteger credenciais'
  }
  if (isReset.value) {
    return 'Apagar credenciais'
  }
  return isPasswordChange.value ? 'Alterar senha' : 'Desbloquear plataforma'
})
const submitLabel = computed(() => {
  if (isSetup.value) {
    return 'Criar cofre seguro'
  }
  if (isReset.value) {
    return 'Apagar credenciais'
  }
  return isPasswordChange.value ? 'Alterar senha' : 'Entrar'
})

watch(() => props.open, async (open) => {
  dialogCycle += 1
  releaseEscape?.()
  if (open) {
    releaseEscape = bindSecurityAccessDialogEscape(
      document,
      close,
      () => controller.pending.value,
    )
  } else {
    releaseEscape = undefined
  }
  if (!open) {
    controller.clear()
    return
  }
  if (props.mode === 'change-password') {
    controller.setMode('change-password')
  } else {
    controller.openForState(props.state)
  }
  await nextTick()
  ;(isPasswordChange.value
    ? currentPasswordInput
    : passwordInput).value?.focus()
}, { immediate: true })

onBeforeUnmount(() => {
  active = false
  dialogCycle += 1
  releaseEscape?.()
  releaseEscape = undefined
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
  if (controller.pending.value) {
    return
  }
  controller.clear()
  emit('close')
}

async function submit(): Promise<void> {
  const cycle = dialogCycle
  const reset = isReset.value
  const passwordChange = isPasswordChange.value
  let snapshot: SecuritySnapshot | undefined
  if (reset) {
    snapshot = await controller.submitReset()
  } else if (isSetup.value) {
    snapshot = await controller.submitSetup()
  } else if (passwordChange) {
    snapshot = await controller.submitPasswordChange()
  } else {
    snapshot = await controller.submitUnlock()
  }
  if (!snapshot || !active || !props.open || cycle !== dialogCycle) {
    return
  }
  if (passwordChange) {
    emit('passwordChanged', snapshot)
  } else if (!reset) {
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
        <button
          aria-label="Fechar"
          :disabled="controller.pending.value"
          type="button"
          @click="close"
        >
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
          <template v-else-if="isPasswordChange">
            Confirme sua senha atual e escolha uma nova senha pessoal.
          </template>
          <template v-else>
            Sua senha não pode ser recuperada. Confirme a remoção das
            credenciais locais.
          </template>
        </p>

        <label v-if="isPasswordChange">
          <span>Senha atual</span>
          <input
            ref="currentPasswordInput"
            v-model="controller.currentPassword.value"
            autocomplete="current-password"
            :disabled="controller.pending.value"
            minlength="8"
            required
            type="password"
          >
        </label>

        <label v-if="!isReset">
          <span>{{ isPasswordChange ? 'Nova senha' : 'Senha pessoal' }}</span>
          <input
            ref="passwordInput"
            v-model="controller.password.value"
            :autocomplete="isSetup || isPasswordChange
              ? 'new-password'
              : 'current-password'"
            :disabled="controller.pending.value"
            minlength="8"
            required
            type="password"
          >
        </label>

        <label v-if="isSetup || isPasswordChange">
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

        <p v-if="isSetup || isPasswordChange" class="security-access-hint">
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
