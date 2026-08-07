# Secure Provider Connection Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete password recovery, active-account selection, authenticated connection feedback, generic provider enrollment and private-ticket visibility without coupling private state to public market streams.

**Architecture:** `SecuritySession` continues to own the decrypted vault, while a new main-process `ProviderConnectionCoordinator` owns the single ephemeral active account and rejects stale validation results. Vue consumes one low-frequency security snapshot, routes the zero/one/many-account flow through focused components, and mounts the trading ticket only for a connected active account.

**Tech Stack:** Electron 43, Vue 3.5 Composition API with `<script setup lang="ts">`, TypeScript, Vitest, Lucide Vue, Node crypto and the existing main/preload IPC boundary.

## Global Constraints

- API key, API secret, password, derived key and decrypted vault content must never be returned by IPC, logged or persisted in renderer storage.
- Only one provider account may be active in an unlocked session; the selection is never persisted and is cleared by every lock path.
- Unlocking must not validate every stored account.
- This increment validates authenticated access only; it must not query balances, positions, order history or private streams.
- The trading ticket is mounted only when the active provider connection is `connected`.
- Candles, order book, indicators and drawings must remain independent of all private-account UI and connection state.
- Existing encrypted vaults containing the legacy `enabled` property must remain readable.
- New behavior follows strict red-green-refactor TDD.

## Execution Note

Tasks 1–3 form one atomic migration. The contract cannot remove the legacy
`enabled` field or add explicit connection requests while the old session
still performs automatic validation. Implement and verify their combined
result before creating the migration commit; Tasks 4–8 remain independent.

---

### Task 1: Evolve security contracts and normalize legacy vault records

**Files:**
- Modify: `shared/contracts/security.ts`
- Modify: `shared/contracts/security.test.ts`
- Modify: `electron/main/security/vaultCrypto.ts`
- Modify: `electron/main/security/vaultCrypto.test.ts`
- Modify: `electron/main/security/vaultRepository.test.ts`
- Modify: `electron/main/security/securitySession.test.ts`
- Modify: `electron/main/security/registerSecurityIPC.test.ts`
- Modify: `src/features/providers/services/providerAccounts.ts`
- Modify: `src/features/providers/services/providerAccounts.test.ts`
- Modify: `src/features/security/services/securityAccessController.test.ts`
- Modify: `src/features/security/services/securitySession.ts`
- Modify: `src/features/security/services/securitySession.test.ts`
- Modify: `src/platform/desktop/security.ts`
- Modify: `src/platform/desktop/security.test.ts`

**Interfaces:**
- Produces: `ProviderConnectionSnapshot`, `connect-account`, `disconnect-account` and `BinanceAccountDraft.validateAndConnect`.
- Produces: new vault records without a persisted connection preference.
- Preserves: v1 records whose encrypted JSON contains legacy `enabled`.

- [ ] **Step 1: Write the failing contract tests**

```ts
expect(isSecurityRequest({
  kind: 'connect-account',
  accountId: 'account-one',
})).toBe(true)
expect(isSecurityRequest({ kind: 'disconnect-account' })).toBe(true)
expect(isSecurityRequest({
  kind: 'save-binance-account',
  draft: {
    label: 'Principal',
    markets: ['spot'],
    apiKey: 'key-1234567890',
    apiSecret: 'secret-1234567890',
    validateAndConnect: true,
  },
})).toBe(true)
```

Update provider helper tests to expect `validateAndConnect: true` instead of
`enabled: true`. Update desktop adapter fixtures with the new connection
snapshot. Add `{ connection: { state: 'disconnected' } }` to every
`SecuritySnapshot` fixture in the listed IPC, controller and renderer-session
tests so the contract change remains type-safe.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run shared/contracts/security.test.ts \
  src/features/providers/services/providerAccounts.test.ts \
  src/platform/desktop/security.test.ts
```

Expected: FAIL because the commands and transient field do not exist.

- [ ] **Step 3: Implement DTOs and validation**

```ts
export interface ProviderConnectionSnapshot {
  accountId?: string
  state: AccountConnectionState
  failureCode?: AccountFailureCode
}

export interface SecuritySnapshot {
  state: SecurityState
  hasVault: boolean
  accounts: readonly ProviderAccountSummary[]
  connection: ProviderConnectionSnapshot
  preferences: SecurityPreferences
}
```

Replace `BinanceAccountDraft.enabled` with `validateAndConnect: boolean`; add
the two request variants and exact account-id validation. Keep the derived
`ProviderAccountSummary.connection` for list rendering, but remove its
persisted `enabled` property. Clone the new requests without Vue proxies.

- [ ] **Step 4: Write the failing legacy-vault test**

Create an encrypted fixture containing `enabled: true`, unlock it and assert:

```ts
expect(unlocked.contents.accounts[0]).toMatchObject({
  accountId: 'legacy-account',
  provider: 'binance',
})
expect(unlocked.contents.accounts[0]).not.toHaveProperty('enabled')
```

- [ ] **Step 5: Verify RED and implement normalization**

Run `npx vitest run electron/main/security/vaultCrypto.test.ts`; expect failure
because decoding preserves `enabled`. Change `ProviderAccountRecord` to omit
that field and construct a fresh allowlisted record at the decrypt boundary:

```ts
return {
  accountId: stored.accountId,
  provider: stored.provider,
  label: stored.label,
  markets: [...stored.markets],
  apiKey: stored.apiKey,
  apiSecret: stored.apiSecret,
}
```

Accept an absent or boolean legacy field, but never copy it into normalized
contents. All later vault copies must also construct allowlisted records.

- [ ] **Step 6: Verify GREEN and commit**

Run the four focused test files from Steps 2 and 5. Expected: PASS.

```bash
git add -- shared/contracts/security.ts shared/contracts/security.test.ts \
  electron/main/security/vaultCrypto.ts \
  electron/main/security/vaultCrypto.test.ts \
  electron/main/security/vaultRepository.test.ts \
  electron/main/security/securitySession.test.ts \
  electron/main/security/registerSecurityIPC.test.ts \
  src/features/providers/services/providerAccounts.ts \
  src/features/providers/services/providerAccounts.test.ts \
  src/features/security/services/securityAccessController.test.ts \
  src/features/security/services/securitySession.ts \
  src/features/security/services/securitySession.test.ts \
  src/platform/desktop/security.ts src/platform/desktop/security.test.ts
git commit -m "refactor: separate provider connection intent from vault"
```

---

### Task 2: Add the main-process provider connection coordinator

**Files:**
- Create: `electron/main/security/providerConnectionCoordinator.ts`
- Create: `electron/main/security/providerConnectionCoordinator.test.ts`

**Interfaces:**
- Consumes: `ProviderAccountRecord`, `AccountProviderRegistry` and `ProviderConnectionSnapshot`.
- Produces: `connect(account)`, `disconnect()`, `snapshot()` and `subscribe()`.
- Guarantees: stale validation cannot replace a newer account or disconnected state.

- [ ] **Step 1: Write failing coordinator tests**

Test successful connection, normalized provider failure, account switching and
a late result after disconnect:

```ts
const pending = coordinator.connect(account('one'))
expect(coordinator.snapshot()).toEqual({
  accountId: 'one',
  state: 'connecting',
})
coordinator.disconnect()
releaseValidation()
await pending
expect(coordinator.snapshot()).toEqual({ state: 'disconnected' })
```

- [ ] **Step 2: Verify RED**

Run `npx vitest run electron/main/security/providerConnectionCoordinator.test.ts`.
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the coordinator**

Use one monotonically increasing revision and immutable snapshots:

```ts
async connect(account: ProviderAccountRecord): Promise<void> {
  const revision = ++this.revision
  this.set({ accountId: account.accountId, state: 'connecting' })
  const next = await this.validate(account)
  if (revision === this.revision) {
    this.set({ accountId: account.accountId, ...next })
  }
}

disconnect(): void {
  this.revision += 1
  this.set({ state: 'disconnected' })
}
```

`validate()` maps provider results to `connected` or `failed` and catches
unexpected errors as `failureCode: 'unknown'`. `snapshot()` returns a copy and
`subscribe()` returns an unsubscribe callback.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx vitest run electron/main/security/providerConnectionCoordinator.test.ts \
  electron/main/providers/accountProvider.test.ts \
  electron/main/providers/binance/binanceAccountProvider.test.ts
git add -- electron/main/security/providerConnectionCoordinator.ts \
  electron/main/security/providerConnectionCoordinator.test.ts
git commit -m "feat: coordinate one active provider account"
```

Expected: all focused tests PASS.

---

### Task 3: Integrate explicit account connection into `SecuritySession`

**Files:**
- Modify: `electron/main/security/securitySession.ts`
- Modify: `electron/main/security/securitySession.test.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/security/registerSecurityIPC.test.ts`

**Interfaces:**
- Consumes: `ProviderConnectionCoordinator` from Task 2.
- Produces: snapshots with active connection and derived per-account state.
- Produces: `connectAccount(accountId)` and `disconnectAccount()`.

- [ ] **Step 1: Write failing explicit-flow tests**

Replace automatic multi-account validation expectations with:

```ts
await session.unlock(password)
expect(validateConnection).not.toHaveBeenCalled()
expect(session.getSnapshot().connection).toEqual({
  state: 'disconnected',
})

await session.connectAccount('two')
expect(validateConnection).toHaveBeenCalledOnce()
expect(session.getSnapshot().connection).toEqual({
  accountId: 'two',
  state: 'connected',
})
```

Add cases for unknown id, lock while connecting, reset and removal of the active
account. Assert every path ends disconnected and ignores late responses.

- [ ] **Step 2: Verify RED**

Run `npx vitest run electron/main/security/securitySession.test.ts`.
Expected: FAIL because unlock still validates stored enabled accounts.

- [ ] **Step 3: Inject and subscribe to the coordinator**

Add `connections: ProviderConnectionCoordinator` to session options. Subscribe
once so coordinator transitions publish the same low-frequency snapshot. Build
each account summary as disconnected unless its id equals
`connection.accountId`. Remove `MAX_CONCURRENT_VALIDATIONS`, the connection map
and every automatic validation method.

- [ ] **Step 4: Implement explicit connection commands**

```ts
async connectAccount(accountId: string): Promise<SecuritySnapshot> {
  this.assertUnlocked()
  const account = this.requireVault().accounts.find(
    (candidate) => candidate.accountId === accountId,
  )
  if (!account) throw new Error('Conta de provider não encontrada')
  await this.connections.connect(account)
  return this.getSnapshot()
}
```

Dispatch both new requests. Persist only credential fields in
`saveBinanceAccount()` and call `connectAccount(accountId)` only when
`draft.validateAndConnect` is true. Lock, reset and active-account removal call
`disconnect()` before publishing.

- [ ] **Step 5: Wire main and IPC validation**

Build one shared registry, pass it to a new coordinator, then pass the
coordinator into `SecuritySession`. Extend IPC tests so a valid connect command
reaches the session and an invalid id is rejected before the session.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npx vitest run electron/main/security/securitySession.test.ts \
  electron/main/security/registerSecurityIPC.test.ts \
  electron/main/security/providerConnectionCoordinator.test.ts
git add -- electron/main/security/securitySession.ts \
  electron/main/security/securitySession.test.ts electron/main/index.ts \
  electron/main/security/registerSecurityIPC.test.ts
git commit -m "feat: connect provider accounts explicitly"
```

Expected: all backend security tests PASS.

---

### Task 4: Expose destructive password recovery

**Files:**
- Modify: `src/features/security/services/securityAccessController.ts`
- Modify: `src/features/security/services/securityAccessController.test.ts`
- Modify: `src/features/security/components/SecurityAccessDialog.vue`
- Modify: `src/app/styles/layout.css`

**Interfaces:**
- Produces: submit methods returning `SecuritySnapshot | undefined`.
- Produces: `authenticated` only after setup or unlock.

- [ ] **Step 1: Write failing controller tests**

```ts
controller.setMode('reset')
controller.confirmation.value = 'APAGAR'
await expect(controller.submitReset()).resolves.toEqual(snapshot)
expect(session.request).toHaveBeenCalledWith({
  kind: 'reset-vault',
  confirmation: 'APAGAR',
})
```

Prove a different confirmation does not call the session. Change setup/unlock
expectations from booleans to returned snapshots.

- [ ] **Step 2: Verify RED and implement snapshot results**

Run the controller test; expect failure because methods return booleans. Change
the internal helper to return the session snapshot on success and `undefined`
on failure, while clearing all password fields in both paths.

- [ ] **Step 3: Implement the recovery view**

In unlock mode render **Esqueci minha senha**. Reset mode hides password inputs
and renders this explicit confirmation:

```vue
<p class="security-reset-warning">
  Sua senha não pode ser recuperada. Todas as API keys, secrets, contas e
  conexões salvas serão apagadas e precisarão ser cadastradas novamente.
</p>
<label>
  <span>Digite APAGAR para confirmar</span>
  <input v-model="controller.confirmation.value" autocomplete="off">
</label>
```

Provide **Voltar** and **Apagar credenciais**. Emit the resulting snapshot as
`authenticated` only after setup/unlock. A successful reset closes the dialog;
the next Enter opens setup mode.

- [ ] **Step 4: Style, verify and commit**

Use existing red, border, raised-surface and typography tokens. Add no backdrop
or blur.

```bash
npx vitest run src/features/security/services/securityAccessController.test.ts
npm run typecheck
git add -- src/features/security/services/securityAccessController.ts \
  src/features/security/services/securityAccessController.test.ts \
  src/features/security/components/SecurityAccessDialog.vue \
  src/app/styles/layout.css
git commit -m "feat: add destructive credential recovery flow"
```

Expected: tests and typecheck PASS.

---

### Task 5: Add a generic provider catalog and refine the Binance form

**Files:**
- Create: `src/features/providers/domain/providerCatalog.ts`
- Create: `src/features/providers/domain/providerCatalog.test.ts`
- Create: `src/features/providers/components/ProviderIcon.vue`
- Create: `src/features/providers/components/ProviderCatalog.vue`
- Modify: `src/features/providers/components/ProviderAccountsPanel.vue`
- Modify: `src/features/providers/components/BinanceAccountForm.vue`
- Modify: `src/features/providers/services/providerAccounts.ts`
- Modify: `src/features/providers/services/providerAccounts.test.ts`
- Modify: `src/app/styles/settings.css`

**Interfaces:**
- Produces: `ProviderDefinition` and `providerCatalog` with Binance enabled.
- Produces: provider selection before the Binance-specific form.

- [ ] **Step 1: Write failing catalog tests**

```ts
expect(providerCatalog).toEqual([
  {
    id: 'binance',
    name: 'Binance',
    description: 'Spot e Futuros com API key e secret.',
    available: true,
  },
])
expect(getProviderDefinition('binance')?.available).toBe(true)
```

Extend helper tests to prove `validateAndConnect` does not change required
credential validation.

- [ ] **Step 2: Verify RED and implement the catalog**

Run both new/focused tests; expect missing module. Add a typed catalog with
provider id `'binance'`. `ProviderIcon.vue` receives that id and renders a local
labelled Binance SVG; it owns no network or credential behavior.

- [ ] **Step 3: Add the catalog step to settings**

Replace **Adicionar Binance** with **Adicionar provedor**. The button opens
provider cards with icon, description and availability. Binance opens its form;
editing an existing account bypasses the catalog. Cancel returns one step.
Add **Conectar** to stored accounts and show **Conectado** for the active one.

- [ ] **Step 4: Rebuild the Binance form layout**

Divide identification, markets, credentials and save behavior. Bind:

```vue
<label class="provider-connect-option">
  <input v-model="validateAndConnect" type="checkbox">
  <span>
    <strong>Validar e conectar ao salvar</strong>
    <small>Faz uma chamada autenticada de leitura após cifrar a conta.</small>
  </span>
</label>
```

Use one grid row with `align-items: start`, explicit checkbox dimensions and no
legacy `.provider-enabled` selector.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npx vitest run src/features/providers/domain/providerCatalog.test.ts \
  src/features/providers/services/providerAccounts.test.ts
npm run typecheck
git add -- src/features/providers/domain/providerCatalog.ts \
  src/features/providers/domain/providerCatalog.test.ts \
  src/features/providers/components/ProviderIcon.vue \
  src/features/providers/components/ProviderCatalog.vue \
  src/features/providers/components/ProviderAccountsPanel.vue \
  src/features/providers/components/BinanceAccountForm.vue \
  src/features/providers/services/providerAccounts.ts \
  src/features/providers/services/providerAccounts.test.ts \
  src/app/styles/settings.css
git commit -m "feat: add generic provider enrollment experience"
```

Expected: tests and typecheck PASS.

---

### Task 6: Orchestrate zero, one and multiple account login flows

**Files:**
- Create: `src/features/providers/services/privateAccessFlow.ts`
- Create: `src/features/providers/services/privateAccessFlow.test.ts`
- Create: `src/features/providers/components/ProviderConnectionDialog.vue`
- Create: `src/app/services/notifications.ts`
- Create: `src/app/services/notifications.test.ts`
- Create: `src/app/components/AppToastHost.vue`
- Modify: `src/features/settings/components/GeneralSettingsPanel.vue`
- Modify: `src/features/workspace/components/TradingWorkspace.vue`
- Modify: `src/app/styles/layout.css`
- Modify: `src/app/styles/settings.css`

**Interfaces:**
- Consumes: authenticated `SecuritySnapshot` emitted by the access dialog.
- Produces: `open-providers`, `connect-account` or `choose-account`.
- Produces: low-frequency notifications with retry/settings actions.

- [ ] **Step 1: Write failing decision and notification tests**

```ts
expect(nextPrivateAccessAction(snapshotWith([]))).toEqual({
  kind: 'open-providers',
})
expect(nextPrivateAccessAction(snapshotWith([accountOne]))).toEqual({
  kind: 'connect-account',
  accountId: 'one',
})
expect(nextPrivateAccessAction(snapshotWith([accountOne, accountTwo])))
  .toEqual({ kind: 'choose-account' })
```

Notification tests cover immutable enqueue/remove, expiry, retry and settings
callbacks being invoked once.

- [ ] **Step 2: Verify RED and implement pure services**

Run both tests and expect missing modules. Implement a discriminated
`PrivateAccessAction` union. Implement notifications with
`shallowRef<readonly AppNotification[]>([])`, immutable array replacement,
stable ids and one timeout per item. Do not watch market state.

- [ ] **Step 3: Implement connection dialog and toast host**

The dialog receives only masked accounts and connection state. It shows icons
and metadata for selection, then a compact spinner while connecting. It emits
`select`, `close` and `open-settings`. `AppToastHost` teleports to body, renders
status and at most retry/settings actions, and expires each notification.

- [ ] **Step 4: Expose settings navigation**

Expose the existing section selector:

```ts
defineExpose({ selectSection })
```

The workspace keeps a typed panel ref and calls `selectSection('providers')`
before opening settings.

- [ ] **Step 5: Orchestrate post-authentication**

Use the pure action after setup/unlock. Zero accounts opens provider settings;
one opens loading and connects; many opens the chooser. Success enqueues:

```ts
notify({
  tone: 'success',
  message: `Conectado à Binance — ${account.label}`,
})
```

Failure enqueues normalized copy with **Tentar novamente** and
**Abrir configurações**. Reuse the shared security `shallowRef`; add no second
IPC subscription.

- [ ] **Step 6: Verify GREEN and commit**

```bash
npx vitest run src/features/providers/services/privateAccessFlow.test.ts \
  src/app/services/notifications.test.ts \
  src/features/security/services/securitySession.test.ts
npm run typecheck
git add -- src/features/providers/services/privateAccessFlow.ts \
  src/features/providers/services/privateAccessFlow.test.ts \
  src/features/providers/components/ProviderConnectionDialog.vue \
  src/app/services/notifications.ts src/app/services/notifications.test.ts \
  src/app/components/AppToastHost.vue \
  src/features/settings/components/GeneralSettingsPanel.vue \
  src/features/workspace/components/TradingWorkspace.vue \
  src/app/styles/layout.css src/app/styles/settings.css
git commit -m "feat: guide provider connection after unlock"
```

Expected: tests and typecheck PASS.

---

### Task 7: Guard the trading ticket and return its grid track

**Files:**
- Create: `src/features/trading/domain/privateTradingAccess.ts`
- Create: `src/features/trading/domain/privateTradingAccess.test.ts`
- Modify: `src/features/workspace/components/TradingWorkspace.vue`
- Modify: `src/app/styles/layout.css`

**Interfaces:**
- Consumes: `SecuritySnapshot.connection`.
- Produces: `canShowTradingTicket(snapshot): boolean`.

- [ ] **Step 1: Write the failing access test**

```ts
expect(canShowTradingTicket(snapshot({ state: 'disconnected' }))).toBe(false)
expect(canShowTradingTicket(snapshot({
  accountId: 'one',
  state: 'connecting',
}))).toBe(false)
expect(canShowTradingTicket(snapshot({
  accountId: 'one',
  state: 'connected',
}))).toBe(true)
```

- [ ] **Step 2: Verify RED and implement the guard**

Run the test and expect a missing module. Implement:

```ts
export function canShowTradingTicket(snapshot: SecuritySnapshot): boolean {
  return snapshot.state === 'unlocked'
    && snapshot.connection.accountId !== undefined
    && snapshot.connection.state === 'connected'
}
```

- [ ] **Step 3: Bind component and layout**

```vue
<main :data-trading="tradingTicketVisible ? 'visible' : 'hidden'">
  <TradingTicket v-if="tradingTicketVisible" :selection="selection" />
</main>
```

Replace the final `288px` grid track with `var(--trading-track, 288px)` and add:

```css
.workspace-grid[data-trading="hidden"] {
  --trading-track: 0px;
}
```

Do not change chart/order-book component keys, sessions or render paths.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npx vitest run src/features/trading/domain/privateTradingAccess.test.ts
npm run typecheck
git add -- src/features/trading/domain/privateTradingAccess.ts \
  src/features/trading/domain/privateTradingAccess.test.ts \
  src/features/workspace/components/TradingWorkspace.vue \
  src/app/styles/layout.css
git commit -m "feat: show trading ticket only for connected accounts"
```

Expected: test and typecheck PASS.

---

### Task 8: Final documentation, regression and PR update

**Verification record (2026-08-07):** `npm run typecheck`, `npm test`,
`npm run build` and `git diff --check` completed successfully. `npm run lint`
reported 14 preexisting `@stylistic/indent` errors in
`electron/main/security/vaultCrypto.test.ts` (lines 92–105), plus warnings;
this task does not alter that unrelated file merely to make the global command
green. `npm run dev` built the main and preload processes and started the
renderer server, but no graphical interaction or DevTools Performance capture
was available. The manual UI path and the 50 ms renderer-long-task observation
therefore remain pending. Balances, orders, positions, history and private
streams remain explicitly excluded.

**Files:**
- Modify: `docs/specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md`
- Modify: `docs/superpowers/plans/2026-08-07-provider-connection-flow.md`

**Interfaces:**
- Confirms: implemented acceptance criteria and exact exclusions.
- Preserves: the approved design as the architectural record.

- [ ] **Step 1: Run complete automated verification**

```bash
npm run typecheck
npm run lint
npm test
npm run build
git diff --check
```

Expected: typecheck, tests, build and diff check exit 0; lint has no errors.
Existing unrelated warnings may remain documented, but new files add none.

- [ ] **Step 2: Run the manual critical path**

Run `npm run dev` and verify:

1. Locked startup keeps candles/book active and hides the ticket.
2. Recovery requires `APAGAR`; cancel preserves the vault.
3. Setup with zero accounts opens provider settings.
4. **Adicionar provedor** shows Binance with icon and aligned form.
5. Save-and-connect shows progress and a connected toast.
6. Lock hides the ticket and forgets the active account.
7. One account reconnects automatically after unlock.
8. Two accounts require selection and only the chosen one validates.
9. Failure offers retry/settings without pausing public data.

- [ ] **Step 3: Update acceptance criteria honestly**

Mark only observed/automated F-018 criteria complete. Keep balances, orders,
positions and private streams excluded. Do not claim the 50 ms manual metric
unless DevTools Performance was actually measured.

- [ ] **Step 4: Check docs and commit**

```bash
git diff --check
rg -n "T[B]D|T[O]DO|implementar\\x20depois" \
  docs/specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md \
  docs/superpowers/plans/2026-08-07-provider-connection-flow.md
git add -- docs/specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md \
  docs/superpowers/plans/2026-08-07-provider-connection-flow.md
git commit -m "docs: finalize provider connection experience"
```

Expected: no whitespace errors or placeholders.

- [ ] **Step 5: Review before publishing**

Inspect `git status --short`, `git log main..HEAD` and the full diff summary.
Use the requesting-code-review workflow. Push verified commits to the existing
`feature/secure-provider-credentials` branch only after authorization and
update PR #4 instead of creating another pull request.
