# Arquitetura

## Fluxo de dados

```text
Binance REST ── histórico ───────────────┐
                                        ├─ MarketChart ── Lightweight Charts
Binance WS market/kline ─ goroutine ─ evento ──┘          series.update()

Binance WS public/depth20@100ms
       └─ goroutine independente ─ evento ─ último snapshot
                                      └─ OrderBook ─ requestAnimationFrame

Binance REST exchangeInfo + ticker/24hr (em paralelo)
       └─ catálogo normalizado ─ cache 1h ─ Web Worker persistente
                                      └─ índices ─ janela virtual do modal

Candles/livro ─ canal imperativo de preço ─ RealtimePriceText
                                      └─ escrita DOM sem render do workspace
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

O contrato `Provider.Catalog` combina a definição estática dos pares com o
snapshot de 24 horas do provedor. Na Binance, `exchangeInfo` e `ticker/24hr`
são buscados em paralelo. O resultado completo de cada mercado fica em memória
por uma hora; filtros de moeda de cotação reutilizam a mesma entrada. Uma
atualização forçada ignora o TTL, e chamadas concorrentes aguardam a mesma
requisição em andamento. Se a Binance falhar após uma carga bem-sucedida, o
último catálogo é entregue com a marca `stale`, sem afetar a sessão WebSocket.

O livro usa o stream parcial `depth20@100ms`. Como a interface mostra apenas os
melhores níveis, isso evita manter e reconstruir milhares de posições do livro
completo. Quando funcionalidades de microestrutura exigirem profundidade total,
o provider poderá ganhar uma implementação local baseada em snapshot REST +
diff stream sem alterar o contrato consumido pelo frontend.

## Frontend

- `components/chart`: ciclo de vida e acesso imperativo ao Lightweight Charts.
- `components/orderbook`: linhas fixas e atualização imperativa em lote.
- `components/market/SymbolSearchModal.vue`: catálogo pesquisável, ordenável e
  virtualizado.
- `components/market/RealtimePriceText.vue`: consumidor imperativo do último
  preço, isolado do grafo reativo do workspace.
- `components/layout/PanelResizeHandle.vue`: divisor acessível que altera apenas
  a coluna CSS do painel de mercados.
- `components/market/CryptoAssetIcon.vue`: ícones SVG curados com fallback.
- `components/workspace`: orquestra a seleção e o ciclo da sessão.
- `services/marketData.ts`: única fronteira com bindings/eventos Wails.
- `services/realtimePrice.ts`: canal quente de preço sem estado Vue.
- `services/marketCatalogSearchEngine.ts`: ciclo de vida e fallback do Worker.
- `workers/marketCatalog.worker.ts`: filtro, favoritos e ordenação fora da
  thread do WebView.
- `types/market.ts`: contratos do frontend.

O gráfico é criado uma vez no `onMounted` e removido no `onBeforeUnmount`.
`setData()` é reservado ao histórico; candles em tempo real usam
`series.update()`. Timestamps recebidos em milissegundos da Binance são
normalizados no Go para segundos antes de chegar ao Lightweight Charts.

O livro não mantém arrays profundos reativos. Apenas o snapshot mais recente é
guardado e, no máximo uma vez por frame, os textos das linhas já existentes são
atualizados. Assim, bursts de profundidade não provocam diff do DOM pelo Vue e
não interferem no canvas do gráfico. As barras de profundidade não usam
transições CSS: cada snapshot mostra a largura exata imediatamente, sem manter
20 animações concorrentes entre atualizações. Referências para preço,
quantidade, total e preenchimento são resolvidas apenas na montagem; o caminho
quente não executa `querySelector`, não cria slices e só escreve no DOM quando o
valor realmente mudou.

O backend também mantém um canal de capacidade 1 entre o WebSocket do livro e
o bridge Wails. Se o consumidor atrasar, o snapshot pendente é substituído pelo
mais novo. Dados antigos nunca criam uma fila crescente.

O seletor não renderiza nem ordena o catálogo inteiro na thread principal. Um
Web Worker persistente é pré-aquecido enquanto o modal está fechado e devolve
um `Uint32Array` transferível com os índices já filtrados e ordenados. O Vue
monta apenas a janela visível mais um pequeno overscan. Valores formatados das
linhas visitadas ficam em um `WeakMap`, evitando repetir `Intl.NumberFormat`
durante hover ou navegação pelo teclado. O campo de pesquisa é controlado
diretamente pelo DOM: cada tecla envia a consulta ao Worker sem criar um render
Vue intermediário. As linhas usam memoização e hover puramente CSS. Se o
WebView não disponibilizar Workers, um fallback mantém a função de busca sem
comprometer a operação.

O backdrop é opaco, não usa `backdrop-filter` e possui contenção de layout e
pintura. Isso evita recompor o canvas e o livro atrás do modal. O modal continua
com layout montado e alterna apenas `visibility`, mantendo Worker, índice e
geometria vivos entre aberturas.
Gráfico e livro também têm contextos de pintura contidos separadamente, para
que a invalidação visual de um painel não se propague ao outro.

Preço e latência de alta frequência não sobem para refs do
`TradingWorkspace`. O gráfico e o livro publicam o preço em um canal imperativo;
somente `RealtimePriceText` escreve no nó do ativo selecionado. A latência
também atualiza diretamente seu texto. Assim, nenhum tick agenda render do
workspace ou do modal.

Favoritos são persistidos no `localStorage` do WebView e separados por
provedor, mercado e símbolo. Ao trocar de par, o workspace cancela a sessão
anterior, substitui o histórico uma vez com `setData()` e retoma atualizações
incrementais com `series.update()`.

O painel lateral usa uma custom property na grade para controlar a largura.
Durante o arraste, o divisor publica no máximo uma alteração por frame e não
toca no estado de candles ou do livro. O `autoSize` do Lightweight Charts
observa o novo tamanho do container e redimensiona o canvas sem recriar o
gráfico. A largura escolhida é persistida localmente e limitada conforme a
largura disponível da janela.

Os criptoícones vêm de `@web3icons/core`. Cem SVGs são importados
explicitamente e entram no bundle; o objeto global da biblioteca, que contém
milhares de arquivos, não é importado. Apenas as linhas visíveis do modal
virtualizado instanciam os SVGs, e símbolos fora do conjunto usam um fallback
leve com as iniciais do ativo.

## Teste de integração

Os testes comuns não acessam a rede. A validação real e opt-in de REST, candles
e livro para Spot e Futures pode ser executada com:

```sh
BINANCE_LIVE_TEST=1 go test ./internal/providers/binance \
  -run TestLiveMarketData -v -count=1
```

## Próximos módulos

1. stream agregado de mini-tickers para atualizar o catálogo entre refreshes;
2. métricas de latência e sequência do stream;
3. múltiplas abas/sessões;
4. ordens, posições e credenciais criptografadas;
5. primitivas do Lightweight Charts para entrada, TP, SL e break-even.
