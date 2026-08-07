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

## Camadas e pacotes de módulo

A fronteira entre processos continua seguindo o
[ADR-0004](./adr/0004-camadas-e-fronteiras-de-modulo.md), enquanto o renderer
é organizado por pacotes verticais conforme o
[ADR-0005](./adr/0005-pacotes-por-feature-no-renderer.md):

```text
shared/                         contratos neutros entre processos
   ▲                                      ▲
   │                                      │
electron/                              src/
├── main/                 renderer ─────┼── app/       shell e estilos
├── preload/                             ├── features/  pacotes de produto
└── utility/                             ├── platform/  adapter do preload
                                         └── shared/    reúso do renderer
```

- `shared/contracts/desktop.ts`: comandos, eventos, validação e API exposta ao
  Vue; não depende de Vue nem Electron.
- `shared/types/market.ts`: tipos consumidos por renderer e processos desktop.
- `src/app`: composição do app, shell e ordem da cascata global.
- `src/features/<feature>`: componentes, composables, domínio, services,
  plugins e Workers pertencentes à mesma capacidade.
- `src/platform/desktop`: única fronteira do renderer com o `contextBridge`.
- `src/shared`: componentes, domínio e serviços reutilizados somente dentro do
  renderer; não deve importar features.
- `src/types`: declarações de ambiente do renderer.

`electron/` resolve somente `@shared`. Os aliases dos pacotes do renderer
(`@chart`, `@drawings`, `@indicators`, `@market` e equivalentes) existem apenas
no build do renderer e no Vitest. ESLint impede dependência de Vue/Electron no
domínio e impede `src/shared` de apontar para app, plataforma ou features.

## Camada desktop Electron

- `electron/main`: ciclo de vida das janelas, validação IPC,
  coordenação e reinício dos processos auxiliares.
- `electron/preload`: API mínima exposta por `contextBridge`; o
  renderer não recebe Node.js nem acesso direto ao Electron.
- `electron/utility/market-data`: sessão RxJS e contrato modular de
  providers.
- `electron/utility/market-data/providers/binance`: endpoints, REST,
  WebSocket e normalização dos payloads.

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

O livro é mantido por inteiro no processo utilitário, a partir de um snapshot
REST somado ao *diff depth stream* (`@depth@100ms`). O stream parcial anterior
(`@depth20`) entrega no máximo 20 níveis, o que esvaziava as linhas assim que o
usuário escolhia uma agregação mais larga (F-013).

Spot e Futures **não compartilham a regra de sequência**: o primeiro tem
snapshot de até 5000 níveis e encadeia por `U`; o segundo, até 1000 níveis e
encadeia por `pu`. Aplicar a regra errada produz um livro que parece plausível
enquanto diverge em silêncio, então uma quebra de continuidade descarta o livro
e refaz o snapshot em vez de prosseguir.

A agregação acontece nesse mesmo processo, não no renderer: o IPC carrega
apenas as linhas exibidas, e o custo por frame passa a ser constante,
independente da profundidade mantida em memória. O renderer informa o passo por
um comando dedicado, que re-agrega sem tocar no socket nem no livro.

## Renderer principal

- `features/chart`: ciclo de vida e acesso imperativo ao Lightweight Charts,
  histórico e custom series de candles.
- `features/drawings`: primitives, interação, persistência e interface das
  ferramentas de desenho.
- `features/indicators`: catálogo, panes, cliente e Worker de indicadores.
- `features/market`: catálogo de símbolos, busca, favoritos e canais
  imperativos de preço/latência.
- `features/orderbook`: linhas fixas e atualização DOM imperativa em lote.
- `features/settings`: painel de configuração, temas e contraste.
- `features/workspace`: composição dos painéis, abas e sessões.
- `platform/desktop/marketData.ts`: adapter único entre Vue e a API tipada do
  preload.
- `app/components/PanelResizeHandle.vue`: divisor acessível que altera apenas a
  coluna CSS do painel de mercados.
- `src/shared/services/imperativeChannel.ts`: base de publicação quente fora do
  grafo reativo.
- `composables/`: estado de baixo volume com ciclo de vida Vue. O cache de
  candles mora aqui, mas é o único que **não** usa reatividade — ele é escrito
  a cada tick, e a restrição está documentada no próprio módulo.

Cada montagem do gráfico cria uma instância no `onMounted` e a remove no
`onBeforeUnmount`.
`setData()` é reservado ao histórico; candles em tempo real usam
`series.update()`. Timestamps da Binance são normalizados de milissegundos para
segundos no provider antes de chegar ao Lightweight Charts.

Os candles usam uma `ICustomSeriesPaneView` baseada no exemplo oficial
Rounded Candles. O renderer trabalha em coordenadas bitmap para preservar
nitidez HiDPI e percorre somente o intervalo visível, sem criar um array
intermediário por frame. A direção continua seguindo a semântica OHLC
(`close >= open`), e o raio é reduzido até zero quando as barras ficam
comprimidas.

O símbolo e o período são desenhados no próprio canvas pela API oficial
`createTextWatermark`; não existe uma camada HTML concorrendo com os eventos do
gráfico. O arraste sobre o painel principal desativa o auto scale antes do
handler nativo da biblioteca, permitindo movimentar conjuntamente os eixos X e
Y. Um duplo clique na escala de preços restaura o ajuste automático.

Os estilos ficam em `src/app/styles/`, divididos por domínio; `src/app/styles/index.css` guarda
apenas os `@import`. **A ordem desses imports é a ordem da cascata** e não deve
ser alterada sem verificar: a divisão garante que dois blocos com o mesmo
seletor permaneçam no mesmo arquivo, preservando a precedência original.

As cores da interface derivam dos tokens, por `var(--token)` ou por
`color-mix()` quando o tom pretendido fica entre dois tokens. Assim uma troca de
preset recolore o app inteiro, e não só o gráfico. Permanecem fixas apenas as
cores de marca — o amarelo da Binance não deve seguir o tema. Ao criar um tom
novo, lembre que tokens de superfície invertem entre claro e escuro enquanto
`--accent-contrast` continua branco: uma fórmula validada só no escuro pode
resolver para branco-sobre-branco no claro.

O tema fica em um serviço compartilhado e persistido no `localStorage`.
Luminosidade (`dark`/`light`) e paleta são estados independentes. O catálogo
possui 38 presets fixos, cada um com variantes clara e escura e cores
semânticas próprias para alta, baixa, volume, superfícies, texto e destaque.
A raiz recebe `data-theme`, `data-theme-preset` e custom properties semânticas.
A janela de pesquisa usa a mesma origem/storage e inicializa diretamente na
aparência salva.

No gráfico, candles não carregam cores individuais no histórico; o renderer
usa as opções direcionais da série. Assim, uma troca de preset recolore todos
os candles por `series.applyOptions()` e atualiza layout, escalas, crosshair e
watermark por `chart.applyOptions()`, sem recriar o chart ou tocar nos streams.
Os pontos de volume atualmente carregados recebem novamente suas cores
direcionais; o intervalo lógico visível é salvo e restaurado para não mover o
viewport.

A janela principal inicia em tela cheia. O gráfico inicia nas últimas 20 barras
com quatro posições vazias à direita. Ao aproximar-se do limite esquerdo, a
escala lógica solicita uma página de 400 candles anteriores ao processo
utilitário. A página usa cursor `endTime` exclusivo na Binance, é inserida por
`setData()` e restaura o intervalo lógico deslocado pelo número de barras
adicionadas. Durante esse trabalho, uma superfície opaca bloqueia somente o
painel do gráfico e seus manipuladores de zoom/pan; streams realtime e o livro
continuam ativos.

O painel de configurações é teletransportado para uma camada fixa, sem
backdrop, blur ou alteração da grade do workspace. `contain` e `isolation`
limitam layout e pintura à própria superfície. Gráfico e livro continuam
montados e recebendo dados enquanto o painel está aberto. A navegação já
reserva seções separadas para preferências gerais e providers, evitando que
futuras chaves de API sejam misturadas ao estado visual.

O painel funciona como uma subjanela persistente. O arraste escreve somente um
`translate3d` coalescido por `requestAnimationFrame`; nenhum estado Vue muda no
caminho do ponteiro. No resize, um contorno leve acompanha o cursor e largura,
altura e reflow do conteúdo são aplicados uma única vez ao soltar. Geometria,
posição e tamanho ficam no `localStorage`.

Temas personalizados são definições pequenas e validadas, limitadas a 12 por
dispositivo. Cada definição parte de um dos presets e guarda cores e
opacidades separadas para claro e escuro. O editor não altera o chart enquanto
o usuário experimenta: sua miniatura é local. Ao salvar, candles e fundo podem
usar RGBA; preços e textos mantêm versões sólidas para preservar contraste.
As miniaturas do catálogo recebem a própria `ThemePalette`, portanto mostram
fundo, grade, destaque e candles de alta/baixa antes da seleção.

Cada aba possui seleção, período, status, geração de cancelamento e `sessionId`
próprios; a latência trafega pelo canal imperativo, fora do modelo da aba.
Trocar de par, mercado ou período é assíncrono, então uma segunda troca pode
começar antes de a primeira terminar. A geração é comparada antes de cada
continuação escrever no estado: se não for mais a mais recente, ela aborta. O processo realtime mantém conexões de candles e livro
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

Preço e latência de alta frequência não sobem para refs do `TradingWorkspace`.
Ambos usam `services/imperativeChannel.ts`: um publish/subscribe indexado por
chave, fora do grafo reativo. O gráfico e o livro publicam o preço; somente
`RealtimePriceText` escreve no nó do ativo selecionado. A latência é amostrada
a cada 500 ms e vai direto para `StreamLatencyText`, sem passar pelo modelo da
aba — antes ela era escrita em `WorkspaceTab.latency` e, como a lista de abas é
reativa profunda, cada amostra agendava uma render pass do componente que
hospeda o gráfico.

A indexação por chave importa: a versão anterior do canal de preço percorria
todos os assinantes a cada publicação. Com uma publicação por frame do livro,
mais uma por tick de candle, o custo crescia com o número de nós de preço
montados, não com os que observam aquele par.

O painel de mercados exibe 14 linhas de um catálogo que chega a milhares de
pares e recalcula a cada tecla. `domain/topSelection.ts` faz seleção parcial:
percorre a coleção uma vez e aloca apenas o buffer do resultado, em vez de
copiar e ordenar o catálogo inteiro na thread que pinta o gráfico.

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
npm run lint
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
