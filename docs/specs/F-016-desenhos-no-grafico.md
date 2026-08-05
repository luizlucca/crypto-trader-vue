# F-016 — Desenhos no gráfico

**Status:** em evolução  
**Última revisão:** 2026-08-05
**Relaciona-se a:** [F-004](./F-004-grafico-lightweight.md),
[F-005](./F-005-historico-do-grafico.md) e ao
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)

## Caso de uso

Como operador, quero traçar linhas de tendência e níveis sobre os candles para
registrar suportes, resistências e projeções, e reencontrá-los depois — em
qualquer período e depois de fechar o app.

## Comportamento esperado

- Sessenta e oito ferramentas, agrupadas em oito famílias: linhas, canais e
  forquilhas, Fibonacci, Gann, formas geométricas, projeções e posições,
  medições, e anotações e marcações.
- A barra mostra uma ferramenta representativa por família. O botão principal
  arma imediatamente a ferramenta lembrada; um botão adjacente, visualmente
  separado, abre o menu lateral. Escolher uma variante arma o desenho e faz
  dela a representante da família até outra ser escolhida.
- O menu fecha ao escolher, clicar fora ou pressionar `Esc`; setas, `Home` e
  `End` percorrem suas opções sem mouse.
- Escolher a ferramenta arma um desenho; ela desarma sozinha ao concluir, e
  `Esc` cancela a qualquer momento.
- Toda ferramenta de dois ou três pontos mostra prévia enquanto faltam pontos.
- A polilinha aceita de 2 a 128 vértices e continua ativa depois do segundo;
  `Enter` ou duplo clique conclui a sequência sem duplicar o último ponto.
- Enquanto uma ferramenta está armada, o cursor do gráfico muda para mira.
- Arrastar o gráfico é navegar, não desenhar.
- Clicar sobre um desenho o seleciona; clicar no vazio larga a seleção.
- O desenho selecionado pode ser arrastado inteiro, ter uma alça arrastada
  sozinha, ser restilizado (paleta, cor personalizada, quatro espessuras e
  três estilos de linha) e apagado — por botão ou pela tecla `Delete`.
- Os desenhos podem ser ocultados em conjunto e apagados em conjunto. Enquanto
  ocultos, não podem ser selecionados nem arrastados, e ocultar larga o que
  estivesse sob edição.
- Os desenhos podem ser bloqueados em conjunto. O bloqueio larga a seleção e
  impede hit test e arrasto sem retirar as primitives do gráfico.
- **Um desenho pertence ao ativo, não ao período.** Traçado no 1h, aparece no
  4h no mesmo lugar.
- Sobrevive ao fechamento do app.
- Posições comprada e vendida mostram ganho/perda em valor e percentual nos
  blocos de TP e SL.
- Régua, faixa de preço e faixa de data e preço são azuis para variação maior
  ou igual a zero e vermelhas para variação negativa; ambas as cores podem ser
  configuradas por desenho.
- Ferramentas Fibonacci que trabalham com níveis permitem adicionar, remover,
  editar o valor e escolher a cor de cada nível.
- Anotações e marcações permitem editar seu texto no inspetor contextual.
- Duplo clique sobre a caixa textual abre edição direta junto ao desenho;
  `Enter` salva, `Esc` cancela e o botão de ajustes leva ao editor completo.
- Anotações oferecem atalhos S/M/L/XL e configuração de família tipográfica,
  tamanho livre, peso, itálico e cor do texto.

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
`useChartDrawings.ts`, ligado à interface e à persistência que já existem.

Na primeira revisão de 2026-08-05 vieram mais duas primitives do mesmo commit:
`CrossLine` e `DatePriceRange`. Depois da importação, ambas foram alinhadas ao
padrão TypeScript do app: estado encapsulado, pane view e renderer estáveis,
buffers de coordenadas reutilizados e funções menores para geometria, rótulo e
hit test. A procedência e o comportamento permanecem rastreáveis, mas os
arquivos já não são cópias byte a byte do upstream. Elas entram nas mesmas
tabelas exaustivas de âncoras, estilo e construção das quinze anteriores.

### Auditoria do catálogo adicional

O catálogo de
[`deepentropy/lightweight-charts-drawing`](https://github.com/deepentropy/lightweight-charts-drawing)
foi auditado no commit `5f2afc335028d6a188ce0a50361056518c84cf72`.
Embora o README anuncie 68 ferramentas, seu registro executável contém 67 ids
únicos. Dezesseis já existiam aqui; a régua (`measure`) é exclusiva deste app.
As 51 diferenças foram implementadas e o catálogo local passou a ter 68.

O pacote não foi instalado e seus 22,6 mil linhas não foram copiadas. A
biblioteca não possui testes, releases ou arquivo `LICENSE` — apenas declara
MIT no `package.json` — e o manager dela duplicaria listeners e estado de
interação. A análise completa e a lista de riscos estão na
[procedência da implementação local](../../src/plugins/catalogDrawings/README.md).

`CatalogDrawing` concentra apenas o contrato mecânico compartilhado: pontos,
estilo, hit test, pane view e seleção. O renderer despacha geometrias por
família e tem cobertura exaustiva dos 51 ids. Essa concentração reduz 144
arquivos de referência a uma primitive auditável sem transformar o domínio ou
a interface em um `switch` de desenho.

Ferramentas de quatro pontos agora usam o mesmo pipeline de prévia que as de
dois e três: `updatePoints` altera a primitive que já está anexada. Não existe
reattach no `pointermove`, e o pedido de pintura continua agrupado pelo
`RepaintPump`.

Ferramentas de texto nascem com rótulos semânticos e carregam o conteúdo em
`ChartDrawing.configuration.text`. O editor é DOM contextual, sem `prompt()`,
backdrop ou operação síncrona bloqueante. O texto é local ao formulário e só
atualiza a primitive e a persistência ao confirmar.

### Ação direta e seletor são controles diferentes

O agrupamento é dado de domínio em `DRAWING_TOOL_GROUPS`: id estável, nome da
família e ferramentas que ela contém. O componente mostra oito controles
divididos: a área maior arma diretamente a última ferramenta da família e a
área estreita com seta abre a escolha. Assim repetir uma linha exige um clique,
sem perder o catálogo agrupado. A preferência fica no componente e não é
misturada ao desenho persistido.

O flyout é DOM comum, sem backdrop, blur ou observador de posição. Sua posição
é medida uma vez, no clique que o abre, e limitada à altura da barra. Assim o
menu não entra no movimento do ponteiro, no repaint das primitives ou no fluxo
reativo dos candles e do livro de ordens.

Cada grupo é exposto como menu acessível: gatilho com `aria-haspopup`, estado
em `aria-expanded`, itens `menuitemradio`, foco inicial na opção ativa e
navegação vertical por teclado.

### Polilinha tem quantidade variável de âncoras

As demais ferramentas têm cardinalidade fixa, mas uma polilinha de dois pontos
é apenas uma linha comum. O domínio passou a distinguir ferramentas de pontos
variáveis: cada `mouseup` fixa um vértice, o preview reutiliza a mesma primitive
com um ponto móvel no final, e `Enter` ou duplo clique confirma. O segundo
clique do gesto de duplo clique é removido antes de persistir para não criar um
segmento de comprimento zero. O limite de 128 vértices impede um desenho salvo
malformado de criar trabalho ilimitado no renderer.

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
manter dezenas de casos em paralelo com as primitives.

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

O painel foi substituído por um inspetor contextual compacto. Ele mantém a
identidade da ferramenta visível e revela um seletor por vez para cor,
espessura, estilo da linha ou propriedades avançadas. A escolha ativa recebe marca visual e foco; as
setas, `Home` e `End` navegam nas alternativas; `Esc` fecha primeiro o seletor
e só um segundo `Esc` larga o desenho. Clicar fora também fecha apenas o
seletor.

Não há backdrop, blur, medição contínua, transição ligada ao ponteiro ou
atualização de estilo por `hover`. A cor nativa é aplicada no evento `change`,
ao concluir a escolha, em vez de reconstruir a aparência a cada movimento no
seletor do sistema. O painel expõe somente opções que a primitive realmente
implementa: retração e extensão de Fibonacci informam que suas cores são por
nível e não oferecem uma cor única que seria silenciosamente ignorada.

O editor avançado cobre três contratos explícitos do domínio:

- cores positiva e negativa de régua e faixas;
- lista editável de níveis e cores das ferramentas Fibonacci;
- texto de anotações e marcações, limitado a 240 caracteres.

O formulário mantém rascunhos em `shallowRef` e só chama
`configureSelected()` no botão **Aplicar**. Alterar um `input`, digitar texto ou
percorrer níveis não toca na primitive, não pede quadro do gráfico e não entra
na reatividade do livro de ordens. Na aplicação, `applyOptions` atualiza a
primitive existente quando suportado; a persistência recebe uma cópia dos
níveis, sem compartilhar o array mutável do formulário.

Para texto existe também um caminho deliberadamente mais curto. O duplo clique
faz o hit test em toda a caixa desenhada — não só no raio da âncora importada —
e monta `DrawingTextInlineEditor` próximo ao ponteiro. O campo recebe foco e
seleciona o conteúdo; `Enter` confirma, `Esc` cancela, perder o foco confirma e
um botão aplica o rascunho e abre as propriedades completas. O rascunho é um
`shallowRef` local: nenhuma tecla toca no canvas. Apenas a confirmação passa
por `configureSelected()`, pede um repaint coalescido e persiste.

O listener de duplo clique corre na fase de captura. Quando reconhece texto,
interrompe o evento antes que o gesto chegue ao canvas do Lightweight Charts e
seja interpretado como reset de escala. Fora de uma caixa textual o evento
continua normal. A polilinha tem precedência quando está sendo construída.

#### Tipografia é um recurso compartilhado, não uma opção do renderer

`domain/textAppearance.ts` é a fonte de verdade independente do gráfico. Ela
define `TextAppearance`, os presets S/M/L/XL, famílias permitidas, pesos,
limites de 8 a 48px, normalização defensiva, stack CSS, shorthand do canvas e
as métricas aproximadas usadas pelo hit test. O renderer não mantém uma cópia
dessas decisões.

`components/shared/TextAppearanceControls.vue` consome esse domínio por
`v-model` e pode trabalhar em dois modos: compacto, exibindo apenas os quatro
atalhos, ou completo, com fonte, tamanho numérico, peso, cor, negrito, itálico
e prévia. O editor inline usa o modo compacto; as propriedades do desenho usam
o completo. Alertas, notas de ordem ou qualquer feature futura podem usar o
mesmo componente sem depender de `MarketChart` ou de uma primitive.

Enquanto o usuário experimenta fonte e tamanho, a prévia acontece no próprio
campo DOM. O canvas continua intocado até salvar. Depois da confirmação,
`CatalogDrawing` recebe uma cópia de `TextAppearance`; o renderer monta a fonte
com a mesma função compartilhada e dimensiona a caixa pelo tamanho escolhido.
O hit test também lê a aparência persistida, portanto uma caixa XL tem área de
interação coerente com o que foi pintado.

O operador também pode restaurar o estilo padrão em uma ação. Os seletores
usam tokens do tema e conservam contraste nas variantes clara e escura, sem
criar um segundo sistema visual dentro do gráfico.

### Medições e posições usam o dado, não texto ilustrativo

`SignedRangeDrawing` reúne régua, faixa de preço e faixa de data e preço. A
cor é escolhida pelo sinal de `preço final - preço inicial`, e o rótulo mostra
variação de preço, percentual e, onde há eixo temporal, quantidade de barras.
Não há volume ou dias simulados.

`PositionDrawing` reúne posições long e short sem duplicar dois renderers. A
direção normaliza o resultado: TP long acima e TP short abaixo são positivos;
SL long abaixo e SL short acima são negativos. Os rótulos exibem ambos os
valores e percentuais. As duas primitives mantêm pane view, renderer,
coordenadas e textos calculados entre repaints; os rótulos só são recalculados
quando uma âncora muda.

### Níveis e textos fazem parte do desenho persistido

`DrawingConfiguration` é opcional para que desenhos de versões anteriores
continuem válidos. Na leitura, payloads são aceitos somente para a capacidade
da ferramenta correspondente, níveis inválidos são descartados, a lista é
limitada a 32 e textos a 240 caracteres. Os defaults são derivados no momento
da montagem e listas novas são devolvidas a cada chamada, evitando mutação
global acidental.

### Repaint sem alocações recorrentes do catálogo

O `CatalogDrawing`, `CrossLine` e `DatePriceRange` preservam as instâncias de
`paneView`, renderer e buffers de coordenadas entre quadros. Uma atualização
escreve nos objetos existentes; não recria arrays de pontos nem um renderer em
cada repaint. O gerente também reutiliza buffers lógicos no preview e no
arrasto, mantém uma referência direta ao desenho arrastado e reaproveita o
objeto de posição do cursor durante `pointermove`.

Essas mudanças não movem candles, livro de ordens ou desenhos para Vue: a
geometria continua no canvas do Lightweight Charts, e o `RepaintPump` continua
coalescendo vários movimentos em um único pedido de quadro.

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
`src/domain/textAppearance.ts`,
`src/composables/useChartDrawings.ts`, `src/services/drawingStore.ts`,
`src/components/chart/DrawingToolbar.vue`, `src/plugins/lineTools/` e
`src/plugins/catalogDrawings/`. O controle reutilizável está em
`src/components/shared/TextAppearanceControls.vue`.

## Testes

- `domain/chartDrawings.test.ts`: cobertura exata dos grupos, leitura das duas
  novas ferramentas, interpolação e extrapolação de instantes
  entre barras, a inversa `timeForLogical` (incluindo adiante da última barra e
  a ida e volta entre as duas), polilinhas com múltiplos vértices, capacidades
  de configuração e leitura defensiva de desenhos/configurações salvos.
- `domain/textAppearance.test.ts`: presets únicos, limites e fallback de dados
  persistidos, fonte de canvas, métricas do hit test e igualdade estrutural.
- `composables/useChartDrawings.test.ts`: construção das duas novas primitives
  e das 51 primitives adicionais, tradução uniforme de estilo, hit test sobre
  o corpo visível de uma caixa textual e retorno ao estado desbloqueado depois
  de apagar todos os desenhos.
- `plugins/catalogDrawings/catalog-drawing.test.ts`: atualização de quatro
  pontos no mesmo objeto, hit test, estilo sem reattach, reutilização de view e
  renderer entre repaints, hit test de segmentos adicionais da polilinha e
  execução do caminho de pintura das 51 ferramentas.
- `plugins/lineTools/imported-tools.test.ts`: hit test, invalidação preguiçosa
  dos rótulos, estabilidade dos renderers, percentuais de posições long/short
  e smoke test de pintura.
- Validação no app com dados ao vivo de BTCUSDT 1h: as quinze ferramentas
  originais, uma a uma, com os cliques que cada uma exige; e o ciclo de edição
  — selecionar, restilizar, arrastar, apagar, recarregar.
- Carga de histórico medida com 3.000 klines reais de 1h da API de futuros da
  Binance, servidas pelo próprio caminho de paginação do app: o processo
  utilitário de market data não respondia na máquina onde a medição correu, e o
  que estava sob teste é o prepend do app, não o transporte.

## Critérios de aceite

- [x] Traçar linha de tendência com dois cliques e prévia entre eles.
- [x] Linha horizontal, raio e vertical com um clique.
- [x] As quinze ferramentas originais concluem e desenham: medido uma a uma,
      15 de 15,
      zero exceções e zero long tasks.
- [x] Linha cruzada e faixa de data e preço pertencem ao catálogo, são
      construídas pelo manager e sobrevivem ao armazenamento; coberto por
      testes automatizados.
- [x] O catálogo contém 68 ferramentas únicas: as 67 referências efetivamente
      registradas mais a régua local.
- [x] As 51 ferramentas ausentes são locais, construídas pelo manager e têm
      caminho de pintura exercitado por teste automatizado.
- [x] Ferramentas de quatro pontos recebem prévia e arrasto por mutação da
      primitive existente, sem reattach no movimento.
- [x] Nenhuma dependência npm foi adicionada para o catálogo de desenhos.
- [ ] Validar visualmente no app o ciclo completo das 51 ferramentas: criar,
      selecionar, mover, restilizar, trocar período e recarregar.
- [x] Editor não bloqueante e payload persistido para o conteúdo das
      ferramentas textuais, sem atualização da primitive durante a digitação.
- [x] Duplo clique sobre a caixa textual abre editor inline com salvar,
      cancelar, confirmação ao perder foco e acesso às propriedades completas.
- [x] Texto oferece S/M/L/XL no editor rápido e configura fonte, cor, tamanho,
      peso e itálico no editor completo, com prévia DOM antes de repintar.
- [x] Tipografia vive em domínio e componente compartilhados, sem dependência
      de gráfico, para reúso por outras features.
- [ ] Validar ao vivo o ciclo completo das duas novas ferramentas: desenhar,
      selecionar, mover, restilizar, trocar período e recarregar o app.
- [x] A barra mostra oito famílias, separa ação direta do botão de flyout e
      lembra a última ferramenta escolhida de cada família.
- [x] O flyout fecha por seleção, clique externo ou `Esc`, e aceita setas,
      `Home` e `End`.
- [x] Cliques em sequência rápida não são engolidos, incluindo dois pontos
      colocados dentro da janela de 500ms do gráfico.
- [x] Clicar na margem vazia à direita da última vela cria âncora.
- [x] Arrastar o gráfico navega sem criar desenho.
- [x] `Esc` desarma a ferramenta.
- [x] Os desenhos sobrevivem à troca de período: medido, 2 na tela no 1h, 2 no
      4h, 2 de volta no 1h.
- [x] Os desenhos sobrevivem ao fechamento do app.
- [x] Selecionar um desenho clicando sobre ele, e largar clicando no vazio.
- [x] Com os desenhos ocultos, clicar onde havia um não seleciona nada, e
      ocultar com um selecionado fecha a barra de estilo.
- [x] Bloquear os desenhos fecha a barra de estilo e impede seleção e arrasto;
      apagar todos também devolve o estado desbloqueado.
- [x] Arrastar o desenho selecionado: deslocamento rígido, medido âncora a
      âncora, e o gráfico não rola junto.
- [x] Arrastar uma alça sozinha: medido na tendência, no triângulo, no círculo
      e nas duas de um ponto — só o vértice agarrado se move.
- [x] Arrastar um canto derivado move os dois eixos certos: no canto superior
      direito do retângulo, o preço de uma âncora e o instante da outra.
- [x] Apagar o desenho selecionado por botão e pela tecla `Delete` — que não
      dispara enquanto se digita em um campo.
- [x] Cor e espessura por desenho, aplicadas às 68 ferramentas.
- [x] Inspetor contextual com seletores progressivos, cor personalizada,
      restauração de padrão e navegação por teclado.
- [x] Estilo contínuo, tracejado e pontilhado nas primitives que o suportam;
      desenhos antigos recebem o padrão contínuo na leitura.
- [x] Ferramentas Fibonacci com cores por nível não oferecem um controle de
      cor única sem efeito.
- [x] Níveis Fibonacci podem ser adicionados, removidos, recoloridos e têm o
      valor editável; a configuração sobrevive ao recarregamento.
- [x] Régua, faixa de preço e faixa de data/preço escolhem azul/vermelho pelo
      sinal e permitem configurar as duas cores.
- [x] Posições long e short mostram TP/SL em valor e percentual, com cálculo
      normalizado pela direção.
- [x] Polilinha preserva e pinta todos os vértices; `Enter` e duplo clique
      concluem o desenho.
- [x] O cursor indica o modo de desenho ativo.
- [x] O catálogo reutiliza pane view, renderer e buffers entre repaints; o
      preview não aloca um array de pontos a cada movimento.
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
