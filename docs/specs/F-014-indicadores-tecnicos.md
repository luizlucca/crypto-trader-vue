# F-014 — Indicadores técnicos no gráfico

**Status:** em desenvolvimento  
**Última revisão:** 2026-07-31  
**Relaciona-se a:** [F-004](./F-004-grafico-lightweight.md),
[F-005](./F-005-historico-do-grafico.md), ao item DA-003 do
[roadmap](../roadmap/README.md) e ao
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)

## Caso de uso

Como operador, quero aplicar indicadores técnicos ao gráfico, ajustar seus
parâmetros e ler seus valores no ponto onde o cursor está, para fundamentar
decisões sem sair da plataforma.

## Comportamento esperado

- Um seletor lista os indicadores por categoria, com busca por nome.
- Escolher um indicador o aplica imediatamente, com os parâmetros padrão.
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

### Renderização

Cada plot vira uma série do Lightweight Charts. **O tipo de série vem do
catálogo**: `plotConfig` declara `style`, e 110 plots pedem histograma
(`columns`/`histogram`) e 13 pedem área. Desenhar o histograma do MACD como
linha não é detalhe estético — é ler o indicador errado. Estilos sem
equivalente na biblioteca (`circles`, `cross`, `stepline`) caem em linha, que é
a aproximação honesta possível.

A série é criada com `chart.addSeries(tipo, options, paneIndex)`. `overlay: true` usa o painel
0; `overlay: false` cria um painel próprio. As cores vêm de `plotConfig`, mas
passam pelo tema: um indicador precisa continuar legível nos 30 presets
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
                                  descarte por geração
src/composables/useChartIndicators.ts  ciclo de vida das séries e painéis
src/components/chart/indicators/
  IndicatorPicker.vue             seleção por categoria + busca
  IndicatorSettings.vue           formulário montado a partir de inputConfig
  IndicatorLegend.vue             valores no ponto do cursor
```

**A biblioteca é importada em um único arquivo** — o Worker. Nenhum componente
Vue, serviço ou módulo de domínio a referencia. Trocar de biblioteca depois
significa reescrever esse arquivo, não a feature.

### Valores no cursor

`subscribeCrosshairMove` entrega `param.seriesData`. A legenda lê dali e escreve
direto no DOM, como `RealtimePriceText` e `StreamLatencyText` já fazem: o
movimento do cursor não pode agendar render do Vue.

### Persistência

Os indicadores aplicados pertencem à aba, junto com seleção e período, e são
salvos no `localStorage` por aba. Reabrir o app restaura o que estava aplicado.

**Fora de escopo:** editor de indicadores próprios, alertas sobre valores de
indicador, indicadores que dependem de outro indicador como fonte, e os 58
padrões de candle — eles produzem `markers`, não `plots`, e merecem tratamento
visual próprio.

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
- `services/indicators.test.ts`: coalescência de recálculos e descarte de
  resultado obsoleto por geração.
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
- [x] Cada linha tem cor, espessura, opacidade e visibilidade próprias.
- [x] O diálogo de configuração abre centrado e pode ser movido.
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
