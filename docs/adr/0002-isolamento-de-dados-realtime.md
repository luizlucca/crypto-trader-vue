# ADR-0002 — Dados de mercado em processos utilitários

**Status:** aceito  
**Data:** 2026-07-30  
**Relaciona-se a:** [F-002](../specs/F-002-providers-binance.md),
[F-003](../specs/F-003-streams-realtime.md) e
[F-006](../specs/F-006-catalogo-busca-favoritos.md)

## Contexto

Busca/ordenação de catálogo, parsing REST, WebSockets, livro de ordens e canvas
disputavam a mesma thread quando concentrados no renderer. O livro é o fluxo
mais intenso e não pode interromper gráfico ou busca.

## Decisão

Separar catálogo e realtime em processos utilitários Electron. O renderer
recebe uma API mínima pelo preload e apenas eventos necessários à aba visível.

## Consequências

- Busca e catálogo não consomem a thread do renderer principal.
- O livro é coalescido antes do IPC e abas ocultas retêm somente último snapshot.
- Falhas podem ser reiniciadas e assinaturas restauradas pelo coordenador.
- Há maior complexidade de IPC, structured clone, timeouts e observabilidade.

## Alternativas consideradas

- WebSockets no renderer: rejeitado, pois mistura ingestão e pintura.
- Um único processo para catálogo e realtime: rejeitado, pois um refresh grande
  pode competir com callbacks de socket.
