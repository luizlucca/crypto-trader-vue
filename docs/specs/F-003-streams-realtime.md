# F-003 — Streams realtime de candles e livro de ordens

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero observar candles e melhores níveis do livro continuamente,
sem que bursts do livro atrasem o canvas, troca de aba ou interface.

## Comportamento esperado

- Cada aba possui streams de candle e livro próprios.
- O candle visível atualiza incrementalmente; o livro não acumula fila de renders.
- Livros de abas ocultas não atravessam o IPC até voltarem ao primeiro plano.
- Status de conexão e latência são expostos por aba.

## Implementação e decisões de arquitetura

- `MarketSessionPool` mantém sessões por `sessionId` em processo utilitário;
  candle e livro são observáveis RxJS independentes.
- O livro Binance usa `depth20@100ms`. `auditTime(16)` limita a entrega IPC
  ao máximo de uma por frame.
- `OrderBook.vue` retém só o snapshot mais recente e escreve no DOM por
  `requestAnimationFrame`. Referências de linhas são criadas uma vez.
- `MarketChart.vue` usa `series.update()` para candle realtime; não há render
  Vue por tick de candle ou livro.
- `realtimePrice.ts` atualiza textos de preço em canal imperativo.

Fontes de verdade: `frontend/electron/utility/market-data/session.ts`,
`frontend/src/components/orderbook/OrderBook.vue`,
`frontend/src/components/chart/MarketChart.vue` e
`frontend/src/services/realtimePrice.ts`.

## Testes

- `session.test.ts` verifica candle imediato, coalescência do livro e sessões.
- `marketData.test.ts` verifica roteamento único de eventos por sessão.
- Estabilidade em bursts deve ser validada manualmente no DevTools Performance.

## Critérios de aceite

- [ ] Burst do livro não provoca render Vue por nível nem fila crescente.
- [ ] Candle atualiza sem `setData()`.
- [ ] Aba inativa deixa de entregar bursts de livro ao renderer.
- [ ] Latência é limitada, não atualizada por snapshot.
- [ ] Falha do processo sinaliza a aba e restaura assinaturas após reinício.

## Evolução

- Instrumentar filas, sequência de updates e taxa de descarte.
- Expor opções de profundidade e modos visuais do livro.
