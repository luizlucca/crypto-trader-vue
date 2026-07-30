# ADR-0003 — Renderização imperativa do gráfico

**Status:** aceito  
**Data:** 2026-07-30  
**Relaciona-se a:** [F-003](../specs/F-003-streams-realtime.md),
[F-004](../specs/F-004-grafico-lightweight.md) e
[F-005](../specs/F-005-historico-do-grafico.md)

## Contexto

Atualizar candles e livro por reatividade Vue criaria reconciliação de árvore e
alocações em fluxos que podem chegar muitas vezes por segundo.

## Decisão

Manter o Lightweight Charts fora do grafo reativo quente. Histórico usa
`setData()`; realtime usa `series.update()`; texto do livro é atualizado
diretamente em referências DOM já montadas.

## Consequências

- O componente Vue controla ciclo de vida e estado de baixo volume, não cada tick.
- Histórico antigo é inserido com preservação de intervalo lógico.
- Código exige limpeza explícita de listeners, séries e frames pendentes.
- Testes de performance devem medir caminhos imperativos, não só renders Vue.

## Alternativas consideradas

- Estado reativo por candle/snapshot: rejeitado pelo risco de competição com
  canvas e lista de busca.
- Canvas customizado completo: rejeitado; Lightweight Charts já fornece escalas,
  crosshair, panes e plugins necessários.
