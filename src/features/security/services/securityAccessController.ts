import { ref } from 'vue'
import {
  validatePersonalPassword,
} from '@shared/domain/personalPassword'
import type {
  SecurityRequest,
  SecuritySnapshot,
  SecurityState,
} from '@shared/contracts/security'

export type SecurityAccessMode = 'setup' | 'unlock' | 'change-password' | 'reset'

interface SecurityRequestSession {
  request(request: SecurityRequest): Promise<SecuritySnapshot>
}

function modeForState(state: SecurityState): SecurityAccessMode {
  return state === 'setup-required' ? 'setup' : 'unlock'
}

export function createSecurityAccessController(
  session: SecurityRequestSession,
) {
  const mode = ref<SecurityAccessMode>('unlock')
  const password = ref('')
  const confirmation = ref('')
  const currentPassword = ref('')
  const pending = ref(false)
  const error = ref<string>()

  function clear(): void {
    password.value = ''
    confirmation.value = ''
    currentPassword.value = ''
    error.value = undefined
  }

  function openForState(state: SecurityState): void {
    clear()
    mode.value = modeForState(state)
  }

  function setMode(nextMode: SecurityAccessMode): void {
    clear()
    mode.value = nextMode
  }

  async function submitSetup(): Promise<boolean> {
    if (password.value !== confirmation.value) {
      error.value = 'As senhas não coincidem.'
      return false
    }
    if (!validatePersonalPassword(password.value).valid) {
      error.value = 'Use uma senha forte com ao menos 8 caracteres.'
      return false
    }
    return submit({ kind: 'setup', password: password.value })
  }

  async function submitUnlock(): Promise<boolean> {
    if (!password.value) {
      error.value = 'Informe sua senha pessoal.'
      return false
    }
    return submit({ kind: 'unlock', password: password.value })
  }

  async function submitPasswordChange(): Promise<boolean> {
    if (password.value !== confirmation.value) {
      error.value = 'As senhas não coincidem.'
      return false
    }
    if (!validatePersonalPassword(password.value).valid) {
      error.value = 'Use uma senha forte com ao menos 8 caracteres.'
      return false
    }
    return submit({
      kind: 'change-password',
      currentPassword: currentPassword.value,
      nextPassword: password.value,
    })
  }

  async function submitReset(): Promise<boolean> {
    if (confirmation.value !== 'APAGAR') {
      error.value = 'Digite APAGAR para confirmar a remoção.'
      return false
    }
    return submit({ kind: 'reset-vault', confirmation: 'APAGAR' })
  }

  async function lock(): Promise<void> {
    try {
      await session.request({ kind: 'lock' })
    } finally {
      clear()
    }
  }

  async function submit(request: SecurityRequest): Promise<boolean> {
    pending.value = true
    error.value = undefined
    try {
      await session.request(request)
      clear()
      return true
    } catch {
      clear()
      error.value = 'Não foi possível concluir a operação de segurança.'
      return false
    } finally {
      pending.value = false
    }
  }

  return {
    mode,
    password,
    confirmation,
    currentPassword,
    pending,
    error,
    clear,
    openForState,
    setMode,
    submitSetup,
    submitUnlock,
    submitPasswordChange,
    submitReset,
    lock,
  }
}
