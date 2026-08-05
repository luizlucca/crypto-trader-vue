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
- A proporção de compra/venda acompanha a liquidez dos níveis visíveis.
- Nenhuma falha de comunicação deixa a aba parada: encerrar um stream sempre
  conclui, mesmo quando o processo utilitário não responde.
- Um processo utilitário que para de responder é reiniciado e suas assinaturas
  restauradas, incluindo a agregação escolhida para o livro.
- Um socket que continua aberto sem entregar dados é derrubado e reconectado.
- Recarregar ou fechar a janela principal libera os WebSockets daquelas sessões.

## Implementação e decisões de arquitetura

- `MarketSessionPool` mantém sessões por `sessionId` em processo utilitário;
  candle e livro são observáveis RxJS independentes.
- O livro Binance mantém um livro local completo a partir do snapshot REST mais
  o stream de diferenças, e emite só as linhas agregadas que a interface mostra
  ([F-013](./F-013-profundidade-livro-ordens.md)). O `@depth20` anterior não
  conseguia encher as linhas nas agregações largas. `auditTime(16)` limita a
  entrega IPC ao máximo de uma por frame.
- `OrderBook.vue` retém só o snapshot mais recente e escreve no DOM por
  `requestAnimationFrame`. Referências de linhas são criadas uma vez.
- `MarketChart.vue` usa `series.update()` para candle realtime; não há render
  Vue por tick de candle ou livro.
- `realtimePrice.ts` atualiza textos de preço em canal imperativo.
- O ponto da aba representa o estado do livro; candles e estado agregado
  permanecem disponíveis separadamente.
- A proporção soma quantidades dos 10 níveis visíveis e atualiza textos/barra no
  mesmo frame imperativo das linhas.
- `MarketDataCoordinator` registra a intenção do renderer **antes** do round
  trip. O mapa de assinaturas descreve o estado desejado, e não o confirmado:
  um `stop-stream` que estoura o tempo não pode ser revivido pelo próximo
  reinício, e um `start-stream` que estoura ainda precisa ser restaurado.
- Um timeout só reinicia o processo quando **nada** voltou dele enquanto o
  pedido estava aberto. Endpoint lento e processo travado produzem o mesmo
  timeout, e apenas o segundo justifica derrubar as demais sessões.
- Reinícios usam backoff exponencial até 15 s, zerado no `ready`.
- `stopMarketStream` sempre resolve. Ele é aguardado antes de iniciar o stream
  substituto: uma rejeição abandonava a troca com a aba já em `connecting` e
  nada mais a tirava desse estado.
- Cada socket tem vigia de ociosidade de 6 minutos. A Binance envia ping a cada
  3 minutos, então silêncio além de duas janelas significa conexão morta sem
  `close` nem `error` — caso em que o TCP nunca avisa e o livro congela.

Fontes de verdade: `electron/utility/market-data/session.ts`,
`electron/main/marketDataCoordinator.ts`,
`electron/utility/market-data/providers/binance/websocket.ts`,
`src/components/orderbook/OrderBook.vue`,
`src/components/chart/MarketChart.vue` e
`src/services/realtimePrice.ts`.

## Testes

- `session.test.ts` verifica candle imediato, coalescência do livro e sessões.
- `marketData.test.ts` verifica roteamento único de eventos por sessão.
- `marketDataCoordinator.test.ts` cobre restauração após queda, reinício de
  processo mudo e tolerância a um pedido lento com tráfego ativo.
- `websocket.test.ts` cobre o vigia de ociosidade e o ping do servidor.
- Estabilidade em bursts deve ser validada manualmente no DevTools Performance.

## Critérios de aceite

- [ ] Burst do livro não provoca render Vue por nível nem fila crescente.
- [ ] Candle atualiza sem `setData()`.
- [ ] Aba inativa deixa de entregar bursts de livro ao renderer.
- [ ] Latência é limitada, não atualizada por snapshot.
- [ ] Falha do processo sinaliza a aba e restaura assinaturas após reinício.
- [ ] Timeout de IPC não deixa a aba presa em "Conectando aos streams".
- [ ] Aba fechada durante uma falha não reaparece no reinício do processo.
- [ ] Recarregar a janela não acumula WebSockets órfãos no processo utilitário.
- [ ] A barra de compra/venda acompanha os snapshots sem render Vue adicional.

## Evolução

- Instrumentar filas, sequência de updates e taxa de descarte.
- Expor opções de profundidade e modos visuais do livro.
