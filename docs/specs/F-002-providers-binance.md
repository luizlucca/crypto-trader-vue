# F-002 — Providers de dados e Binance Spot/Futures

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero consumir pares, candles e livro da Binance escolhendo Spot
ou Futures, sem que a interface dependa de URLs ou formatos da corretora.

## Comportamento esperado

- Spot e Futures usam endpoints REST e WebSocket próprios.
- O catálogo combina pares negociáveis e estatísticas de 24 horas.
- O catálogo permanece em cache por uma hora e pode ser atualizado explicitamente.
- Um novo provider pode ser adicionado sem alterar componentes Vue.

## Implementação e decisões de arquitetura

- `MarketDataProvider` define catálogo, candles e streams; `ProviderRegistry`
  escolhe a implementação pelo nome.
- `endpoints.ts` concentra a separação Binance Spot e Futures, inclusive sockets.
- O catálogo consulta `exchangeInfo` e `ticker/24hr` em paralelo, usa TTL,
  singleflight e fallback marcado como `stale`.
- `CandleHistoryOptions.before`, em segundos, vira `endTime` exclusivo em
  milissegundos (`before * 1000 - 1`), eliminando duplicação entre páginas.
- Normalizadores convertem payloads da Binance para tipos de domínio antes do IPC.

Fontes de verdade: `electron/utility/market-data/provider.ts` e
`electron/utility/market-data/providers/binance/`.

## Testes

- `endpoints.test.ts`, `normalizers.test.ts` e `provider.test.ts` cobrem
  endpoints, normalização, cache, refresh e cursor histórico.
- `provider.live.test.ts` é opt-in com `BINANCE_LIVE_TEST=1`.

## Critérios de aceite

- [ ] Trocar Spot/Futures muda catálogo, REST e WebSocket para o mercado certo.
- [ ] Leituras no TTL não repetem a consulta remota.
- [ ] Atualização forçada ignora o TTL.
- [ ] Páginas históricas não repetem a barra de fronteira.
- [ ] Outro provider requer interface e registro, sem alteração no Vue.

## Evolução

- Adicionar Bybit, OKX e Gate.io.
- Implementar livro completo por snapshot REST + diff stream quando necessário.
