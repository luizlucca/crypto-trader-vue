# Arquitetura

## Fluxo de dados

```text
Binance REST ── histórico ───────────────┐
                                        ├─ MarketChart ── Lightweight Charts
Binance WS market/kline ─ goroutine ─ evento ──┘          series.update()

Binance WS public/depth20@100ms
       └─ goroutine independente ─ evento ─ último snapshot
                                      └─ OrderBook ─ requestAnimationFrame
```

Candles e livro de ordens não compartilham filas, estado reativo ou ciclos de
renderização. O serviço Go mantém uma goroutine por stream. No frontend, cada
componente assina somente o evento que consome.

## Backend

- `internal/marketdata`: tipos de domínio, contrato `Provider` e gestão da
  sessão ativa.
- `internal/providers/binance`: endpoints, REST, WebSocket e tradução dos
  payloads Binance para tipos neutros.
- `app.go`: adaptador Wails; expõe histórico e controle da sessão e encaminha
  dados por eventos.

`MarketSpot` e `MarketFutures` selecionam endpoints REST e WebSocket distintos.
Em Futures, os sockets também são separados por categoria conforme a migração
atual da Binance: candles usam `/market/ws` e o livro usa `/public/ws`.
Um novo provedor deve implementar `marketdata.Provider` e ser registrado no
`marketdata.Service`.

O livro usa o stream parcial `depth20@100ms`. Como a interface mostra apenas os
melhores níveis, isso evita manter e reconstruir milhares de posições do livro
completo. Quando funcionalidades de microestrutura exigirem profundidade total,
o provider poderá ganhar uma implementação local baseada em snapshot REST +
diff stream sem alterar o contrato consumido pelo frontend.

## Frontend

- `components/chart`: ciclo de vida e acesso imperativo ao Lightweight Charts.
- `components/orderbook`: linhas fixas e atualização imperativa em lote.
- `components/workspace`: orquestra a seleção e o ciclo da sessão.
- `services/marketData.ts`: única fronteira com bindings/eventos Wails.
- `types/market.ts`: contratos do frontend.

O gráfico é criado uma vez no `onMounted` e removido no `onBeforeUnmount`.
`setData()` é reservado ao histórico; candles em tempo real usam
`series.update()`. Timestamps recebidos em milissegundos da Binance são
normalizados no Go para segundos antes de chegar ao Lightweight Charts.

O livro não mantém arrays profundos reativos. Apenas o snapshot mais recente é
guardado e, no máximo uma vez por frame, os textos das linhas já existentes são
atualizados. Assim, bursts de profundidade não provocam diff do DOM pelo Vue e
não interferem no canvas do gráfico.

O backend também mantém um canal de capacidade 1 entre o WebSocket do livro e
o bridge Wails. Se o consumidor atrasar, o snapshot pendente é substituído pelo
mais novo. Dados antigos nunca criam uma fila crescente.

## Teste de integração

Os testes comuns não acessam a rede. A validação real e opt-in de REST, candles
e livro para Spot e Futures pode ser executada com:

```sh
BINANCE_LIVE_TEST=1 go test ./internal/providers/binance \
  -run TestLiveMarketData -v -count=1
```

## Próximos módulos

1. catálogo de símbolos Spot/Futures e troca de ativo;
2. reconexão observável, métricas de latência e sequência do stream;
3. múltiplas abas/sessões;
4. ordens, posições e credenciais criptografadas;
5. primitivas do Lightweight Charts para entrada, TP, SL e break-even.
