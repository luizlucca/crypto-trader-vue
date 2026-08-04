# F-016 — Desenhos no gráfico

**Status:** em evolução  
**Última revisão:** 2026-08-04  
**Relaciona-se a:** [F-004](./F-004-grafico-lightweight.md),
[F-005](./F-005-historico-do-grafico.md) e ao
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)

## Caso de uso

Como operador, quero traçar linhas de tendência e níveis sobre os candles para
registrar suportes, resistências e projeções, e reencontrá-los depois — em
qualquer período e depois de fechar o app.

## Comportamento esperado

- Quinze ferramentas, agrupadas na barra por família: linhas (tendência,
  horizontal, raio, vertical), fibonacci (retração, extensão, canal paralelo),
  formas (retângulo, círculo, triângulo) e medições (posição comprada e
  vendida, régua, faixa de preço, faixa de tempo).
- Escolher a ferramenta arma um desenho; ela desarma sozinha ao concluir, e
  `Esc` cancela a qualquer momento.
- Toda ferramenta de dois ou três pontos mostra prévia enquanto faltam pontos.
- Arrastar o gráfico é navegar, não desenhar.
- Clicar sobre um desenho o seleciona; clicar no vazio larga a seleção.
- O desenho selecionado pode ser arrastado inteiro, ter uma alça arrastada
  sozinha, ser restilizado (oito cores, quatro espessuras) e apagado — por
  botão ou pela tecla `Delete`.
- Os desenhos podem ser ocultados em conjunto e apagados em conjunto. Enquanto
  ocultos, não podem ser selecionados nem arrastados, e ocultar larga o que
  estivesse sob edição.
- **Um desenho pertence ao ativo, não ao período.** Traçado no 1h, aparece no
  4h no mesmo lugar.
- Sobrevive ao fechamento do app.

## Implementação e decisões de arquitetura

### O que veio de fora, e o que não veio

As primitivas de desenho foram copiadas do plugin `line-tools`
([procedência completa](../../src/plugins/lineTools/README.md)): cada
ferramenta é um `ISeriesPrimitive<Time>` autocontido, a mesma forma que o
`IndicatorDrawingsPrimitive` já usa em produção aqui.

O `LineToolManager` do upstream — 2.027 linhas — **não veio**. Ele traz junto
uma barra flutuante própria, controles de gráfico e um CSS de 13 KB: uma
segunda interface de desenho, que competiria com o `DrawingToolbar.vue`
existente e com os tokens dos 38 presets de tema. O gerente daqui é
`useChartDrawings.ts`, com ~300 linhas, e liga-se ao que já existe.

### A âncora é o tempo, nunca o índice

As primitivas endereçam o eixo horizontal por **índice no array de dados**
(`logical`). Duas coisas quebram isso neste app:

1. Rolar para trás **prepende** candles antigos, e todo índice desloca.
2. Trocar o período troca o array inteiro — um horário de 1h não é uma barra
   no 4h.

Por isso o domínio guarda `{ time, price }` e o índice é derivado por
`logicalForTime`, que **interpola** entre as barras que cercam o instante e
extrapola pelo espaçamento vizinho quando ele cai fora do carregado.

`timeScale().timeToCoordinate()` seria o caminho óbvio e está errado: ele só
resolve horários que são exatamente uma barra. A primeira versão usava isso, e
uma linha traçada no 1h **desaparecia** ao mudar para 4h — medido, não
suposto: dois desenhos na tela, um sobrevivia.

### Quem pede o quadro

As primitivas do upstream **não implementam `attached()`**, então nunca recebem
`requestUpdate` — o sinal com que uma primitiva diz ao gráfico "tenho conteúdo
novo". Upstream não precisava: o manager deles estende `PluginBase`, que
guarda o sinal e repinta a cada mutação. Descartar o manager descartou o sinal.

O sintoma era exatamente este, medido: clicar e esperar segundos até a forma
aparecer. **Aos 250ms não havia nada na tela; aos 3s havia.** O desenho entrava
na lista em 1ms — só faltava alguém pedir a repintura.

`RepaintPump` é a menor volta possível: uma primitiva que não desenha nada e
existe só para segurar `requestUpdate`. O pedido é **adiado para o próximo
quadro e coalescido**, porque chamar `requestUpdate` de dentro de um handler de
crosshair reentra na atualização que já está correndo.

Depois da correção: **60ms** entre o clique e o pixel na tela.

### O clique não vem de `subscribeClick`

O gráfico **engole qualquer segundo clique que caia dentro de 500ms do
primeiro**, à distância que for. Dois cliques nessa janela entram no ramo de
duplo-clique dele; como estão longe um do outro, esse ramo não dispara nada, e
o handler de clique simples nunca é chamado
(`lightweight-charts.development.mjs`, `Delay.ResetClick`).

Meia dúzia de ferramentas aqui precisa de dois ou três pontos, e meio segundo é
exatamente a cadência de quem marca dois pontos. Medido: a primeira forma
entrava, a segunda não — o clique existia no DOM, sobre o `canvas`, e não
chegava ao gerente.

As âncoras passaram a ser colocadas no `mouseup` do próprio contêiner. A
**posição** ainda vem do gráfico, pelo `subscribeCrosshairMove`, que já resolve
o painel certo e nada informa quando o ponteiro sai da área de plotagem. Um
arrasto de mais de cinco pixels entre o `mousedown` e o `mouseup` não é clique
— o mesmo limiar que o gráfico usa para cancelar o dele — então navegar não
desenha.

### Clicar adiante da última vela

`param.time` só existe quando o clique cai exatamente sobre uma barra. Entre
duas barras, e sobretudo na margem vazia à direita da última vela, o gráfico
informa apenas a posição lógica — e descartar esses cliques desarmava a
ferramenta justamente onde mais se quer desenhar: à frente do preço.

`timeForLogical` é a inversa de `logicalForTime` e extrapola pelos dois lados
com o espaçamento do par mais próximo. Uma projeção traçada para o futuro
guarda um horário real e sobrevive à troca de período como qualquer outra.

### A prévia nasce com uma barra de extensão

A prévia da tendência começava com os dois pontos iguais — um segmento de
comprimento zero. Parece inofensivo e não é: a ferramenta devolve por
`autoscaleInfo()` uma faixa degenerada, e o gráfico **parou de entregar
cliques**. O segundo clique nunca chegava ao handler e a linha não podia ser
concluída. Rastreado por dentro: `click … pending=0`, `pushed pending=1`, e
nenhum terceiro evento.

A prévia passou a nascer com os pontos que faltam deslocados de uma barra cada.
O deslocamento é substituído pelo primeiro movimento do ponteiro, então nunca
aparece para quem desenha. Nas ferramentas de três pontos o cursor conduz o
ponto seguinte aos já fixados **e todos depois dele**, para a forma continuar
coerente com um só canto preso.

### O que não pode acontecer durante o movimento do ponteiro

A prévia é criada **no clique**, e o movimento apenas
escreve o segundo ponto e pede um quadro.

O quadro precisa ser pedido também aqui: o crosshair pinta na camada dele, e
mover o ponteiro **não** repinta o painel onde as primitivas vivem. Sem esse
pedido a prévia só era redesenhada quando outra coisa repintava — um tick de
mercado — e a linha seguia o cursor aos saltos. Medido depois da correção:
mediana de 7ms por movimento, p90 de 7ms. Anexar uma primitiva muta o modelo do gráfico; fazer
isso a cada pixel do ponteiro significaria invalidar o gráfico inteiro a cada
pixel — o desenho disputando o quadro com os candles, que é o que o ADR-0003
existe para impedir.

Pelo mesmo motivo `logicalForTime` recebe as barras, não os tempos: mapear
quatrocentos candles para um array novo de timestamps a cada movimento seria
alocar no caminho que precisa ficar quieto.

### Selecionar, mover e apagar

Nada disso precisou de geometria nova: as ferramentas do upstream já respondem
`toolHitTest(x, y)` em coordenadas do painel, já desenham as próprias alças com
`setSelected`, e já expõem os setters de ponto. O que faltava era o estado —
qual desenho está sob edição — e ligá-lo ao ponteiro e ao teclado.

O acerto é procurado do mais recente para o mais antigo, que é a ordem em que
estão empilhados na tela: quem foi desenhado por último é quem se pega.

Com os desenhos ocultos não se procura acerto algum. As primitivas respondem
`toolHitTest` estejam anexadas ou não — ocultar as tira do gráfico, não da
lista — então clicar no que parecia vazio selecionava uma forma invisível,
abria a barra de estilo sobre ela e permitia arrastá-la às cegas. Pelo mesmo
motivo ocultar larga a seleção.

Arrastar desloca as âncoras em **posição lógica e preço**, as unidades do
gráfico, e só então converte de volta para instantes. Assim um desenho
arrastado sobre um buraco no histórico acompanha o que o operador vê, e não uma
duração. O deslocamento é rígido — medido: as duas âncoras de uma tendência
saíram com exatamente o mesmo `+46800s` e o mesmo `-364,80`.

Durante o arrasto a rolagem do gráfico é desligada, porque é o mesmo gesto. Ela
volta no `mouseup`, nunca na próxima seleção: um arrasto que termina fora da
área de plotagem deixaria o gráfico congelado.

#### A alça agarrada é lida da geometria, não de uma tabela

As ferramentas numeram as alças **por canto, não por âncora**: o retângulo
responde com quatro cantos tendo duas âncoras, e o `date-range` devolve o mesmo
índice para dois cantos diferentes. Tabelar a numeração de cada uma seria
quinze casos para manter em dia com o upstream.

`anchorEditAt` pergunta outra coisa: *qual âncora é dona da posição horizontal
desta alça, e qual é dona da vertical?* Compara a posição agarrada com as
âncoras já convertidas para a tela e devolve o par. No canto superior direito
de um retângulo isso dá o instante de uma âncora com o preço da outra —
medido: arrastar esse canto mudou `+273,60` no preço da âncora 0 e `+39600s` no
tempo da âncora 1, e mais nada. Nos vértices de verdade os dois eixos caem na
mesma âncora, e nas ferramentas de um eixo só o outro simplesmente não tem
âncora por perto.

A alça só é procurada quando a ferramenta diz `type: 'point'`. Sem isso, clicar
em qualquer lugar de uma linha horizontal — que atravessa a tela inteira —
seria confundido com agarrar sua alça.

Os setters diferem por ferramenta — `updatePrice` para a linha horizontal,
`updatePosition` para a vertical, `updatePoints` para as demais — e o gerente
traduz. Reconstruir a primitiva seria mais curto e está fora de questão: anexar
muta o modelo do gráfico, e um arrasto faria isso a cada pixel (ADR-0003). Na
restilização, que acontece num clique, reconstruir é aceitável — e é o que as
três ferramentas sem `applyOptions` recebem.

### Rolar para trás não desloca nada

Rolar para trás **prepende** candles, e todo índice lógico desloca de uma vez.
É a razão de a âncora ser um instante, e `rebuild()` é quem reposiciona as
primitivas contra a nova indexação.

Medido com 36 desenhos na tela e quatro prepends seguidos de 400 barras cada —
de 500 para 2.100 barras carregadas:

| | |
| --- | --- |
| Desenhos na tela | 36 antes, 36 depois |
| Âncoras (tempo e preço) intactas | 72/72 |
| Deslocamento em relação às velas | 0,00px, o pior de todos |
| Desvio do índice lógico contra o prepend | 0,000 barras |
| `rebuild()` por prepend | 1,4ms · 0,4 · 0,4 · 0,1 |
| Long tasks | nenhuma |

A posição foi medida **em relação à última vela**, não em pixels absolutos: a
panorâmica move o gráfico inteiro, e comparar posição absoluta mediria o
gesto, não o prepend.

O primeiro `rebuild()` custa mais que os seguintes porque é o que constrói as
primitivas pela primeira vez depois do carregamento; do segundo em diante o
custo cai para menos de meio milissegundo, com o dobro e o quádruplo das
barras. `logicalForTime` é uma busca binária por âncora, então mais histórico
quase não aparece.

### O painel de estilo não segue a forma

Ele fica preso ao topo do gráfico, centralizado. Acompanhar o desenho exigiria
medir a forma a cada quadro e escrever isso no DOM pelo Vue — uma renderização
por pixel de ponteiro, exatamente o que o caminho de desenho existe para
evitar.

### Cada ferramenta nomeia a própria aparência

Não há um vocabulário único de opções: as linhas pedem `lineColor` e
`lineWidth`, as formas pedem `lineColor` e `width`, as medições pedem
`borderColor` e `borderWidth`, e as de fibonacci trazem cor por nível e só
aceitam a espessura. `styleFor()` traduz o desenho para o vocabulário de cada
uma — impor um só faria a opção ser silenciosamente descartada.

### Onde os desenhos são guardados

Em `localStorage`, com chave `provider:market:symbol` — sem o período, porque
uma linha de tendência é uma afirmação sobre tempo e preço, válida em qualquer
granularidade. Diferente de um indicador, um desenho é trabalho manual: perdê-lo
ao reiniciar seria perder a análise.

**Fontes de verdade:** `src/domain/chartDrawings.ts`,
`src/composables/useChartDrawings.ts`, `src/services/drawingStore.ts`,
`src/components/chart/DrawingToolbar.vue` e `src/plugins/lineTools/`.

## Testes

- `domain/chartDrawings.test.ts`: interpolação e extrapolação de instantes
  entre barras, a inversa `timeForLogical` (incluindo adiante da última barra e
  a ida e volta entre as duas), e leitura defensiva de um desenho salvo por uma
  versão antiga.
- Validação no app com dados ao vivo de BTCUSDT 1h: as quinze ferramentas, uma
  a uma, com os cliques que cada uma exige; e o ciclo de edição — selecionar,
  restilizar, arrastar, apagar, recarregar.
- Carga de histórico medida com 3.000 klines reais de 1h da API de futuros da
  Binance, servidas pelo próprio caminho de paginação do app: o processo
  utilitário de market data não respondia na máquina onde a medição correu, e o
  que estava sob teste é o prepend do app, não o transporte.

## Critérios de aceite

- [x] Traçar linha de tendência com dois cliques e prévia entre eles.
- [x] Linha horizontal, raio e vertical com um clique.
- [x] As quinze ferramentas concluem e desenham: medido uma a uma, 15 de 15,
      zero exceções e zero long tasks.
- [x] Cliques em sequência rápida não são engolidos, incluindo dois pontos
      colocados dentro da janela de 500ms do gráfico.
- [x] Clicar na margem vazia à direita da última vela cria âncora.
- [x] Arrastar o gráfico navega sem criar desenho.
- [x] `Esc` desarma a ferramenta.
- [x] Os desenhos sobrevivem à troca de período: medido, 2 na tela no 1h, 2 no
      4h, 2 de volta no 1h.
- [x] Os desenhos sobrevivem ao fechamento do app.
- [x] Selecionar um desenho clicando sobre ele, e largar clicando no vazio.
- [ ] Com os desenhos ocultos, clicar onde havia um não seleciona nada, e
      ocultar com um selecionado fecha a barra de estilo.
- [x] Arrastar o desenho selecionado: deslocamento rígido, medido âncora a
      âncora, e o gráfico não rola junto.
- [x] Arrastar uma alça sozinha: medido na tendência, no triângulo, no círculo
      e nas duas de um ponto — só o vértice agarrado se move.
- [x] Arrastar um canto derivado move os dois eixos certos: no canto superior
      direito do retângulo, o preço de uma âncora e o instante da outra.
- [x] Apagar o desenho selecionado por botão e pela tecla `Delete` — que não
      dispara enquanto se digita em um campo.
- [x] Cor e espessura por desenho, aplicadas às quinze ferramentas.
- [x] O que foi movido e restilizado sobrevive ao recarregamento.
- [x] A forma aparece imediatamente ao clicar: 60ms entre clique e pixel,
      contra "nada aos 250ms" antes da correção.
- [x] Criar desenhos em sequência não trava a interface: cinco desenhos com
      cliques de 2 a 4ms, zero long tasks.
- [x] A prévia acompanha o cursor sem saltos: mediana de 7ms por movimento.
- [x] A linha de tendência conclui no segundo clique, com qualquer número de
      movimentos entre eles (medido com 0, 2, 10 e 40).
- [x] Rolar para trás não desloca desenho algum: 36 desenhos, quatro prepends
      de 400 barras (500 → 2.100), 72/72 âncoras intactas e 0,00px de
      deslocamento em relação às velas.
- [x] `rebuild()` sob carga de histórico: 1,4ms no primeiro prepend e ≤0,4ms
      nos seguintes, com 36 desenhos e 2.100 barras. Zero long tasks.

## Evolução

Nas duas ferramentas de uma âncora só, arrastar a alça grava também o eixo que
elas não desenham — o instante de uma linha horizontal, o preço de uma
vertical. É dado morto: nenhuma das duas o lê para pintar, e em nenhum período.
Zerá-lo custaria um caso especial por ferramenta, que é justamente o que a
leitura geométrica evita.

A ferramenta de texto do upstream ficou de fora: ela precisa de entrada de
teclado sobre o gráfico, que é uma interação de outra natureza.
