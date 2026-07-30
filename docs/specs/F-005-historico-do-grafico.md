# F-005 — Navegação e carregamento progressivo de histórico

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero iniciar perto do preço atual e navegar para o passado sem
lacunas, saltos de viewport ou disputar interação com uma carga histórica.

## Comportamento esperado

- A abertura mostra as últimas 20 barras e quatro posições livres à direita.
- Ao chegar perto do limite esquerdo, a aplicação solicita ao menos 400 barras.
- Durante a carga, o painel do gráfico não pode ser manipulado.
- Candles realtime e livro permanecem conectados.
- Inserir barras antigas preserva as mesmas barras visíveis.

## Implementação e decisões de arquitetura

- O histórico inicial pede 500 candles. `setVisibleLogicalRange` define a
  janela de 20 barras com espaço futuro em vez de `fitContent()`.
- `subscribeVisibleLogicalRangeChange` consulta `barsInLogicalRange()` e,
  com até oito barras anteriores, inicia prefetch de 400 candles.
- A consulta roda no processo utilitário. `before` é convertido em `endTime`
  exclusivo para evitar sobreposição.
- Prepend usa `setData()`, operação suportada pelo Lightweight Charts. O
  intervalo lógico é salvo/restaurado deslocado pelo número de barras inseridas.
  Realtime continua em `update()`.
- Uma camada opaca bloqueia ponteiro, wheel, zoom, scroll e toolbar do gráfico.
  Não há blur ou backdrop custoso; em falha existe tentativa manual.

Fontes de verdade: `src/components/chart/MarketChart.vue`,
`src/services/marketData.ts`, `src/contracts/desktop.ts` e
`electron/utility/market-data/providers/binance/provider.ts`.

## Testes

- `desktop.test.ts` valida cursor histórico seguro no IPC.
- `marketData.test.ts` valida encaminhamento do cursor.
- `provider.test.ts` valida `endTime` e endpoints Spot/Futures.
- Preservação visual e bloqueio de interação requerem validação manual.

## Critérios de aceite

- [ ] Abertura mostra últimas 20 barras e última não encosta na borda.
- [ ] Chegar ao início solicita uma página de 400 candles.
- [ ] Durante a carga, mouse, touch, zoom e período não alteram o gráfico.
- [ ] Livro continua recebendo updates durante o bloqueio.
- [ ] Após prepend, a barra sob o cursor permanece na mesma posição visual.
- [ ] No início real do ativo, novas requisições param.

## Evolução

- Instrumentar duração de página e tamanho acumulado de histórico.
- Definir política de retenção para dezenas de milhares de barras.
