# ADR-0004 — Camadas e fronteiras de módulo

**Status:** aceito  
**Data:** 2026-07-31  
**Relaciona-se a:** [F-012](../specs/F-012-arquitetura-modular.md) e
[ADR-0002](./0002-isolamento-de-dados-realtime.md)

## Contexto

`src/` nasceu como a pasta do renderer, mas os contratos de IPC e os tipos de
domínio ficaram dentro dela. O processo principal e o `utilityProcess` passaram
a importar `../../../src/contracts` e `../../../src/types`, e o
`tsconfig.node.json` precisou incluir caminhos de `src/` para compilar.

O isolamento de processos descrito no ADR-0002 existia em tempo de execução,
mas não em tempo de compilação: nada impedia um módulo do renderer de ser
importado por um processo desktop. Com a expansão para ordens, posições e
credenciais, esse acoplamento levaria código de UI para dentro do processo que
mantém os WebSockets.

## Decisão

Três camadas, com dependência em sentido único:

```text
shared/   contratos e tipos neutros — sem Vue, sem Electron
   ▲                    ▲
   │                    │
src/                electron/
renderer            main + preload + utility
```

- `shared/` é a única fronteira que os dois lados podem cruzar. Não depende de
  Vue nem de Electron.
- `electron/` importa apenas `@shared/`. **Nunca** `@/`.
- `src/` importa `@shared/` e `@/`, e não conhece o Electron além do
  `contextBridge` tipado.
- Dentro de `src/`, `domain/` guarda regra pura e testável sem Vue; `types/`
  fica restrito a declarações de ambiente do renderer.

Os aliases `@shared/*` e `@/*` substituem caminhos relativos profundos, e a
regra `no-restricted-imports` do ESLint transforma a fronteira em erro de lint,
não em convenção informal.

## Consequências

- A violação de camada falha no `npm run lint`, antes da revisão humana.
- `tsconfig.node.json` deixa de listar caminhos de `src/`: o próprio conjunto de
  arquivos compilados descreve a fronteira.
- Os aliases vivem em três lugares (`electron.vite.config.ts`,
  `tsconfig*.json`, `vitest.config.ts`) e precisam ser mantidos em sincronia.
  O `vitest.config.ts` passou a existir por causa disso.
- Um provedor ou janela nova herda a fronteira sem trabalho adicional.
- Mover um módulo entre camadas passa a ser uma decisão explícita, não o efeito
  colateral de um `../..` a mais.

## Alternativas consideradas

- **Manter contratos em `src/` e ampliar o `include` do tsconfig do Electron:**
  rejeitado. É o estado atual; não impede o acoplamento, apenas o tolera.
- **Workspaces npm com pacotes separados:** rejeitado por ora. Resolve a
  fronteira, mas adiciona build, versionamento e resolução de dependências a um
  projeto de um único aplicativo.
- **Convenção documentada sem regra de lint:** rejeitado. A regra custa pouco e
  a convenção anterior já havia sido violada em dez arquivos.
