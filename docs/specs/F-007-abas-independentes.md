# F-007 — Abas independentes de mercado

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero acompanhar vários ativos e períodos, mudando de aba sem
perder contexto, sem compartilhar livro de ordens e com consumo previsível.

## Comportamento esperado

- Cada aba possui ativo, mercado, período, sessão, status e latência próprios.
- `Ctrl+T` e `+` pedem primeiro o ativo antes de criar a aba.
- `Ctrl+clique` em símbolo cria nova aba diretamente.
- Alterar período muda somente stream de candle daquela aba.
- Fechamento por ícone ou clique do meio preserva sempre uma aba.
- Máximo atual: oito abas simultâneas.
- O ponto de cada aba informa o estado do livro, sem ser contaminado por uma
  falha exclusiva do stream de candles.

## Implementação e decisões de arquitetura

- `WorkspaceTab` contém seleção, `sessionId`, geração de cancelamento e
  `renderRevision`. A geração invalida respostas antigas após troca de ativo.
- `TradingWorkspace.vue` inicia/paralisa sessões e alterna visibilidade no
  processo realtime. Livros ocultos retêm só último snapshot no processo auxiliar.
- Chart e livro ativos são montados por `key`; inativos mantêm cache limitado
  de 500 candles para retorno rápido.
- A busca carrega `tabId` e intenção (`replace-tab` ou `new-tab`), aplicando
  seleção à origem correta mesmo após troca de foco.

Fontes de verdade: `src/features/workspace/components/TradingWorkspace.vue`,
`src/features/workspace/components/WorkspaceTabs.vue` e
`src/features/workspace/domain/workspace.ts`.

## Testes

- `workspace.test.ts` cobre criação de tabs, rótulos, fingerprints e seleção.
- `marketData.test.ts` cobre roteamento de candle por sessão.
- Fluxo de foco, múltiplas abas e Ctrl+clique requer validação manual.

## Critérios de aceite

- [ ] `Ctrl+T` e `+` abrem busca; sessão só nasce após escolha.
- [ ] Nova aba pode ter período diferente da origem.
- [ ] `Ctrl+clique` preserva período de origem.
- [ ] Trocar período não reinicia livro da mesma aba.
- [ ] Aba inativa não entrega bursts de livro ao renderer.
- [ ] Fechar aba encerra streams e remove cache.
- [ ] Livro conectado mantém ponto verde mesmo com erro exclusivo de candles.

## Evolução

- Persistir/restaurar abas entre execuções.
- Permitir grupos de abas e políticas configuráveis de conexões.
