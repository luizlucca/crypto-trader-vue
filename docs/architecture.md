# Arquitetura

## Visão geral dos processos

```text
┌ BrowserWindow principal ───────────────────────────────────────────────┐
│ Vue workspace ─ abas/sessões ─ 1 canvas + 1 livro visíveis            │
└──────────────────────┬─────────────────────────────────────────────────┘
                       │ preload isolado + IPC tipado
                       ▼
┌ Electron main ─────────────────────────────────────────────────────────┐
│ valida origem/payload ─ coordena janelas ─ encaminha somente eventos  │
└───────────────┬──────────────────────────────────┬─────────────────────┘
                │                                  │
                ▼                                  ▼
 utilityProcess: realtime                 utilityProcess: catálogo
 pool de sessões por aba                   exchangeInfo + ticker/24hr
 RxJS + WebSockets independentes           cache 1h + singleflight
                │                                  │
                ▼                                  ▼
        Binance Spot/Futures                 Binance Spot/Futures

┌ BrowserWindow de pesquisa ─────────────────────────────────────────────┐
│ Vue independente ─ Web Worker de busca/ordenação ─ lista virtualizada │
└──────────────────────────────┬─────────────────────────────────────────┘
                               └── IPC para o processo de catálogo
```

São quatro contextos de execução relevantes: renderer principal, renderer da
pesquisa, processo realtime e processo de catálogo. Uma ordenação, resize da
janela de pesquisa ou parsing de um catálogo grande não agenda trabalho na
thread do gráfico e não bloqueia a ingestão dos WebSockets.

## Camada desktop Electron

- `frontend/electron/main`: ciclo de vida das janelas, validação IPC,
  coordenação e reinício dos processos auxiliares.
- `frontend/electron/preload`: API mínima exposta por `contextBridge`; o
  renderer não recebe Node.js nem acesso direto ao Electron.
- `frontend/electron/utility/market-data`: sessão RxJS e contrato modular de
  providers.
- `frontend/electron/utility/market-data/providers/binance`: endpoints, REST,
  WebSocket e normalização dos payloads.
- `frontend/src/contracts/desktop.ts`: única fonte para comandos, eventos e
  API disponibilizada ao Vue.

As duas janelas usam `nodeIntegration: false`, `contextIsolation: true` e
`sandbox: true`. Navegação externa, criação arbitrária de janelas e permissões
do Chromium são negadas. O processo principal aceita IPC somente dos
`webContents` conhecidos e valida os payloads novamente antes de executá-los.
Objetos reativos Vue nunca atravessam o `contextBridge`: seleções e pares são
copiados para DTOs planos, compatíveis com o structured clone do Electron.

O coordenador mantém um processo auxiliar exclusivo para realtime/histórico e
outro para catálogo. Cada um possui timeout, falha de pendências e reinício
automático. O processo realtime mantém um mapa de assinaturas por `sessionId`
e restaura todas elas após um crash. O encerramento da aplicação finaliza ambos
explicitamente.

## Providers e mercados

Spot e Futures selecionam endpoints REST e WebSocket distintos. Em Futures,
os sockets também são separados por categoria conforme a API atual usada pela
Binance: candles usam `/market/ws` e o livro usa `/public/ws`.
Um novo provedor implementa `MarketDataProvider` e é registrado no
`ProviderRegistry`; nenhum componente Vue conhece URLs ou payloads da
corretora.

O contrato `getCatalog` combina a definição estática dos pares com o snapshot
de 24 horas do provedor. Na Binance, `exchangeInfo` e `ticker/24hr` são
buscados em paralelo. O resultado completo de cada mercado fica em memória por
uma hora; filtros de moeda de cotação reutilizam a mesma entrada. Uma
atualização forçada ignora o TTL, e chamadas concorrentes aguardam a mesma
requisição em andamento. Se a Binance falhar após uma carga bem-sucedida, o
último catálogo é entregue com a marca `stale`.

O livro usa o stream parcial `depth20@100ms`. Como a interface mostra apenas os
melhores níveis, isso evita manter e reconstruir milhares de posições do livro
completo. Quando funcionalidades de microestrutura exigirem profundidade total,
o provider pode ganhar uma implementação baseada em snapshot REST + diff
stream sem alterar o contrato consumido pelo renderer.

## Renderer principal

- `components/chart`: ciclo de vida e acesso imperativo ao Lightweight Charts.
- `components/orderbook`: linhas fixas e atualização imperativa em lote.
- `components/market/RealtimePriceText.vue`: consumidor imperativo do último
  preço, isolado do grafo reativo do workspace.
- `components/layout/PanelResizeHandle.vue`: divisor acessível que altera
  apenas a coluna CSS do painel de mercados.
- `components/market/CryptoAssetIcon.vue`: ícones SVG curados com fallback.
- `components/workspace`: gerencia abas e orquestra os ciclos das sessões.
- `services/marketData.ts`: fronteira única entre os componentes Vue e a API
  Electron exposta pelo preload.
- `services/realtimePrice.ts`: canal quente de preço sem estado Vue.
- `types/market.ts`: contratos de domínio compartilhados.

Cada montagem do gráfico cria uma instância no `onMounted` e a remove no
`onBeforeUnmount`.
`setData()` é reservado ao histórico; candles em tempo real usam
`series.update()`. Timestamps da Binance são normalizados de milissegundos para
segundos no provider antes de chegar ao Lightweight Charts.

O símbolo e o período são desenhados no próprio canvas pela API oficial
`createTextWatermark`; não existe uma camada HTML concorrendo com os eventos do
gráfico. O arraste sobre o painel principal desativa o auto scale antes do
handler nativo da biblioteca, permitindo movimentar conjuntamente os eixos X e
Y. Um duplo clique na escala de preços restaura o ajuste automático.

Cada aba possui seleção, período, status, latência, geração de cancelamento e
`sessionId` próprios. O processo realtime mantém conexões de candles e livro
independentes para cada aba. Ao alternar, a aplicação desmonta o canvas e o
livro anteriores e monta somente os da aba visível. Candles das abas inativas
continuam alimentando um cache limitado a 500 barras, de forma que retornar a
uma aba executa apenas um `setData()` em memória e continua com `update()`.

`Ctrl+T` e o botão de adição abrem primeiro a janela de símbolos; a sessão e
seus WebSockets só são criados após a escolha do ativo. `Ctrl+clique` em um
símbolo do painel Mercado cria a aba diretamente, preservando o período da aba
de origem. O próprio `MarketChart` inicia o histórico no `onMounted`, evitando
uma corrida entre a atualização da `key`, a atribuição de refs Vue e a carga
dos candles.

Livros de abas inativas permanecem conectados e processados no
`utilityProcess`, mas não atravessam o IPC. A sessão retém somente o snapshot
mais recente e o envia imediatamente quando volta ao foreground. Dessa forma,
o renderer recebe o fluxo de alta frequência de um único livro, mesmo com
várias abas abertas. O limite visual de oito abas também limita a quantidade de
WebSockets independentes e torna o consumo previsível.

O livro não mantém arrays profundos reativos. Apenas o snapshot mais recente é
guardado e, no máximo uma vez por frame, os textos das linhas já existentes são
atualizados. As barras de profundidade não usam transições CSS. Referências para
preço, quantidade, total e preenchimento são resolvidas na montagem; o caminho
quente não executa `querySelector`, não cria slices e só escreve no DOM quando
o valor realmente mudou. Antes do IPC, `auditTime(16)` limita o livro ao máximo
útil de um snapshot por frame e impede crescimento da fila.

Preço de alta frequência não sobe para refs do `TradingWorkspace`. O gráfico e
o livro publicam o preço em um canal imperativo; somente `RealtimePriceText`
escreve no nó do ativo selecionado. A latência é amostrada a cada 500 ms antes
de atualizar o estado da aba, portanto não transforma snapshots do livro em
renders do workspace ou da pesquisa.

Favoritos são persistidos no `localStorage` e separados por provedor, mercado
e símbolo. As janelas sincronizam favoritos por IPC. A pesquisa carrega o
`tabId` de origem, então a escolha sempre altera a aba que abriu a janela,
mesmo que o usuário tenha ativado outra enquanto pesquisava. Ao trocar de par
ou mercado, apenas aquela sessão é reiniciada. Ao trocar somente o período, um
comando dedicado substitui a assinatura de candles; a assinatura, o snapshot e
a instância Vue do livro de ordens permanecem intactos.

O painel lateral usa uma custom property na grade para controlar a largura.
Durante o arraste, o divisor publica no máximo uma alteração por frame e não
toca no estado de candles ou do livro. O `autoSize` do Lightweight Charts
observa o novo tamanho do container e redimensiona o canvas sem recriar o
gráfico.

Os criptoícones vêm de `@web3icons/core`. Cem SVGs são importados
explicitamente; o objeto global da biblioteca, com milhares de arquivos, não
entra no bundle. Apenas as linhas visíveis instanciam SVGs, e símbolos fora do
conjunto usam um fallback leve.

## Renderer de pesquisa

No Electron, `SymbolSearchModal` não é montado na janela principal. Pressionar
Enter solicita ao processo principal uma `BrowserWindow` não modal, com
renderer, layout, Worker e event loop próprios. Movimento e resize ficam a
cargo do compositor e do gerenciador de janelas do sistema operacional — não
há `pointermove`, `transform` ou reflow da aplicação principal.

O seletor não renderiza nem ordena o catálogo inteiro. Um Web Worker devolve um
`Uint32Array` transferível com os índices filtrados e ordenados. O Vue monta
somente a janela visível mais um pequeno overscan. Formatações das linhas
visitadas ficam em `WeakMap`, a pesquisa escreve diretamente no input e as
linhas usam memoização.

A janela pede catálogo ao processo auxiliar dedicado. Portanto, busca,
ordenação, lista virtual e parsing do REST não compartilham CPU com o renderer
principal nem com o processo dos WebSockets.

## Testes

Testes TypeScript comuns não acessam a rede:

```sh
cd frontend
npm test
npm run typecheck
npm run build
```

A validação real e opt-in da Binance está disponível com:

```sh
BINANCE_LIVE_TEST=1 npm test -- \
  --run electron/utility/market-data/providers/binance/provider.live.test.ts
```

## Próximos módulos

1. persistência nativa do cache e das preferências;
2. stream agregado de mini-tickers para atualizar o catálogo entre refreshes;
3. métricas de latência, sequência e filas por processo;
4. persistência e restauração opcional das abas abertas;
5. ordens, posições e credenciais no armazenamento seguro do sistema;
6. primitivas do Lightweight Charts para entrada, TP, SL e break-even.
