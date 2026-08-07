# F-004 — Gráfico Lightweight Charts e plugins visuais

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero um gráfico rápido e legível, com candles, volume,
símbolo/período no fundo e movimentação horizontal e vertical.

## Comportamento esperado

- O gráfico exibe OHLC, volume e legenda de candle em tempo real.
- Candles possuem cantos arredondados e nitidez em telas HiDPI.
- Símbolo e intervalo aparecem como watermark no canvas.
- É possível navegar em X e deslocar preço em Y; duplo clique restaura auto scale.
- Trocar período recarrega somente candle, não o livro de ordens.

## Implementação e decisões de arquitetura

- A instância é criada em `onMounted` e removida em `onBeforeUnmount`.
  A API imperativa do Lightweight Charts é usada fora do caminho reativo quente.
- `RoundedCandleSeries` adapta o exemplo oficial Rounded Candles por
  `ICustomSeriesPaneView`; percorre somente barras visíveis em coordenadas bitmap.
- Volume usa `HistogramSeries` em pane próprio. A watermark usa
  `createTextWatermark`, sem overlay HTML concorrendo com o canvas.
- Um `pointerdown` desativa auto scale antes do handler nativo, permitindo pan
  conjunto de tempo e preço.
- `TradingWorkspace.vue` chama `updateMarketCandleStream` ao trocar período.

Fontes de verdade: `src/features/chart/components/MarketChart.vue` e
`src/features/chart/plugins/rounded-candles/`.

## Testes

- `RoundedCandleSeries.test.ts` cobre a série customizada.
- `npm run typecheck` valida a API v5 usada pelo wrapper.
- Pan, auto scale e watermark exigem validação manual no Electron.

## Critérios de aceite

- [ ] Candle atual recebe atualização incremental sem recriar o chart.
- [ ] Volume ocupa pane separado e segue a direção do candle.
- [ ] Watermark acompanha ativo, período e tema.
- [ ] Arrastar o painel move X e Y após sair do auto scale.
- [ ] Trocar `1h` por `5m` não recarrega o livro.

## Evolução

- Implementar desenho, indicadores, alertas e replay, hoje controles visuais.
- Adicionar primitivas para entrada, TP, SL e break-even.
