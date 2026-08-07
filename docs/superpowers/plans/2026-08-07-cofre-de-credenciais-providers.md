# Cofre de credenciais e conexões privadas de providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um cofre local cifrado por senha, configurar múltiplas contas
Binance e bloquear recursos privados sem afetar dados públicos em tempo real.

**Architecture:** O processo principal será o dono exclusivo de senha, chave
derivada, cofre e conectores autenticados. `shared/` define contratos planos e
validados; preload expõe apenas comandos mínimos; Vue renderiza somente estado
mascarado e preferências de baixo volume. O provider autenticado é separado do
`MarketDataProvider`, logo nenhum segredo chega ao `utilityProcess` de candles,
livro ou catálogo.

**Tech Stack:** Electron 43, Node `crypto` (`scrypt` assíncrono e
AES-256-GCM), Vue 3 Composition API, TypeScript estrito, Vitest e Electron IPC.

## Global Constraints

- Nunca persistir ou retornar em resposta IPC senha, API key completa, secret,
  chave derivada ou documento decifrado.
- O arquivo do cofre fica em `app.getPath('userData')`, é cifrado, escrito por
  arquivo temporário e rename atômico; em POSIX usar modo `0600`.
- Usar `scrypt` V1 com `N=32_768`, `r=8`, `p=1`, `maxmem=64 MiB`, `salt` de
  16 bytes e chave de 32 bytes; usar AES-256-GCM com IV aleatório de 12 bytes
  e tag de 16 bytes em toda escrita.
- `safeStorage` não é alternativa ao cofre por senha e nenhum backend
  `basic_text` é aceito para guardar credenciais.
- O renderer começa em modo público e bloqueado; market data, gráfico, livro,
  temas e desenhos permanecem independentes de segurança e nunca recebem
  credenciais.
- Toda conta Binance é HMAC nesta entrega. Validar apenas endpoints privados de
  leitura de Spot e Futures; não enviar ordem, abrir stream privado, exibir
  saldo, posições ou histórico.
- Alterações no caminho quente exigem medição. Esta entrega não adiciona estado
  reativo, listener por tick ou trabalho de credencial a candles/livro.
- Manter aliases em `electron.vite.config.ts`, `vitest.config.ts` e
  `tsconfig.json` sincronizados ao criar `@security` e `@providers`.
- Após cada alteração de código, executar
  `npm run typecheck && npx eslint . && npx vitest run && npm run build`.

---

## Estrutura de arquivos

```text
shared/
├── contracts/security.ts                    # DTOs, requests, eventos e guards IPC
└── domain/personalPassword.ts               # política pura de senha
electron/main/
├── security/
│   ├── vaultCrypto.ts                       # KDF, envelope AES-GCM e limpeza de Buffer
│   ├── vaultRepository.ts                   # leitura/escrita atômica do cofre
│   ├── securityPreferences.ts               # preferências não sensíveis do main
│   ├── securitySession.ts                   # sessão, multi-conta, timeout e lock
│   ├── securityLifecycle.ts                 # minimização, suspensão, close e quit
│   └── registerSecurityIPC.ts               # trusted sender e comandos IPC
└── providers/
    ├── accountProvider.ts                   # contrato de provider autenticado
    └── binance/binanceAccountProvider.ts    # assinatura HMAC e validação de leitura
src/
├── platform/desktop/security.ts             # adapter do contextBridge sem segredos
└── features/
    ├── security/
    │   ├── services/securitySession.ts      # estado Vue de baixo volume
    │   ├── services/securityAccessController.ts
    │   └── components/SecurityAccessDialog.vue
    ├── providers/
    │   ├── services/providerAccounts.ts
    │   └── components/
    │       ├── ProviderAccountsPanel.vue
    │       └── BinanceAccountForm.vue
    └── settings/components/SecurityPreferencesPanel.vue
```

Testes ficam ao lado dos módulos TypeScript. Não adicionar `@vue/test-utils` ou
outro runtime de DOM: a regra, crypto, IPC e sessão são testáveis sem DOM; os
componentes receberão validação manual dirigida.

### Task 1: Contrato neutro e política de senha

**Files:**
- Create: `shared/contracts/security.ts`
- Create: `shared/contracts/security.test.ts`
- Create: `shared/domain/personalPassword.ts`
- Create: `shared/domain/personalPassword.test.ts`
- Modify: `shared/contracts/desktop.ts`

**Interfaces:**
- Produces: `SecurityState`, `SecuritySnapshot`, `SecurityPreferences`,
  `ProviderAccountSummary`, `BinanceAccountDraft`, `SecurityRequest`,
  `SecurityEvent`, `DesktopSecurityAPI`, `isSecurityRequest()` e
  `validatePersonalPassword()`.
- Consumes: `Market` de `@shared/types/market`.
- Consumed by: crypto/main session, preload, platform adapter e componentes.

- [ ] **Step 1: Escrever os testes que falham para senha e payloads IPC**

```ts
it('accepts only a password with every required character class', () => {
  expect(validatePersonalPassword('Abcdef1!')).toEqual({ valid: true })
  expect(validatePersonalPassword('abcdef1!').valid).toBe(false)
  expect(validatePersonalPassword('Abcdefgh!').valid).toBe(false)
})

it('rejects a provider draft with oversized or missing secret fields', () => {
  expect(isSecurityRequest({
    kind: 'save-binance-account',
    draft: { label: 'Conta', markets: ['spot'], apiKey: 'a', apiSecret: '' },
  })).toBe(false)
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run shared/domain/personalPassword.test.ts shared/contracts/security.test.ts`  
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implementar tipos, canais e validação sem segredo de saída**

```ts
export type SecurityState = 'setup-required' | 'locked' | 'unlocking' | 'unlocked'
export type AccountConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'failed'
export type IdleTimeoutMinutes = 0 | 1 | 5 | 15 | 30 | 60 | 120

export interface SecurityPreferences {
  lockOnMinimize: boolean
  lockOnSuspend: boolean
  idleTimeoutMinutes: IdleTimeoutMinutes
  closeAction: 'quit-and-lock' | 'lock-and-minimize'
}

export interface ProviderAccountSummary {
  accountId: string
  provider: 'binance'
  label: string
  markets: readonly Market[]
  apiKeySuffix: string
  enabled: boolean
  connection: AccountConnectionState
  failureCode?: 'credentials' | 'permission' | 'clock' | 'network' | 'unknown'
}

export interface DesktopSecurityAPI {
  getSnapshot(): Promise<SecuritySnapshot>
  request(request: SecurityRequest): Promise<SecuritySnapshot>
  onState(callback: (snapshot: SecuritySnapshot) => void): () => void
}
```

Use `DESKTOP_CHANNELS.securityRequest` e `DESKTOP_CHANNELS.securityEvent` em
`desktop.ts`, importe os tipos de `security.ts` e acrescente `security` a
`CryptoProDesktopAPI`. `SecuritySnapshot.accounts` deve ser `[]` enquanto o
estado não for `unlocked`; `SecurityRequest` pode transportar senha ou rascunho,
mas `SecurityEvent` e `SecuritySnapshot` não podem conter tais campos.

- [ ] **Step 4: Executar os testes de contrato**

Run: `npx vitest run shared/domain/personalPassword.test.ts shared/contracts/security.test.ts`  
Expected: PASS, incluindo senha de 8/128 caracteres, quatro classes, timeout
permitido, lista de mercados sem duplicação e ausência de segredo no snapshot.

- [ ] **Step 5: Commit**

```bash
git add shared/contracts/desktop.ts shared/contracts/security.ts \
  shared/contracts/security.test.ts shared/domain/personalPassword.ts \
  shared/domain/personalPassword.test.ts
git commit -m "feat: define security contracts and password policy"
```

### Task 2: Cifra do cofre e persistência atômica

**Files:**
- Create: `electron/main/security/vaultCrypto.ts`
- Create: `electron/main/security/vaultCrypto.test.ts`
- Create: `electron/main/security/vaultRepository.ts`
- Create: `electron/main/security/vaultRepository.test.ts`

**Interfaces:**
- Consumes: `validatePersonalPassword()` da Task 1.
- Produces: `EncryptedCredentialVaultV1`, `VaultContents`, `VaultCrypto`,
  `VaultRepository`, `VaultUnlockError` e `VaultIntegrityError`.
- Consumed by: `SecuritySession` da Task 4.

- [ ] **Step 1: Escrever testes de cifra, adulteração e arquivo**

```ts
it('round-trips accounts without writing their plaintext to the envelope', async () => {
  const envelope = await crypto.encrypt('Abcdef1!', contents)
  expect(JSON.stringify(envelope)).not.toContain('binance-secret')
  await expect(crypto.decrypt('Abcdef1!', envelope)).resolves.toEqual(contents)
})

it('rejects a changed authentication tag and leaves the stored vault intact', async () => {
  await repository.write(validEnvelope)
  await expect(crypto.decrypt('Abcdef1!', tamperedEnvelope))
    .rejects.toThrow(VaultIntegrityError)
  await expect(repository.read()).resolves.toEqual(validEnvelope)
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run electron/main/security/vaultCrypto.test.ts electron/main/security/vaultRepository.test.ts`  
Expected: FAIL because crypto and repository are absent.

- [ ] **Step 3: Implementar envelope autenticado e repositório**

```ts
export interface EncryptedCredentialVaultV1 {
  version: 1
  kdf: { name: 'scrypt', N: 32768, r: 8, p: 1, salt: string }
  cipher: { name: 'aes-256-gcm', iv: string, ciphertext: string, authTag: string }
}

export interface VaultContents {
  version: 1
  accounts: ProviderAccountRecord[]
}

export async function deriveVaultKey(
  password: string,
  kdf: EncryptedCredentialVaultV1['kdf'],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.from(kdf.salt, 'base64'), 32, {
      N: kdf.N,
      r: kdf.r,
      p: kdf.p,
      maxmem: 64 * 1024 * 1024,
    }, (error, key) => error ? reject(error) : resolve(Buffer.from(key)))
  })
}
```

Use `randomBytes(16)` para `salt` inicial e `randomBytes(12)` a cada cifra.
Antes de chamar `decipher.final()`, aplique `setAuthTag()`. Aceite somente o
conjunto exato de parâmetros V1 ao decifrar, para impedir downgrade ou consumo
de memória arbitrário. `VaultRepository.write()` deve criar
`credentials.v1.enc.<pid>.<random>.tmp` no mesmo diretório, abrir com modo
`0o600`, `fsync`, renomear e remover o temporário em `finally`. Exponha uma
função `zeroBuffer(buffer?: Buffer)` e chame-a para chaves temporárias depois de
cifrar/decifrar.

- [ ] **Step 4: Executar os testes e a checagem de tipos**

Run: `npm run typecheck && npx vitest run electron/main/security/vaultCrypto.test.ts electron/main/security/vaultRepository.test.ts`  
Expected: PASS para senha errada, tag alterada, IV diferente por escrita,
envelope sem texto simples, rename atômico e `destroy()` removendo o arquivo.

- [ ] **Step 5: Commit**

```bash
git add electron/main/security/vaultCrypto.ts \
  electron/main/security/vaultCrypto.test.ts \
  electron/main/security/vaultRepository.ts \
  electron/main/security/vaultRepository.test.ts
git commit -m "feat: add encrypted credential vault"
```

### Task 3: Provider autenticado Binance de leitura

**Files:**
- Create: `electron/main/providers/accountProvider.ts`
- Create: `electron/main/providers/accountProvider.test.ts`
- Create: `electron/main/providers/binance/binanceAccountProvider.ts`
- Create: `electron/main/providers/binance/binanceAccountProvider.test.ts`

**Interfaces:**
- Consumes: `Market` e os tipos de conta da Task 1.
- Produces: `AccountProvider`, `AccountProviderRegistry`,
  `BinanceAccountProvider` e `AccountMarketValidation`.
- Consumed by: `SecuritySession` da Task 4.

- [ ] **Step 1: Escrever fixtures para assinatura e resposta Binance**

```ts
it('signs the exact ordered query and never includes the secret in the URL', async () => {
  await provider.validateConnection(credentials, ['spot'])
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/v3\/account\?.*signature=/),
    expect.objectContaining({ headers: { 'X-MBX-APIKEY': credentials.apiKey } }),
  )
  expect(String(fetch.mock.calls[0][0])).not.toContain(credentials.apiSecret)
})

it('maps 401, permission, timestamp and network failures to stable codes', async () => {
  await expect(validate(unauthorized)).resolves.toEqual(
    expect.objectContaining({ failureCode: 'credentials' }),
  )
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run electron/main/providers/accountProvider.test.ts electron/main/providers/binance/binanceAccountProvider.test.ts`  
Expected: FAIL because the authenticated provider modules do not exist.

- [ ] **Step 3: Implementar contrato e validação HMAC**

```ts
export interface AccountProvider<C extends ProviderCredentials> {
  readonly id: C['provider']
  validateConnection(
    credentials: C,
    markets: readonly Market[],
  ): Promise<readonly AccountMarketValidation[]>
}

const endpoints = {
  spot: 'https://api.binance.com/api/v3/account',
  futures: 'https://fapi.binance.com/fapi/v2/account',
} as const
```

Monte `timestamp` e `recvWindow=5000` antes de gerar
`createHmac('sha256', apiSecret)`. Envie somente `X-MBX-APIKEY` e a query com
assinatura. Descarte o corpo de resposta após determinar sucesso ou erro; nunca
transforme saldos em DTO. Injete `fetch` e relógio no construtor para testes.
`AccountProviderRegistry` deve ter `get('binance')` e falhar explicitamente
para provider não registrado.

- [ ] **Step 4: Executar os testes de provider**

Run: `npx vitest run electron/main/providers/accountProvider.test.ts electron/main/providers/binance/binanceAccountProvider.test.ts`  
Expected: PASS para Spot, Futures, ambos, assinatura estável, nenhum secret em
URL/log de erro e mapeamento de todos os códigos de falha.

- [ ] **Step 5: Commit**

```bash
git add electron/main/providers/accountProvider.ts \
  electron/main/providers/accountProvider.test.ts \
  electron/main/providers/binance/binanceAccountProvider.ts \
  electron/main/providers/binance/binanceAccountProvider.test.ts
git commit -m "feat: validate authenticated Binance accounts"
```

### Task 4: Sessão de segurança, multi-conta e preferências do main

**Files:**
- Create: `electron/main/security/securityPreferences.ts`
- Create: `electron/main/security/securityPreferences.test.ts`
- Create: `electron/main/security/securitySession.ts`
- Create: `electron/main/security/securitySession.test.ts`

**Interfaces:**
- Consumes: `VaultCrypto`/`VaultRepository` da Task 2 e registry da Task 3.
- Produces: `SecuritySession` com `setup`, `unlock`, `lock`,
  `saveBinanceAccount`, `removeAccount`, `changePassword`, `resetVault`,
  `updatePreferences`, `getSnapshot`, `startIdleTimer` e `shutdown`.
- Consumed by: ciclo de vida e IPC da Task 5.

- [ ] **Step 1: Escrever testes da máquina de estados**

```ts
it('starts public and does not disclose accounts while locked', async () => {
  expect(await session.getSnapshot()).toMatchObject({
    state: 'locked', accounts: [],
  })
})

it('validates enabled accounts with concurrency two after unlock', async () => {
  await session.unlock('Abcdef1!')
  expect(provider.maxConcurrentValidations).toBeLessThanOrEqual(2)
})

it('ignores a late validation after lock and clears the master key', async () => {
  const unlocking = session.unlock('Abcdef1!')
  session.lock('manual')
  await unlocking
  expect(await session.getSnapshot()).toMatchObject({ state: 'locked' })
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run electron/main/security/securityPreferences.test.ts electron/main/security/securitySession.test.ts`  
Expected: FAIL because session and preference modules do not exist.

- [ ] **Step 3: Implementar preferências e sessão com geração de cancelamento**

```ts
export class SecuritySession {
  private state: SecurityState = 'setup-required'
  private vault?: VaultContents
  private masterKey?: Buffer
  private revision = 0

  lock(reason: LockReason): SecuritySnapshot {
    this.revision += 1
    zeroBuffer(this.masterKey)
    this.masterKey = undefined
    this.vault = undefined
    this.state = this.hasVault ? 'locked' : 'setup-required'
    return this.publish(reason)
  }
}
```

`SecurityPreferencesStore` grava `security-preferences.v1.json` no `userData`
com defaults aprovados e valida somente valores de `SecurityPreferences`. A
sessão deve reter a `masterKey` apenas desbloqueada, recifrar o documento com
novo IV ao salvar/remover conta, gerar `crypto.randomUUID()` para contas e
confirmar `reset-vault` somente se `confirmation === 'APAGAR'`.

Para `unlock`, copie o `revision` antes de validar contas e verifique-o antes
de publicar cada resultado. Processe no máximo duas promessas de validação por
vez. O timer chama a função injetada `getSystemIdleTime()` a cada 30 segundos;
`0` não cria timer. A mudança de preferência reinicia o timer imediatamente.

- [ ] **Step 4: Executar os testes de sessão**

Run: `npx vitest run electron/main/security/securityPreferences.test.ts electron/main/security/securitySession.test.ts`  
Expected: PASS para setup, unlock, troca de senha, reset destrutivo, máscara de
API key, multi-conta, lock, timeout, atualização de preferências e validação
tardia descartada.

- [ ] **Step 5: Commit**

```bash
git add electron/main/security/securityPreferences.ts \
  electron/main/security/securityPreferences.test.ts \
  electron/main/security/securitySession.ts \
  electron/main/security/securitySession.test.ts
git commit -m "feat: manage secure account sessions"
```

### Task 5: Ciclo de vida, IPC confiável e preload mínimo

**Files:**
- Create: `electron/main/security/securityLifecycle.ts`
- Create: `electron/main/security/securityLifecycle.test.ts`
- Create: `electron/main/security/registerSecurityIPC.ts`
- Create: `electron/main/security/registerSecurityIPC.test.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/preload/index.ts`
- Modify: `shared/contracts/desktop.ts`

**Interfaces:**
- Consumes: `SecuritySession` da Task 4 e `SecurityRequest` da Task 1.
- Produces: `bindSecurityLifecycle()` e `registerSecurityIPC()`.
- Consumed by: janela principal, preload e adapter do renderer da Task 6.

- [ ] **Step 1: Escrever testes de origem e eventos de vida**

```ts
it('rejects every security request from the search window', async () => {
  await expect(handlers.request(searchSender, { kind: 'get-snapshot' }))
    .rejects.toThrow('Acesso de segurança não permitido')
})

it('locks before minimizing and prevents close when configured to minimize', () => {
  lifecycle.handleClose(closeEvent)
  expect(closeEvent.preventDefault).toHaveBeenCalledOnce()
  expect(session.lock).toHaveBeenCalledWith('window-close')
  expect(window.minimize).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run electron/main/security/securityLifecycle.test.ts electron/main/security/registerSecurityIPC.test.ts`  
Expected: FAIL because lifecycle and IPC modules do not exist.

- [ ] **Step 3: Implementar controle de ciclo e canal IPC**

```ts
export function registerSecurityIPC(options: {
  getMainWebContentsId: () => number | undefined
  session: SecuritySession
  send: (snapshot: SecuritySnapshot) => void
}): () => void {
  const unsubscribe = options.session.subscribe(options.send)
  ipcMain.handle(DESKTOP_CHANNELS.securityRequest, async (event, value) => {
    if (event.sender.id !== options.getMainWebContentsId()) {
      throw new Error('Acesso de segurança não permitido')
    }
    if (!isSecurityRequest(value)) {
      throw new Error('Comando de segurança inválido')
    }
    return options.session.request(value)
  })
  return () => {
    unsubscribe()
    ipcMain.removeHandler(DESKTOP_CHANNELS.securityRequest)
  }
}

export function bindSecurityLifecycle(options: {
  window: BrowserWindow
  powerMonitor: Electron.PowerMonitor
  session: SecuritySession
  isQuitting: () => boolean
}): () => void {
  const onMinimize = () => options.session.lockIfEnabled('minimize')
  const onSuspend = () => options.session.lockIfEnabled('suspend')
  const onClose = (event: Electron.Event) => {
    options.session.lock('window-close')
    if (!options.isQuitting() && options.session.closeAction() === 'lock-and-minimize') {
      event.preventDefault()
      options.window.minimize()
    }
  }
  options.window.on('minimize', onMinimize)
  options.window.on('close', onClose)
  options.powerMonitor.on('suspend', onSuspend)
  return () => {
    options.window.removeListener('minimize', onMinimize)
    options.window.removeListener('close', onClose)
    options.powerMonitor.removeListener('suspend', onSuspend)
  }
}
```

`registerSecurityIPC` aceita exclusivamente `mainWindow.webContents.id`, chama
`isSecurityRequest()` antes do switch e serializa somente `SecuritySnapshot`.
O preload implementa `DesktopSecurityAPI` com `ipcRenderer.invoke` para
requests e um listener removível para estado. Não exponha `ipcRenderer`,
`BrowserWindow`, Node ou detalhes do vault.

Em `index.ts`, construa `SecuritySession` depois de `app.whenReady()`, usando
`app.getPath('userData')` e `powerMonitor.getSystemIdleTime`, registre IPC
antes de abrir a janela e conecte lifecycle ao `BrowserWindow`. `minimize`,
`suspend`, `lock-screen` quando disponível, `before-quit` e `closed` chamam a
sessão. Mantenha `let quitting = false` em `index.ts`, defina-o em
`before-quit` e passe `isQuitting: () => quitting`; o close
`lock-and-minimize` só previne o fechamento quando essa função retorna falso.
`quit-and-lock` deixa a janela fechar depois do lock.

- [ ] **Step 4: Executar testes de ciclo, IPC e preload**

Run: `npm run typecheck && npx vitest run electron/main/security/securityLifecycle.test.ts electron/main/security/registerSecurityIPC.test.ts`  
Expected: PASS para sender confiável, busca negada, evento sem segredo,
minimização, suspensão, close/quit e cleanup dos listeners.

- [ ] **Step 5: Commit**

```bash
git add electron/main/security/securityLifecycle.ts \
  electron/main/security/securityLifecycle.test.ts \
  electron/main/security/registerSecurityIPC.ts \
  electron/main/security/registerSecurityIPC.test.ts \
  electron/main/index.ts electron/preload/index.ts shared/contracts/desktop.ts
git commit -m "feat: expose secure desktop session controls"
```

### Task 6: Adapter desktop e estado Vue de baixo volume

**Files:**
- Create: `src/platform/desktop/security.ts`
- Create: `src/platform/desktop/security.test.ts`
- Create: `src/features/security/services/securitySession.ts`
- Create: `src/features/security/services/securitySession.test.ts`
- Modify: `electron.vite.config.ts`
- Modify: `vitest.config.ts`
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `DesktopSecurityAPI` da Task 1 via `window.cryptoPro.security`.
- Produces: `desktopSecurity()` e `useSecuritySession()` com
`snapshot`, `refresh`, `request`, `start` e `stop`.
- Consumed by: workspace, header e painéis nas Tasks 7–9.

- [ ] **Step 1: Escrever testes do adapter e da assinatura única de estado**

```ts
it('forwards a clone-safe request and never transforms a secret into state', async () => {
  await requestSecurity({ kind: 'unlock', password: 'Abcdef1!' })
  expect(api.request).toHaveBeenCalledWith({ kind: 'unlock', password: 'Abcdef1!' })
  expect(snapshot.value.accounts).not.toContainEqual(
    expect.objectContaining({ apiSecret: expect.anything() }),
  )
})

it('owns one desktop state subscription and releases it on stop', () => {
  const release = session.start()
  release()
  expect(unsubscribe).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run src/platform/desktop/security.test.ts src/features/security/services/securitySession.test.ts`  
Expected: FAIL because the renderer adapter and service do not exist.

- [ ] **Step 3: Implementar o adapter e serviço reativo mínimo**

```ts
export function useSecuritySession() {
  const snapshot = shallowRef<SecuritySnapshot>(INITIAL_SECURITY_SNAPSHOT)
  let stopDesktopListener: (() => void) | undefined

  async function request(request: SecurityRequest): Promise<SecuritySnapshot> {
    const next = await desktopSecurity().request(structuredClone(request))
    snapshot.value = next
    return next
  }

  return { snapshot: readonly(snapshot), request, start, stop, refresh }
}
```

Clone requests before IPC exactly como `marketData.ts`; não transforme retorno
em `reactive`, não guarde rascunhos de conta no serviço e assine o canal uma
única vez por montagem do workspace. Acrescente `@security` e `@providers`
nos três arquivos de aliases e não permita que `src/platform/desktop/security.ts`
importe uma feature.

- [ ] **Step 4: Executar os testes de renderer sem DOM**

Run: `npm run typecheck && npx vitest run src/platform/desktop/security.test.ts src/features/security/services/securitySession.test.ts`  
Expected: PASS para structured clone, estado inicial público, evento de lock e
cleanup de listener.

- [ ] **Step 5: Commit**

```bash
git add src/platform/desktop/security.ts src/platform/desktop/security.test.ts \
  src/features/security/services/securitySession.ts \
  src/features/security/services/securitySession.test.ts \
  electron.vite.config.ts vitest.config.ts tsconfig.json
git commit -m "feat: add renderer security session adapter"
```

### Task 7: Acesso global por senha e guarda visual

**Files:**
- Create: `src/features/security/components/SecurityAccessDialog.vue`
- Create: `src/features/security/services/securityAccessController.ts`
- Create: `src/features/security/services/securityAccessController.test.ts`
- Modify: `src/app/components/AppHeader.vue`
- Modify: `src/features/workspace/components/TradingWorkspace.vue`
- Modify: `src/app/styles/base.css`
- Modify: `src/app/styles/layout.css`

**Interfaces:**
- Consumes: `useSecuritySession()` da Task 6.
- Produces: botão global Entrar/Bloquear e diálogo nos modos `setup`, `unlock`,
  `change-password` e `reset-vault`.
- Consumed by: painel de providers da Task 8.

- [ ] **Step 1: Escrever um teste de serviço para os comandos do diálogo**

```ts
it('only sends setup after confirmation matches and clears pending values', async () => {
  const controller = createSecurityAccessController(session)
  controller.password = 'Abcdef1!'
  controller.confirmation = 'Abcdef1!'
  await controller.submitSetup()
  expect(request).toHaveBeenCalledWith({ kind: 'setup', password: 'Abcdef1!' })
  expect(controller.password).toBe('')
  expect(controller.confirmation).toBe('')
})
```

- [ ] **Step 2: Executar o teste para confirmar a falha**

Run: `npx vitest run src/features/security/services/securityAccessController.test.ts`  
Expected: FAIL because `createSecurityAccessController()` is absent.

- [ ] **Step 3: Implementar o controlador e a interface**

```ts
<button
  :class="['account-access', securityState]"
  type="button"
  @click="emit(securityState === 'unlocked' ? 'lock' : 'access')"
>
  <LockKeyhole v-if="securityState !== 'unlocked'" aria-hidden="true" />
  {{ securityState === 'unlocked' ? 'Bloquear' : 'Entrar' }}
</button>
```

`TradingWorkspace` inicializa e encerra a assinatura de segurança no ciclo de
vida e passa somente `snapshot.state` a `AppHeader`. O diálogo usa `Teleport`
para uma superfície elevada, sem blur/backdrop e sem tocar na grade do
workspace. O formulário usa `autocomplete="new-password"` no setup e
`autocomplete="current-password"` no unlock; limpa refs em `finally`, ao
fechar e depois de erro. O reset exige `APAGAR` e mostra que as contas serão
perdidas. Não renderizar nem interpolar a senha em mensagens de erro.

- [ ] **Step 4: Executar o teste e validar manualmente o fluxo público**

Run: `npx vitest run src/features/security/services/securityAccessController.test.ts`  
Expected: PASS para confirmação, lock e limpeza de valores.

Manual: iniciar sem cofre, abrir/fechar o diálogo, criar senha, bloquear e
confirmar que gráfico, livro, atalhos e streams públicos continuam ativos.

- [ ] **Step 5: Commit**

```bash
git add src/features/security/components/SecurityAccessDialog.vue \
  src/features/security/services/securitySession.ts \
  src/features/security/services/securitySession.test.ts \
  src/features/security/services/securityAccessController.ts \
  src/features/security/services/securityAccessController.test.ts \
  src/app/components/AppHeader.vue src/features/workspace/components/TradingWorkspace.vue \
  src/app/styles/base.css src/app/styles/layout.css
git commit -m "feat: add global account lock controls"
```

### Task 8: Painel multi-conta de providers

**Files:**
- Create: `src/features/providers/components/ProviderAccountsPanel.vue`
- Create: `src/features/providers/components/BinanceAccountForm.vue`
- Create: `src/features/providers/services/providerAccounts.ts`
- Create: `src/features/providers/services/providerAccounts.test.ts`
- Modify: `src/features/settings/components/GeneralSettingsPanel.vue`
- Modify: `src/app/styles/settings.css`

**Interfaces:**
- Consumes: `SecuritySnapshot`, `BinanceAccountDraft` e callback `request()`.
- Produces: lista mascarada, formulário Binance e comandos de adicionar,
  editar, validar ao salvar e remover conta.
- Consumed by: `GeneralSettingsPanel` como seção `providers` já existente.

- [ ] **Step 1: Escrever testes puros de rascunho e máscara**

```ts
it('requires label, one market, api key and secret before save', () => {
  expect(canSaveBinanceDraft(emptyDraft)).toBe(false)
  expect(canSaveBinanceDraft(validDraft)).toBe(true)
})

it('renders only the suffix returned by the main process', () => {
  expect(formatApiKeyHint('••••ABCD')).toBe('••••ABCD')
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run src/features/providers/services/providerAccounts.test.ts`  
Expected: FAIL because the provider UI helpers do not exist.

- [ ] **Step 3: Implementar a seção Provedores**

```ts
export interface BinanceAccountFormProps {
  account?: ProviderAccountSummary
  pending: boolean
}

const emit = defineEmits<{
  save: [draft: BinanceAccountDraft]
  cancel: []
}>()
```

Quando `snapshot.state !== 'unlocked'`, o painel mostra explicação curta e
emite `request-access`; não mostra contagem, aliases ou sufixos de contas. Ao
desbloquear, a lista permite adicionar conta e cada cartão tem status, mercados,
editar e remover. `BinanceAccountForm` mantém API key e secret somente em refs
locais; envia `save-binance-account`, espera o retorno, limpa ambos e fecha
somente no sucesso. Em falha de credencial/permissão/rede, preserve o rascunho
na tela, sem persistir nem copiar a mensagem bruta do provider.

- [ ] **Step 4: Executar teste e validação manual de conta inválida**

Run: `npx vitest run src/features/providers/services/providerAccounts.test.ts`  
Expected: PASS para campos, mercados e máscara.

Manual: inserir credencial inválida e confirmar que nenhum cartão novo aparece
após reiniciar; inserir fixture válida no ambiente opt-in e confirmar cartão
mascarado e status conectado.

- [ ] **Step 5: Commit**

```bash
git add src/features/providers/components/ProviderAccountsPanel.vue \
  src/features/providers/components/BinanceAccountForm.vue \
  src/features/providers/services/providerAccounts.ts \
  src/features/providers/services/providerAccounts.test.ts \
  src/features/settings/components/GeneralSettingsPanel.vue \
  src/app/styles/settings.css
git commit -m "feat: configure multiple Binance accounts"
```

### Task 9: Tela Segurança e sessão e integração de preferências

**Files:**
- Create: `src/features/settings/components/SecurityPreferencesPanel.vue`
- Modify: `src/features/settings/components/GeneralSettingsPanel.vue`
- Modify: `src/app/styles/settings.css`
- Modify: `electron/main/security/securityLifecycle.ts`
- Modify: `electron/main/security/securityLifecycle.test.ts`

**Interfaces:**
- Consumes: `SecurityPreferences` e `request({ kind: 'update-preferences' })`.
- Produces: editor persistido para minimizar, suspensão, timeout e close action.
- Consumed by: `SecurityLifecycle` da Task 5.

- [ ] **Step 1: Escrever testes para normalização de preferências**

```ts
it('persists allowed timeout values and restarts the idle timer', async () => {
  await session.updatePreferences({ ...defaults, idleTimeoutMinutes: 30 })
  expect(interval.clear).toHaveBeenCalledOnce()
  expect(interval.start).toHaveBeenCalledWith(30_000)
})

it('does not attach unavailable lock-screen events on Linux', () => {
  lifecycle.bind()
  expect(powerMonitor.on).not.toHaveBeenCalledWith('lock-screen', expect.any(Function))
})
```

- [ ] **Step 2: Executar os testes para confirmar a falha**

Run: `npx vitest run electron/main/security/securityPreferences.test.ts electron/main/security/securityLifecycle.test.ts`  
Expected: FAIL for the newly specified timeout restart and platform guard.

- [ ] **Step 3: Implementar o painel e completar o ciclo de vida**

```vue
<fieldset class="security-preferences">
  <label><input v-model="draft.lockOnMinimize" type="checkbox"> Bloquear ao minimizar</label>
  <label><input v-model="draft.lockOnSuspend" type="checkbox"> Bloquear ao suspender ou bloquear sessão</label>
  <select v-model.number="draft.idleTimeoutMinutes" aria-label="Tempo de inatividade">
    <option :value="0">Nunca nesta sessão</option>
    <option v-for="minutes in [1, 5, 15, 30, 60, 120]" :key="minutes" :value="minutes">
      {{ minutes }} minutos
    </option>
  </select>
</fieldset>
```

O painel fica em **Geral > Segurança e sessão** e funciona bloqueado. Salve por
`update-preferences` ao confirmar, revertendo o rascunho se a chamada falhar.
Apresente `lock-screen` como indisponível em Linux, mas preserve o checkbox para
outros sistemas e aplique sempre `suspend`. Ação de fechar usa labels claros:
`Encerrar e bloquear` e `Bloquear e minimizar`. Após trocar preferência, valide
com a próxima ocorrência do evento — sem recarregar gráfico ou reiniciar dados.

- [ ] **Step 4: Executar os testes e validar os gatilhos**

Run: `npx vitest run electron/main/security/securityPreferences.test.ts electron/main/security/securityLifecycle.test.ts`  
Expected: PASS para defaults, persistência, timeout, minimização, suspensão,
Linux sem evento de lock-screen e as duas ações de fechar.

Manual: mudar cada preferência, reiniciar a aplicação, reproduzir o gatilho e
confirmar retorno ao estado bloqueado sem pausa em gráfico ou livro.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/components/SecurityPreferencesPanel.vue \
  src/features/settings/components/GeneralSettingsPanel.vue \
  src/app/styles/settings.css electron/main/security/securityLifecycle.ts \
  electron/main/security/securityLifecycle.test.ts \
  electron/main/security/securityPreferences.test.ts
git commit -m "feat: configure account lock preferences"
```

### Task 10: Endurecimento final, documentação e validação de performance

**Files:**
- Modify: `docs/specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md`
- Modify: `docs/architecture.md`
- Modify: `docs/testing/strategy.md`

**Interfaces:**
- Consumes: todos os módulos das Tasks 1–9.
- Produces: F-018 com fontes de verdade finais, testes reais e critérios de
  aceite marcados somente após evidência.

- [ ] **Step 1: Escrever os testes de regressão ainda ausentes**

```ts
it('never serializes a secret through a security event', async () => {
  await session.saveBinanceAccount(validDraft)
  expect(JSON.stringify(lastSecurityEvent)).not.toContain(validDraft.apiSecret)
  expect(JSON.stringify(lastSecurityEvent)).not.toContain(validDraft.apiKey)
})

it('keeps public market data independent after security lock', async () => {
  session.lock('manual')
  await expect(marketCoordinator.request(publicCatalogRequest)).resolves.toBeDefined()
})
```

- [ ] **Step 2: Executar a suíte específica para confirmar cobertura**

Run: `npx vitest run shared/contracts/security.test.ts electron/main/security electron/main/providers src/platform/desktop/security.test.ts src/features/security`  
Expected: PASS, incluindo serialização sem segredo, lock durante validação e
independência de dados públicos.

- [ ] **Step 3: Atualizar documentação com os arquivos finais**

Atualize F-018 de `planejada` para `implementada` somente depois dos critérios
verificados; substitua fontes previstas pelos caminhos criados e liste testes
reais. Em `architecture.md`, acrescente `main/security` e `main/providers`
abaixo da camada desktop, deixando explícito que utility processes não possuem
credenciais. Em `testing/strategy.md`, documente fixtures HMAC e o live test
opt-in por `BINANCE_ACCOUNT_LIVE_TEST=1`, `BINANCE_ACCOUNT_API_KEY` e
`BINANCE_ACCOUNT_API_SECRET`; os valores só vêm do ambiente e nunca aparecem
em saída de teste.

- [ ] **Step 4: Executar verificação completa e medição manual**

Run: `npm run typecheck && npx eslint . && npx vitest run && npm run build`  
Expected: exit code 0; warnings existentes de `max-len` permanecem tolerados,
sem novos erros.

Manual: abrir gráfico com livro e oito indicadores, registrar Performance no
DevTools, executar setup/unlock/save/lock e confirmar ausência de long task
acima de 50 ms no renderer e continuidade dos dois streams públicos.

- [ ] **Step 5: Commit**

```bash
git add docs/specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md \
  docs/architecture.md docs/testing/strategy.md
git commit -m "docs: finalize secure provider credentials feature"
```

## Revisão do plano

- **Cobertura da spec:** Tasks 1–2 implementam senha e armazenamento cifrado;
  Tasks 3–5 separam provider autenticado, sessão, IPC e bloqueio; Tasks 6–9
  entregam botão Entrar, painel multi-conta e preferências; Task 10 mede,
  documenta e fecha critérios de aceite.
- **Segredos:** nenhuma interface de evento ou retorno contém campo secreto;
  credenciais entram somente em `SecurityRequest` de setup, unlock, troca ou
  save e são processadas no main.
- **Isolamento:** não há alteração de `MarketChart.vue`, `OrderBook.vue`,
  `MarketDataCoordinator` ou `utility/market-data`; o teste final comprova a
  continuidade deles durante fluxos de cofre.
- **Consistência:** as assinaturas produzidas por Tasks 1–6 são as consumidas
  pelas Tasks 7–9; `SecuritySession` é o único dono da transição de estado.
