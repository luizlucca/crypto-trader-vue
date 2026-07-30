# F-011 — Agregação de preços do livro de ordens

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero agrupar os níveis do livro por intervalos de preço para
enxergar a liquidez em diferentes granularidades sem interromper os dados
realtime.

## Comportamento esperado

- O cabeçalho do livro permite escolher passos como `0.1`, `1`, `10` e `100`.
- As opções começam no `tickSize` nativo informado pelo provider.
- Bids são agrupados para baixo e asks para cima, sem cruzar artificialmente o
  spread.
- Quantidade, total acumulado e proporção de compra/venda refletem os níveis
  agregados visíveis.
- Cada aba preserva sua própria granularidade.
- Trocar granularidade não reconecta streams nem recarrega candles ou livro.

## Implementação e decisões de arquitetura

- `priceTickSize` faz parte dos contratos `MarketSymbol` e `MarketSelection`;
  a Binance o preenche a partir de `PRICE_FILTER.tickSize`.
- `orderBookAggregation.ts` contém o cálculo puro. Os preços são convertidos em
  unidades inteiras antes do bucket para evitar deriva de ponto flutuante.
- `OrderBook.vue` agrega somente o snapshot mais recente dentro do frame já
  reservado pelo livro. A interação com o seletor agenda um novo frame usando o
  snapshot em memória.
- A seleção fica em `WorkspaceTab.orderBookAggregation`, isolada por aba e fora
  do ciclo de vida da conexão.

Fontes de verdade: `src/components/orderbook/orderBookAggregation.ts`,
`src/components/orderbook/OrderBook.vue`,
`src/types/workspace.ts` e
`electron/utility/market-data/providers/binance/normalizers.ts`.

## Testes

- Geração de opções a partir de ticks decimais.
- Arredondamento assimétrico de bids e asks.
- Soma de quantidades e recálculo de totais acumulados.
- Proteção contra erros de ponto flutuante em preços decimais.
- Contratos e build completo do Electron.

## Critérios de aceite

- [x] A granularidade pode ser alterada no cabeçalho do livro.
- [x] O passo mínimo respeita o `tickSize` da Binance.
- [x] A troca não reinicia o WebSocket.
- [x] O período do gráfico não altera a granularidade.
- [x] Abas mantêm configurações independentes.
- [x] A barra compra/venda acompanha os níveis agregados.
- [x] Testes, typecheck e build passam.

## Evolução

- Permitir escolher profundidades maiores quando o provider suportar.
- Persistir preferências de granularidade entre reinícios da aplicação.
