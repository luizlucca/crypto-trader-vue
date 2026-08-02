# F-014 — Indicadores técnicos no gráfico

**Status:** em desenvolvimento  
**Última revisão:** 2026-08-01
**Relaciona-se a:** [F-004](./F-004-grafico-lightweight.md),
[F-005](./F-005-historico-do-grafico.md), ao item DA-003 do
[roadmap](../roadmap/README.md) e ao
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)

## Caso de uso

Como operador, quero aplicar indicadores técnicos ao gráfico, ajustar seus
parâmetros e ler seus valores no ponto onde o cursor está, para fundamentar
decisões sem sair da plataforma.

## Comportamento esperado

- `Ctrl+I` abre o seletor de indicadores do gráfico ativo.
- Um seletor lista os indicadores por categoria, com busca por nome.
- Escolher um indicador o desenha imediatamente e abre suas configurações no
  próprio seletor, em sanfona. Confirmar mantém; cancelar ou fechar o seletor
  remove.
- Cada indicador expõe seus próprios parâmetros, e o formulário é montado a
  partir da definição do indicador — não de código escrito por indicador.
- Indicadores de sobreposição (médias, bandas) desenham no painel do preço;
  osciladores ganham painel próprio.
- Vários indicadores coexistem, inclusive dois do mesmo tipo com parâmetros
  diferentes.
- Cada um pode ser removido e reconfigurado individualmente.
- Os valores no ponto do cursor aparecem em uma legenda.
- **Aplicar, recalcular ou remover um indicador não pode causar perda de frame
  no gráfico nem no livro de ordens.**

## A biblioteca

[`lightweight-charts-indicators`](https://github.com/deepentropy/lightweight-charts-indicators),
citada no `awesome-tradingview` oficial. Levantamento em 2026-07-31:

| | |
| --- | --- |
| Licença | MIT |
| Versão | 0.5.0 — publicada em 2026-07-17 |
| Histórico | 7 versões desde 2025-12; manutenção ativa |
| Conteúdo | 457 entradas: 82 padrão, 317 da comunidade, 58 padrões de candle |
| Dependência | `oakscriptjs` (runtime compatível com PineScript v6, MIT) |
| Peso | 4,6 MB desempacotado, 931 arquivos |

### O que a torna adequada

O cálculo é **desacoplado da renderização**. Cada entrada do `indicatorRegistry`
carrega tudo o que a interface precisa:

```jsonc
{
  "id": "rsi",
  "name": "Relative Strength Index (RSI)",
  "category": "Oscillators",
  "overlay": false,                    // painel próprio ou sobre o preço
  "inputConfig": [                     // gera o formulário de parâmetros
    { "id": "length", "type": "int", "title": "RSI Length",
      "defval": 14, "min": 1 },
    { "id": "src", "type": "source", "title": "Source", "defval": "close" }
  ],
  "plotConfig": [                      // como desenhar cada série de saída
    { "id": "plot0", "title": "RSI", "color": "#7E57C2", "lineWidth": 1 }
  ],
  "hlineConfig": [ /* linhas de referência, ex. 70/30 */ ],
  "defaultInputs": { /* ... */ },
  "calculate": "(bars, inputs) => IndicatorResult"
}
```

`calculate` devolve `{ metadata, plots, fills, markers }`, onde cada plot é uma
lista de `{ time, value }`. Um indicador pode ter vários plots — MACD tem três,
RSI expõe sete.

Os tipos de parâmetro existentes no catálogo são exatamente seis: `int`,
`float`, `bool`, `string`, `color` e `source`. **O formulário dinâmico é um
mapeamento desses seis tipos para controles**, não uma tela por indicador.

### Peso do pacote

O pacote não declara `sideEffects: false` e expõe um único ponto de entrada, de
modo que importar um indicador importa os 446: medido com
`esbuild --bundle --minify`, importar apenas `SMA` produz 1.028 KB.

**Isso não é uma restrição neste projeto.** Sendo uma aplicação desktop, o
tamanho do pacote não compete com nada. O registro fica aqui como contexto, não
como problema a resolver.

## Implementação e decisões de arquitetura

### O cálculo roda em Web Worker

Recalcular um indicador sobre milhares de barras é trabalho O(n) por indicador.
Na thread principal isso disputaria com o desenho dos candles e com o commit por
frame do livro de ordens — a classe de problema que o
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md) existe para
evitar. O Worker mantém esse custo fora do caminho de desenho.

O projeto já usa esse padrão em `src/workers/marketCatalog.worker.ts`, então
não se trata de introduzir um mecanismo novo.

O Worker é criado sob demanda, na primeira aplicação de indicador, e encerrado
quando o último é removido: uma aba sem indicadores não paga nada.

### O gargalo real é a aplicação do resultado, não o cálculo

Com o cálculo fora da thread, o que sobra na thread do gráfico é aplicar o
resultado. `setData()` com milhares de pontos, multiplicado pelo número de
indicadores, a cada tick, é o que de fato custaria frame.

Por isso **o Worker devolve apenas o que mudou**. Ele retém o resultado anterior
de cada instância e compara: em um tick comum, só os últimos pontos diferem, e a
thread principal faz `series.update()` em um punhado de valores em vez de
`setData()` na série inteira. `setData()` fica reservado à primeira aplicação e
ao carregamento de histórico anterior, quando a série realmente muda por
inteiro.

Os pontos trafegam em `Float64Array` transferível, sem cópia entre threads e sem
alocar objetos por ponto no caminho quente.

### Recálculo: a biblioteca não tem atualização incremental

`calculate()` recebe o array inteiro de barras e devolve a série inteira. Não há
API para atualizar apenas a última barra.

**O recálculo completo a cada tick é aceito**, porque acontece no Worker e não
disputa com o desenho. O que não é aceito é enfileirar trabalho: os ticks são
coalescidos, com no máximo um recálculo em andamento por instância e no máximo
um agendado atrás dele. Um resultado que chega para uma geração antiga é
descartado, pelo mesmo padrão de `generation` já usado em `useWorkspaceTabs`.

Carregar histórico anterior invalida o resultado retido e força um `setData()`,
porque aí a série muda inteira.

### Marcadores também são desenho

Uma varredura pelos 457 indicadores mostrou que **93 não desenhavam nada**. A
maior fatia — 40 deles, incluindo todos os padrões de candlestick e os fractais
de Williams — expressa-se apenas por `markers`, um campo do resultado que a
implementação ignorava. O indicador entrava na lista e o gráfico não mudava.

Os marcadores agora vão para a série de candles via `createSeriesMarkers`, e
são enviados pelo worker só quando o conjunto muda, pelo mesmo princípio do
diff dos plots. As formas do catálogo (`triangleUp`/`triangleDown`) não existem
na biblioteca e são mapeadas para setas.

Restam os que não produzem nada com os parâmetros padrão — alguns dependem de
uma opção ligada, outros usam recursos ainda não suportados. Esses são
identificados em tempo de cálculo e explicados ao operador, como descrito em
[um painel em branco sempre tem explicação](#um-painel-em-branco-sempre-tem-explicação).

### Parâmetros agrupados por família

O catálogo entrega os parâmetros na ordem de cálculo, o que intercala tipos: a
SMA declara comprimento, fonte, deslocamento, tipo de suavização, comprimento
da suavização e desvio. Ajustar quatro números exigia pular por cima de duas
listas de seleção.

`groupIndicatorInputs` reagrupa por família — numéricos, seleções, opções,
cores, texto — preservando a ordem do catálogo dentro de cada grupo. O título
do grupo só aparece quando há mais de um: com um só, ele é o formulário
inteiro e o rótulo seria ruído.

### Todas as linhas declaradas ficam listadas

O painel de estilo listava apenas as linhas que estavam produzindo valores. Isso
o tornava instável: ao abrir, o cálculo ainda não voltou e todas apareciam;
quando o resultado chegava, as vazias sumiam. A SMA declara quatro linhas e
desenha uma com `maType: None`, então três desapareciam sob o cursor do usuário.

Quais linhas produzem dados também depende dos parâmetros, de modo que a lista
mudaria de novo a cada edição. Agora todas ficam listadas, e as sem valores são
marcadas — o painel para de se mexer, e é possível escolher a cor de uma linha
antes de ligar o parâmetro que a habilita.

O registro de quais linhas produzem valores é escrito no caminho por frame, e
por isso continua sendo um `Set` comum. Torná-lo reativo devolveria o caminho
quente ao grafo do Vue. Em vez disso, um contador reativo é incrementado apenas
quando o conjunto **muda** — uma vez por linha, não uma vez por patch — e é ele
que a interface observa. Sem esse sinal, a marcação ficava congelada no estado
anterior ao primeiro cálculo e todas as linhas apareciam como inativas.

### Escolher e configurar são o mesmo passo

A primeira versão separava as duas coisas: escolher fechava o seletor e abria
uma janela de configuração. Isso custava um passo e criava uma ambiguidade
real — fechar a janela sem confirmar deixava o indicador aplicado, porque não
havia diferença entre "estou avaliando" e "quero manter".

O seletor passou a expandir as configurações do indicador escolhido em sanfona,
usando a própria área do modal.

### Escolher já é aplicar

A primeira versão da sanfona desenhava o indicador como **não confirmado**:
fechar o seletor sem clicar em Aplicar o removia. Isso produzia perda de
trabalho silenciosa, e por um motivo que nenhuma posição de botão resolve — o
gráfico já estava mostrando o indicador. A interface afirmava "aplicado" e o
sistema considerava "provisório"; entre as duas versões, quem opera acredita na
que está vendo. Pior: o desfecho destrutivo era o padrão do gesto mais comum,
fechar o painel, e ficava mais provável quanto mais parâmetros o indicador
tinha, porque o Aplicar descia para fora da área visível.

**Escolher um indicador o aplica.** A sanfona passou a editar algo que existe,
não a propor algo que talvez exista. Fechar o painel, apertar Esc ou colapsar a
sanfona preservam o que está no gráfico; remover é uma ação nomeada,
`Remover do gráfico`, nunca a consequência implícita de fechar algo.

Três apoios sustentam o modelo:

- O rodapé de ações é **sticky no pé da sanfona**. Um indicador com quinze
  parâmetros não pode empurrar a ação primária para fora da vista.
- A linha do catálogo carrega o próprio estado — um check, e a contagem quando
  há mais de uma instância. O clique tem consequência visível na lista, não
  apenas no gráfico atrás do painel.
- A navegação lateral abre com **No gráfico**, que filtra o catálogo pelo que
  está aplicado. É onde a contagem cresce a cada escolha, e é o antídoto para o
  empilhamento: quem explorou cinco indicadores vê os cinco e remove dali.

Aplicar o mesmo indicador duas vezes continua possível e passou a ser
deliberado: colapsar a sanfona e escolher de novo. É assim que duas médias de
períodos diferentes convivem no mesmo gráfico.

O formulário vive em `IndicatorForm.vue` e é usado por dois hosts — a sanfona
do seletor e a janela flutuante que edita um indicador já aplicado. Os seis
tipos de parâmetro são mapeados uma vez só.

**O seletor não escurece o fundo e pode ser movido.** Um backdrop faria sentido
se a escolha fosse uma decisão isolada, mas aqui ela é comparativa: o usuário
ajusta um período e observa a linha redesenhar sobre os candles. Esconder o
gráfico esconderia justamente a informação que fundamenta a escolha.

Nas duas abas os controles ficam alinhados em coluna, não empacotados dentro de
cartões: comparar a espessura de três linhas é uma leitura vertical, e cartões
obrigariam a procurar o mesmo controle em posições diferentes.

### Renderização

Cada plot vira uma série do Lightweight Charts. **O tipo de série vem do
catálogo**: `plotConfig` declara `style`, e 110 plots pedem histograma
(`columns`/`histogram`) e 13 pedem área. Desenhar o histograma do MACD como
linha não é detalhe estético — é ler o indicador errado. Estilos sem
equivalente na biblioteca (`circles`, `cross`, `stepline`) caem em linha, que é
a aproximação honesta possível.

A série usa `chart.addSeries()` para overlays. Osciladores criam um pane
preservado com `chart.addPane(true)` e adicionam suas séries via `pane.addSeries()`.
Esses objetos visuais são criados somente quando o primeiro resultado contém
pontos válidos. Latência ou falha no cálculo não pode mais ser representada por
um pane vazio permanente.
As cores vêm de `plotConfig`, mas
passam pelo tema: um indicador precisa continuar legível nos presets
(F-009), então a cor declarada é o padrão, e o usuário pode sobrescrevê-la.

`setData()` é usado no resultado completo — é a operação correta aqui, já que a
série muda inteira. As séries de indicador **não** entram no caminho de
`series.update()` dos candles.

### Estrutura

```text
src/domain/indicators.ts          catálogo filtrado, validação de parâmetros,
                                  identidade de uma instância aplicada
src/workers/indicators.worker.ts  única fronteira que importa a biblioteca
src/services/indicators.ts        cliente do Worker: requisições, coalescência,
                                  rodadas, revisões e recuperação
src/composables/useChartIndicators.ts  ciclo de vida das séries e painéis
src/components/chart/indicators/
  IndicatorPicker.vue             seleção por categoria + busca
  IndicatorSettings.vue           formulário montado a partir de inputConfig
  IndicatorLegend.vue             valores no ponto do cursor
```

**A biblioteca é importada em um único arquivo** — o Worker. Nenhum componente
Vue, serviço ou módulo de domínio a referencia. Trocar de biblioteca depois
significa reescrever esse arquivo, não a feature.

### Níveis de referência do oscilador

35 indicadores declaram `hlineConfig`: a banda 30/70 do RSI, o zero do MACD, o
20/80 do estocástico. São eles que dão escala ao painel — sem eles o oscilador
é uma forma sem régua, e a leitura de sobrecompra e sobrevenda deixa de existir.

Entram como `createPriceLine` na primeira série do indicador, com a cor e o
estilo declarados pelo catálogo. Price lines pertencem à série e morrem com
ela, então não exigem controle próprio na remoção. Nenhum indicador de overlay
declara níveis — um preço fixo cruzando o painel de candles não teria
significado — e a montagem só ocorre em painel próprio, por garantia.

### Indicadores que desenham as próprias velas

Sete entradas não devolvem linhas: devolvem OHLC. O CVD, o Volume Delta, as
variantes de Heikin-Ashi, o RSI Candles e o Bollinger Bars são definidos assim
na biblioteca — e é assim que aparecem na TradingView. Eles não declaram nada
em `plotConfig`; a existência da saída só é conhecida pelo resultado.

Por isso a montagem é dirigida pelo resultado, e não pela definição: chegou um
`IndicatorCandlePatch`, cria-se uma `CandlestickSeries` no painel do indicador.
Encaixa no mesmo desenho de montagem tardia já usado para as linhas.

As cores vêm da biblioteca, por barra. Trafegam como paleta mais um índice por
barra — uma série usa duas ou três cores distintas, e mandar a string por barra
seria a maior parte da mensagem no caminho quente. O diff é o mesmo das linhas:
num tick comum só a cauda viaja.

### Desenho livre sobre o gráfico

Onze entradas não devolvem série nem velas: devolvem geometria. O Zig Zag é uma
cadeia de segmentos entre pivôs, o Price & Volume Profile é uma coluna de
caixas, o Auto Key Levels são linhas horizontais com o preço etiquetado. Nada
disso passa por `setData`.

Entram por uma primitiva de série (`attachPrimitive`) que guarda as formas em
**coordenadas de gráfico** — tempo e preço — e converte para pixels a cada
frame. É o que faz zoom e pan funcionarem sem consultar o Worker.

**A primitiva desenha no mesmo passe de pintura dos candles**, o que a coloca
sob o [ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md). Três
regras decorrem disso: nada é alocado por frame além das chamadas de canvas, as
formas fora da área visível são descartadas antes de qualquer conversão, e a
largura do texto de cada rótulo é medida uma vez por conjunto, não uma vez por
frame.

A âncora é a série do próprio indicador quando existe, e a série de candles
quando não existe — o Zig Zag não declara plot algum, e suas formas são
ancoradas em preço, que é a escala dos candles. Um oscilador sem série própria
não teria escala a que se ancorar, e nesse caso a interface diz isso em vez de
desenhar contra os preços errados.

As formas são recalculadas inteiras pela biblioteca e chegam inteiras, sem
diff: são dezenas de itens, e comparar custaria mais que substituir.

### Faixas de fundo e repintura das velas

Duas formas restantes do catálogo não são desenho do indicador sobre o gráfico,
e sim intervenção no próprio gráfico.

**Faixas de fundo** (`bgColors`) marcam sessões e horários: uma cor por barra,
centenas de entradas. O worker funde barras contíguas de mesma cor em faixas
antes de enviar, e a adjacência é decidida por índice de barra, não por cor —
duas sessões distintas pintadas da mesma cor precisam continuar duas faixas, ou
o intervalo entre elas seria preenchido. O renderer desenha meia dúzia de
retângulos de altura total, em `zOrder: 'bottom'`, atrás dos candles.

Uma faixa vertical não lê escala de preço, só a de tempo. Por isso ela é a
exceção à regra de âncora: mesmo um indicador de painel próprio tem suas faixas
hospedadas no painel do preço — e, não tendo mais nada a desenhar, não ganha
painel algum. Um painel vazio abaixo do gráfico se lê como defeito.

**Repintura das velas** (`barColors`) recolore as barras do mercado. Viaja como
patch de velas, porque é exatamente isso: o mesmo OHLC com outra paleta. Só as
barras que o indicador de fato pintou entram, de modo que as demais continuam
mostrando os candles do gráfico por baixo. A série usa a mesma forma
arredondada do gráfico: silhueta diferente se leria como uma segunda série, não
como as mesmas barras noutra cor.

Dois indicadores repintando ao mesmo tempo é resolvido pelo próprio gráfico —
o último montado desenha por cima, que é o último que o operador aplicou.

### Um painel em branco sempre tem explicação

Todas as formas do catálogo têm desenho. O que ainda produz painel vazio são os
indicadores que declaram plots e devolvem apenas `NaN` com os parâmetros
padrão, por período maior que o histórico carregado.

Nos dois casos o resultado era o mesmo para quem opera: um painel vazio,
indistinguível de falha. Quando uma rodada completa não produz nada, o Worker
responde `no-output` em vez de um resultado vazio, com as chaves que ele de
fato preencheu, e a interface diz qual dos dois casos aconteceu. A mensagem
existe porque decidir por um indicador em branco é pior do que não usá-lo.

`no-output` conclui a rodada para aquela instância: recalcular não muda o tipo
de saída, então a recuperação automática não é acionada.

### Mapa do catálogo

Medido sobre 600 barras de caminhada aleatória, com os parâmetros padrão:

| Situação | Entradas |
| --- | --- |
| Desenham por linhas, histogramas, áreas ou marcadores | 402 |
| Desenham pelas próprias velas | 7 |
| Desenham por segmentos, caixas e rótulos | 8 |
| Desenham por faixas de fundo ou repintura das velas | 3 |
| Padrões de candlestick — desenham quando o padrão ocorre | 30 |
| Não produzem valores com os parâmetros padrão | 7 |

### O catálogo é lido uma vez por processo

As 457 definições são dados estáticos da biblioteca. Ficam em cache no módulo
de serviço, e não por cliente: abrir o seletor deixa de custar uma ida ao
Worker e uma cópia estruturada do registro inteiro, e um gráfico sem indicador
aplicado nunca cria um Worker apenas para listar.

### Valores no cursor

`subscribeCrosshairMove` entrega `param.seriesData`. A legenda lê dali e escreve
direto no DOM, como `RealtimePriceText` e `StreamLatencyText` já fazem: o
movimento do cursor não pode agendar render do Vue.

### Persistência

Os indicadores aplicados pertencem à aba, junto com seleção e período, e são
salvos no `localStorage` por aba. Reabrir o app restaura o que estava aplicado.

**Fora de escopo:** editor de indicadores próprios, alertas sobre valores de
indicador e indicadores que dependem de outro indicador como fonte.

## Testes

Cobertura dos **10 indicadores mais usados**, comparados contra valores de
referência calculados à mão sobre uma série fixa:

`SMA`, `EMA`, `RSI`, `MACD`, `Bollinger Bands`, `ATR`, `Stochastic`, `ADX`,
`VWAP` e `OBV`.

Cada um verifica: o formato da saída, o número de pontos, o alinhamento de
tempo com as barras de entrada, o comportamento no período de aquecimento
(quando ainda não há barras suficientes) e a estabilidade do resultado ao
recalcular com os mesmos dados.

Além disso:

- `domain/indicators.test.ts`: validação de parâmetros contra `inputConfig`
  (limites, tipos, opções), e identidade de instâncias — dois RSI com períodos
  diferentes não podem colidir.
- `services/indicators.test.ts`: descarte por rodada/revisão, retry completo,
  recuperação do Worker, resultado ausente, erro isolado de cálculo e 100
  ciclos de inclusão/remoção com uma SMA ativa.
- `workers/indicatorLibrary.test.ts`: 250 ciclos determinísticos de SMA seguido
  de MFI/RSI Bollinger Bands, verificando dados nos quatro plots.
- Medição obrigatória, conforme `docs/performance/README.md`: comparar
  `taskDuration`, `scriptDuration` e contagem de long tasks sem indicadores,
  com três indicadores e com oito, mantendo o livro de ordens ativo.

## Critérios de aceite

- [ ] Adicionar, reconfigurar e remover indicadores funciona para overlays e
      para osciladores em painel próprio.
- [ ] Dois indicadores do mesmo tipo com parâmetros diferentes coexistem.
- [ ] O formulário de parâmetros é gerado a partir de `inputConfig`, sem código
      específico por indicador.
- [ ] Nenhum recálculo ocorre na thread principal.
- [ ] Em um tick comum, a thread do gráfico aplica `update()` em poucos pontos;
      `setData()` só ocorre na primeira aplicação e ao carregar histórico.
- [ ] Com oito indicadores aplicados e o livro ativo, não surge long task acima
      de 50 ms, e o custo por frame do gráfico não regride além de 20% do
      baseline sem indicadores.
- [ ] Os indicadores da comunidade aparecem no seletor, sinalizados.
- [x] Os níveis declarados pelo indicador são desenhados no painel próprio.
- [x] Indicadores de saída OHLC desenham como velas, com as cores da biblioteca.
- [x] Segmentos, caixas e rótulos são desenhados por primitiva, sem alocação
      por frame.
- [x] Faixas de fundo ficam atrás dos candles e não criam painel vazio.
- [x] A repintura preserva as barras que o indicador não pintou.
- [x] Um painel que fica em branco produz uma explicação, não silêncio.
- [x] Abrir o seletor não recarrega o catálogo nem cria Worker.
- [x] Cada linha tem cor, espessura, opacidade e visibilidade próprias.
- [x] O diálogo de configuração abre centrado e pode ser movido.
- [x] Fechar o seletor nunca remove um indicador do gráfico.
- [x] A ação primária da sanfona é visível independentemente do número de
      parâmetros do indicador.
- [x] O tipo de desenho de cada plot respeita o catálogo.
- [ ] A legenda mostra os valores no ponto do cursor sem agendar render do Vue.
- [ ] Os 10 indicadores listados têm teste contra valores de referência.
- [ ] Trocar de preset de tema mantém os indicadores legíveis.

## Armadilha encontrada na implementação

O worker só respondia quando havia mudança para aplicar. Uma rodada em que
nenhum indicador mudou não produzia mensagem alguma — e o cliente, que libera a
próxima rodada ao receber a resposta, ficava esperando para sempre. O efeito
visível era peculiar: o primeiro indicador aplicado desenhava normalmente e
todos os seguintes ficavam vazios, porque o canal já estava travado quando eles
chegaram.

A causa é de protocolo, não de cálculo: "ainda processando" e "terminei sem
mudanças" eram indistinguíveis. O worker passou a enviar `computed` ao fim de
**toda** rodada, inclusive nas saídas antecipadas, e só essa mensagem libera a
próxima. Um erro ao aplicar patches também não pode mais interromper a
liberação.

### Estado do indicador antes do estado do gráfico

Remover um indicador desmontava os objetos do gráfico **antes** de limpar o
registro. Quando o Lightweight Charts já havia reciclado o painel sozinho,
`paneIndex()` devolvia `-1`, `removePane(-1)` lançava, e a limpeza nunca
acontecia: a instância continuava registrada, o worker seguia calculando para
ela, e o resultado era escrito em séries que já não existiam.

O sintoma era intermitente e não reproduzível por passo a passo, porque
dependia de o painel ter sido reciclado ou não — o que varia com a ordem em que
indicadores de painel próprio foram adicionados e removidos.

A regra passou a ser: **primeiro o registro, depois o gráfico**. Perder um
painel é cosmético; perder o registro corrompe todo cálculo seguinte. O índice
do painel também deixou de vir de um contador próprio e passa a ser lido do
gráfico (`chart.panes().length`), que é a única fonte que acompanha as
renumerações.

### O worker recebe barras **e** indicadores ao ser criado

Semear o worker novo apenas com o histórico resolvia metade do problema: ele
sabia sobre o que calcular, não o que calcular. Como o worker é encerrado
quando o último indicador sai, o seguinte nascia sem nenhum indicador
registrado. O cliente passou a reter o registro e reenviá-lo — o mesmo padrão
que `MarketDataCoordinator` usa para restaurar assinaturas após um reinício do
processo utilitário.

### O worker é sempre semeado por quem o cria

O envio do histórico estava condicionado a "este é o primeiro indicador". A
condição certa, porém, é "este worker está vazio" — e as duas divergem, porque o
worker é encerrado quando o último indicador sai e recriado no próximo. Com
outros indicadores já montados, o worker novo nascia sem barras e calculava
sobre nada: um indicador adicionado depois de uma remoção não desenhava.

Quem cria o worker passou a semeá-lo. O cliente recebe uma função que lê o
histórico atual e a chama em `ensureWorker`, de modo que nenhum worker pode
existir sem barras. O caso especial de "primeiro indicador" deixou de existir —
não havia como acertá-lo em todas as ordens de operação.

### Rodadas e revisões tornam o protocolo determinístico

Uma `generation` global não distingue duas rodadas sobre o mesmo histórico nem
uma configuração antiga de uma instância reconfigurada. Cada `compute` agora
recebe um `roundId` monotônico e cada instância possui uma `instanceRevision`.
`result`, `error` e `computed` devolvem esses identificadores; o cliente só
aplica ou encerra a rodada quando ambos coincidem com o registro corrente.

Se `setData()` ou `update()` lançar, o estado de apresentação não é confirmado.
O cliente agenda uma única tentativa completa, evitando que uma série que
perdeu o primeiro `setData()` receba somente patches de cauda e permaneça vazia.
No caminho normal, o custo adicional se resume a comparações de inteiros.

### Pane de oscilador tem ciclo de vida explícito

No Lightweight Charts 5.2, remover a última série pode reciclar automaticamente
um pane vazio. Osciladores com vários plots não dependem mais desse efeito:
usam `chart.addPane(true)`, recebem as séries pelo `IPaneApi` e mantêm o pane
preservado durante a desmontagem. Depois de todas as séries saírem, o pane é
removido explicitamente por seu índice atual.

A criação também é tardia e transacional: a instância chega primeiro ao Worker;
somente um resultado não vazio cria as séries e o pane. Se qualquer `setData()`
falhar, as séries anteriores e o pane recém-criado são desfeitos antes do retry.
Assim o usuário nunca recebe um pane parcialmente preenchido ou vazio como se
fosse um indicador aplicado com sucesso.

### Falha do Worker é recuperável

O cliente trata `error` e `messageerror`. Barras e registro de instâncias ficam
retidos fora do Worker; em uma falha ele é recriado, reidratado e recebe um
cálculo completo. Há limite de tentativas para impedir um ciclo infinito. A
thread de desenho não executa recálculo durante essa recuperação.

Erros de uma única instância também são recuperáveis. Antes, uma mensagem
`error` de `lightweight-charts-indicators` era apenas exibida; a rodada terminava
e o pane previamente criado ficava vazio. Agora a instância recebe nova revisão,
o Worker recebe um snapshot fresco das barras e um cálculo completo é agendado,
com limite de tentativas. Uma rodada completa também registra quais instâncias
deveriam responder: se `computed` chegar sem o respectivo `result`, o mesmo
reparo é acionado.

Os `Map`/`Set` usados nessa confirmação existem apenas em rodadas completas
(inclusão, histórico e recuperação). Rodadas incrementais de realtime não
alocam snapshots do registro, preservando o caminho quente.

## Catálogo exposto

Todas as 457 entradas ficam disponíveis para seleção. As 317 portadas da
comunidade a partir de PineScript não têm garantia de equivalência com o
original, então aparecem em uma seção própria, rotulada como **não
verificada** — visível e utilizável, apenas sem a mesma promessa de exatidão
dos 82 padrão.

## Riscos

- **Dependência transitiva `oakscriptjs`.** É o runtime que executa os
  indicadores. Um problema nele afeta todos. Ambos são do mesmo autor e têm a
  mesma data de publicação.
- **Sem atualização incremental na biblioteca.** Contornado pelo diff feito no
  Worker; o custo de recálculo permanece fora da thread do gráfico.
- **Precisão dos portes da comunidade.** Sinalizada na interface.

## Evolução

O mesmo Worker e o mesmo contrato servem para alertas sobre valores de
indicador e para o item DA-004 (primitivas de entrada, TP, SL e break-even),
que precisa de séries derivadas calculadas fora da thread do gráfico.
