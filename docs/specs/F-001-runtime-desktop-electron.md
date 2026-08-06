# F-001 — Runtime desktop Electron e segurança

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero abrir a plataforma em uma aplicação desktop de tela cheia,
sem depender de um navegador, e manter pesquisa e dados de mercado isolados do
workspace principal.

## Comportamento esperado

- A janela principal abre em tela cheia a cada inicialização.
- A pesquisa de símbolos abre em uma janela nativa separada, não modal.
- O renderer Vue não recebe APIs Node.js nem pode navegar/criar janelas arbitrariamente.
- Mensagens entre renderer e processos internos aceitam apenas origens e payloads conhecidos.

## Implementação e decisões de arquitetura

- O processo principal cria a janela em `fullscreen: true` e reafirma
  `setFullScreen(true)` em `ready-to-show`.
- `BrowserWindow` usa `contextIsolation`, `sandbox` e `nodeIntegration: false`.
  O preload expõe apenas a API tipada de `shared/contracts/desktop.ts`.
- O processo principal valida o remetente IPC, bloqueia navegação/redireção e nega `window.open`.
- `MarketDataCoordinator` cria processos utilitários para trabalho de mercado;
  eles reiniciam após falha e restauram assinaturas ativas.

Fontes de verdade: `electron/main/index.ts`,
`electron/main/market-data/coordinator.ts`,
`electron/preload/index.ts` e `shared/contracts/desktop.ts`.

## Testes

- `shared/contracts/desktop.test.ts` valida comandos IPC.
- `npm run typecheck` valida o contrato compartilhado.
- Tela cheia e janela de busca exigem validação manual no sistema operacional.

## Critérios de aceite

- [ ] `npm run dev` abre a janela principal em tela cheia.
- [ ] `Enter` abre a busca em janela independente.
- [ ] O renderer não expõe `require`, `process` ou APIs Node.
- [ ] IPC de origem desconhecida ou payload inválido é rejeitado.

## Evolução

- Persistir preferência de tela cheia somente se existir modo janela explícito.
- Adicionar telemetria de reinício dos processos auxiliares.
