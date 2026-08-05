# Revisão de código — agosto de 2026

**Origem:** quatro frentes de revisão rodadas em série, uma por área, cada uma
commitada em separado.

| Frente | Escopo | Commit |
| --- | --- | --- |
| 1 | `electron/`, `shared/`, serviços de dados | `20fa3f3` |
| 2 | Indicadores, workers, protocolo | `6e0d330` |
| 3 | `MarketChart.vue`, desenho, cache de histórico | `69f0876` |
| 4 | Interface, temas, workspace | `24ef678` |

**Andamento:** o trabalho é acompanhado pela
[F-017](../specs/F-017-endurecimento-pos-revisao.md), que tem os critérios de
aceite e o que cada correção descobriu. Onda 1 fechada por inteiro: RV-001 a RV-005, mais as duas pendências de
verificação. Onda 2 fechada por inteiro: RV-006 a RV-011. Onda 3: RV-012 e RV-013
fechados; RV-014 adiado com motivo. Onda 4: fechados RV-016 a RV-019 e
RV-021 a RV-025. Aguardam decisão sua: RV-015 e RV-020, mais o RV-014 adiado.

**Este documento é o que sobrou.** O que era correção segura e defensável já
foi aplicado nos commits acima. Aqui estão os achados que exigem decisão sua:
porque mudam comportamento de produto, porque tocam caminho quente e precisam
de medição antes, ou porque a correção óbvia tem um efeito colateral pior que o
problema.

## Como ler

Cada item diz **o que acontece**, **por que importa**, **onde**, e o custo
estimado. Itens marcados com ⚠ estão no caminho quente: a regra do projeto é
que mudança ali precisa de evidência, não de argumento — a medição necessária
está descrita no item.

## Ordem sugerida

A ordem é por consequência para quem opera, não por facilidade. As três
primeiras ondas cabem em poucos dias; a quarta é trabalho de fundo.

| Onda | Itens | Critério |
| --- | --- | --- |
| 1 | RV-001 a RV-005 | Engana o operador ou interrompe o fluxo de dados |
| 2 | RV-006 a RV-011 | Obriga a reiniciar o app ou perde trabalho manual |
| 3 | RV-012 a RV-014 | Correção contida, risco baixo, ganho claro |
| 4 | RV-015 a RV-025 | Qualidade, acessibilidade, limpeza e dívida |

Se for para atacar **um só**, ataque o RV-001: é o sintoma que já foi observado
em uso e o único da lista que faz o app mentir sobre a saúde dos dados.

---

## Onda 1 — engana o operador ou interrompe os dados

### ✅ RV-001 · Livro dessincronizado reporta a sessão inteira como "Reconectando"

**O que acontece.** O estado agregado da sessão só vira `connected` quando o
snapshot REST do livro chega. Se `/depth` falhar em laço — 429 é o caso
realista — a retentativa roda a cada 15s indefinidamente e a sessão reporta
`reconnecting` **mesmo com os candles chegando normalmente**.

**Por que importa.** É a explicação para o app preso em "Reconectando aos
streams" com o gráfico funcionando, que já foi observado em uso. O operador vê
um aviso de que os dados não são confiáveis quando metade deles é.

**Onde.** `electron/utility/market-data/providers/binance/provider.ts`,
caminho de `emitSnapshot` e `scheduleSnapshotRetry`.

**A decisão é de produto, não técnica:** o estado agregado deve refletir os
candles quando só o livro está dessincronizado? Hoje ele é pessimista e
tecnicamente correto. As opções são um estado por stream na interface, ou um
agregado otimista com o livro sinalizando à parte.

**Custo:** baixo depois da decisão.

### ✅ RV-002 · Um quadro que não é kline mata o stream de candles

**O que acontece.** `normalizeKlineEvent` lança em qualquer quadro sem `s` ou
`k.i` — inclusive nos quadros `{"error":{…}}` que a Binance envia. A exceção
erra o observable, que dispara reconexão completa com backoff, indefinidamente.

**Por que importa.** Um único quadro inesperado derruba o gráfico até o
operador trocar de ativo. E o motivo real nunca aparece: o que se vê é
reconexão.

**Onde.** `electron/utility/market-data/providers/binance/normalizers.ts:208`.

**Correção.** Ignorar quadro não reconhecido e expor o motivo por `onState`, em
vez de errar o stream. Muda a semântica do normalizador, que tem teste — o
teste precisa mudar junto, de propósito.

**Custo:** médio.

### ✅ RV-003 · Retentativa infinita sem estado terminal

**O que acontece.** `count: Number.POSITIVE_INFINITY` na política de
retentativa. Um stream permanentemente inválido — símbolo deslistado, par que
deixou de existir — tenta para sempre exibindo "Reconectando", e nunca chega a
`error`.

**Por que importa.** A interface não consegue distinguir uma oscilação de rede
de um stream morto. São situações opostas para quem opera.

**Onde.** `electron/utility/market-data/providers/binance/websocket.ts:110`.

**Correção.** Um teto de falhas consecutivas que escala para `error`, mantendo
retentativa indefinida enquanto houver sinal de vida.

**Custo:** baixo.

### ✅ RV-004 · Um assinante que lança derruba a entrega dos demais

**O que acontece.** `publish` percorre os assinantes sem isolamento. Um `throw`
em `RealtimePriceText` sobe por `publishRealtimePrice` → `updateLegend` →
callback de `onCandle` e estoura dentro do laço do roteador em
`src/services/marketData.ts`, interrompendo a entrega para os **demais**
handlers da mesma sessão.

**Por que importa.** Uma escrita de DOM ruim mata o stream de candles. O
projeto já tem o precedente exato do isolamento — os `try/catch` de
`applyPatches` e do laço por instância do worker, que a `CLAUDE.md` registra
como deliberados.

**Onde.** `src/services/imperativeChannel.ts`.

**O que decidir antes:** onde o erro engolido aparece. Engolir em silêncio num
app de trade é risco próprio.

**Medição necessária:** long tasks com oito indicadores e o livro ativo, como
descrito na F-014, antes e depois de acrescentar o `try/catch` por assinante.

**Custo:** baixo de código, exige a medição.

### ✅ RV-005 · Indicador não-overlay preso no painel de preço

**O que acontece.** Se o primeiro resultado desenhável de um indicador tiver
apenas `bgColors`, `ownPaneContent` é falso e o painel próprio não é criado —
mas `createSeries` continua criando todos os plots declarados, que caem no
painel 0. Um oscilador cujo aquecimento excede o histórico carregado **e** que
emite bandas desenha suas linhas contra a escala de preço, para sempre.

**Por que importa.** Um oscilador desenhado na escala de preço é ativamente
enganoso para uma decisão de trade — parece um nível de preço e não é.

**Onde.** `src/composables/useChartIndicators.ts:742`.

**Correção.** Precisa migrar de painel séries já criadas, não só decidir melhor
na criação.

**Medição para dimensionar:** enumerar offline quais das entradas de banda ou
repintura também declaram plots, carregar uma com histórico menor que seu
período e conferir o `paneIndex()`.

**Custo:** médio.

---

## Onda 2 — obriga a reiniciar ou perde trabalho

### ✅ RV-006 · `bestLevels` é adaptativo só na aparência

**O que acontece.** `Math.max(rows, Math.min(rows * 200, 4_000))` resolve
**sempre para exatamente 4000**, porque `rowsPerSide()` devolve a constante 20.
Isso faz `book.best(4000)` ordenar por inserção num array de 4000 posições,
varrendo um livro spot de até 5000 níveis, 10 vezes por segundo por sessão.

**Por que importa.** Com oito abas é o candidato a maior custo de CPU do
processo utilitário — e possivelmente a causa raiz de ele emperrar, que a
frente 1 já tratou pelo sintoma (reciclagem do processo travado) mas não pela
origem.

**Onde.** `electron/utility/market-data/providers/binance/provider.ts:332` e
`orderBookSync.ts:163`.

**Medição necessária:** CPU do processo utilitário com oito abas e livro ativo,
e o tempo de `best()` por chamada. Direções óbvias: heap limitado, ou uma
profundidade muito menor — 4000 níveis para exibir 20 é desproporcional.

**Custo:** médio.

### ✅ RV-007 · Falha na carga inicial é terminal para a aba

**O que acontece.** Se `loadHistory` rejeita, a mensagem de erro aparece e
**não há botão de tentar de novo** — só trocar de par ou de período.

**Por que importa.** A F-005 afirma que existe tentativa manual em caso de
falha; hoje isso só vale para o histórico antigo. `loadHistory` é seguro de
reinvocar: o contador de geração cuida da corrida, e o caminho de falha passou
a ter guarda no commit `69f0876`.

**Onde.** `src/components/chart/MarketChart.vue`.

**Custo:** baixo — cerca de seis linhas de template e uma de CSS. O que segura
é validar o layout de `.chart-message.error` com um botão dentro.

### ✅ RV-008 · Falha na carga inicial descarta os desenhos

**O que acontece.** `drawings.restore(readDrawings(...))` é a última linha do
`try`. Se a chamada REST falha, os desenhos do ativo não aparecem naquela
sessão — embora estejam íntegros no `localStorage` e não dependam de candle
algum para existir.

**Por que importa.** Desenho é trabalho manual. Sumir por causa de uma falha de
rede não relacionada é a pior forma de perdê-lo: parece que foi apagado.

**Onde.** `src/components/chart/MarketChart.vue:554`.

**A sutileza:** mover a restauração para fora do `try` não resolve sozinho —
`logicalForTime` precisa de barras para posicionar, e com zero candles nada é
montado de qualquer jeito. A correção honesta é restaurar também no `catch`,
quando um tick de realtime já tiver populado as barras.

**Custo:** baixo.

### ✅ RV-009 · `historyExhausted` latcha e só solta recarregando

**O que acontece.** Duas situações legítimas travam a rolagem para trás pelo
resto da sessão: uma página **cheia** cuja deduplicação zerou (400 barras
descartadas contra `oldest.time`), e uma primeira página com menos de 500
candles.

**Por que importa.** É perda de função silenciosa: o operador rola e nada mais
carrega, sem nenhum aviso.

**Onde.** `src/components/chart/MarketChart.vue:93`.

**A armadilha:** simplesmente remover o latch cria laço infinito de
requisições, porque o cursor não avança.

**Medição antes de mexer:** contar em sessão real quantas vezes ocorre
`page.length === HISTORY_PAGE_SIZE && olderCandles.length === 0`. Se for zero,
deixe como está e feche o item.

**Custo:** baixo se a medição disser que não acontece.

### ✅ RV-010 · Sem retentativa em `fetchJSON`, e uma linha ruim descarta a página

**O que acontece.** Duas coisas na mesma superfície. `fetchJSON` não trata 429
nem `Retry-After`, então `getCandles` falha direto num 5xx transitório — e
rolar o histórico para trás martela `/klines`, o que torna 429 alcançável. E
`normalizeCandleRow` lança na primeira linha malformada, descartando uma página
inteira de 500 velas.

**Onde.** `electron/utility/market-data/providers/binance/provider.ts` e
`normalizers.ts:178`.

**A tensão deliberada:** pular linhas ruins cria buracos silenciosos no
histórico, o que para um app de trade é discutivelmente pior que falhar alto.
A decisão é sua; a revisão marcou o item em vez de escolher sozinha.

**Custo:** médio.

### ✅ RV-011 · Worker ocioso por aba, e o catálogo sem tempo limite

**O que acontece.** Três problemas do mesmo caminho:

- `catalog()` chama `ensureWorker()`, carregando o bundle de 2,18 MB. Abrir o
  seletor e não aplicar nada deixa esse worker vivo pelo resto da vida do
  gráfico — N abas, N workers ociosos, cada um segurando a biblioteca.
- Não há tempo limite no pedido de catálogo. Um worker que sobe e nunca
  responde deixa `catalogInFlight` pendente para sempre, e toda abertura
  posterior devolve essa mesma promessa pendente.
- `catalogInFlight` é de módulo, mas os interessados são por cliente: se o
  cliente A começa a busca e é descartado antes da resposta, a rejeição de A
  se propaga para todo cliente que entrou na mesma promessa — a aba B mostra
  erro de carga com um worker saudável.

**Por que importa.** O critério da F-014 "abrir o seletor não cria Worker" só
vale com o cache de módulo quente. E o segundo item é um travamento permanente
do seletor de indicadores.

**Onde.** `src/services/indicators.ts:78` e `:260`.

**Custo:** médio. Exige um caminho de liberação distinto de `dispose()`, que
hoje marca o cliente como descartado em definitivo.

---

## Onda 3 — correção contida, risco baixo

### ✅ RV-012 · `mouseup` fora do contêiner deixa o press anterior pendurado

**O que acontece.** Os dois listeners estão no contêiner do gráfico. Um
`mouseup` fora dele — sobre o livro de ordens, sobre a barra de desenho — não
chega, e `pressedAt` sobrevive ao gesto. O arrasto é recuperado no próximo
`mousedown`; `pressedAt` não. Sequência que morde: pressionar dentro, arrastar
para fora, soltar fora, depois pressionar **na barra de ferramentas** e soltar
dentro do gráfico usa a posição do press velho — e um deslocamento menor que
cinco pixels vira clique, criando âncora fantasma ou trocando a seleção.

**Onde.** `src/components/chart/MarketChart.vue:953`.

**Correção.** Ligar o `mouseup` ao `document` resolve os dois de uma vez; a
checagem `pane.contains(event.target)` já rejeita o que está fora da área de
plotagem.

**O que segura:** é exatamente o caminho de clique validado ao vivo, sem teste
automatizado, e com histórico de regressão sutil — a janela de 500ms do
duplo-clique.

**Custo:** baixo de código, risco médio. Peça um passe manual junto.

### ✅ RV-013 · `renderBands` muta o contexto sem `save`/`restore`

**O que acontece.** `renderBands` escreve `context.fillStyle` sem preservar o
estado, ao contrário de `render()`, que preserva.

**Se vaza ou não** depende de o lightweight-charts isolar o estado do canvas
entre views de painel — não verificado.

**Onde.** `src/plugins/indicatorDrawings/IndicatorDrawingsPrimitive.ts`.

**Medição antes:** a corrida de long tasks do ADR-0003, porque `save`/`restore`
por quadro entra no caminho de pintura.

**Custo:** trivial.

### RV-014 · `previous` retém `subarray` prendendo o buffer inteiro

**O que acontece.** `normalizePlotPoints` aloca um `Float64Array` do tamanho
total e devolve `subarray(0, count)`. A view retém o buffer completo: uma média
de 200 períodos sobre 600 barras prende 600 floats para reter 401.

**Não é vazamento** — é substituído a cada rodada — mas é sobrecarga constante,
multiplicada por indicador e por aba.

**Onde.** `src/workers/indicators.worker.ts:216`.

**Medição antes:** snapshot de heap com oito indicadores de período longo,
comparando o tamanho retido de `previous` contra `count * 8`. Trocar por
`.slice()` troca retenção por uma cópia por plot por rodada — só vale se a
medição mostrar que a retenção pesa.

**Custo:** trivial.

---

## Onda 4 — qualidade, acessibilidade e dívida

### RV-015 · ~90 linhas de CSS morto no tema claro

O bloco `html[data-theme="light"]` (linhas 184–377 de `src/styles/base.css`) e
o bloco `html[data-theme]` (385–512) têm **especificidade idêntica**, e o
genérico vem depois — então ele vence toda propriedade que ambos definem. São
**23 declarações sobrescritas, 12 delas com valor diferente**: a barra de
navegação quer `--panel-raised` e recebe `--navigation-bg`, o botão de mercado
ativo quer `--hover-bg` e recebe `--selected-bg`, o cabeçalho do modal de
símbolos quer `--bg` e recebe `--panel-raised`, entre outras.

Apagar é comprovadamente um no-op de renderização. **Mas essa não é a pergunta
interessante:** o bloco genérico parece ser o desenho de tokens semânticos que
deveria ter *substituído* o bloco claro, e pode ser que a intenção seja
**reviver** essas regras elevando a especificidade. Isso é uma decisão de
design sobre o tema claro inteiro, não uma limpeza.

### ✅ RV-016 · A tira de abas é um tablist incompleto

O commit `24ef678` moveu `role="tab"` do `div` não focável para o botão e
acrescentou o `tablist`. Continua faltando `tabpanel`, `aria-controls` e
navegação por setas com roving tabindex. É um tablist melhor, não um tablist
correto.

### ✅ RV-017 · Cabeçalhos de ordenação sem semântica de tabela

`MarketSidebar.vue:176` declara `role="columnheader"` sem nenhum ancestral de
linha ou tabela, o que deixa o `aria-sort` órfão. A correção honesta é
semântica de grid no cabeçalho **e** nas linhas; meia correção fica pior que a
atual.

### ✅ RV-018 · O editor de temas deixa salvar candles invisíveis

Nada impede o usuário de escolher uma cor de candle que desaparece contra o
próprio fundo que ele escolheu. A correção honesta é um **aviso de contraste**
no editor — `contrastRatio` já é exportado por `src/domain/readableColor.ts` —
e não uma correção silenciosa, porque as miniaturas existem justamente para
mostrar o que foi escolhido. É mudança de produto e precisa de spec.

### ✅ RV-019 · Código morto identificado

Cada remoção precisa de conferência própria: a `CLAUDE.md` registra que apagar
código aparentemente morto já quebrou o typecheck neste projeto.

| Onde | O quê |
| --- | --- |
| `normalizers.ts:319` | `normalizeDepthEvent` + `normalizeLevels`, ~50 linhas, resíduo da era pré-F-013, alcançável só pelo próprio teste |
| `src/services/favorites.ts` | `belongsToMarket`, sem nenhum chamador |
| `session.ts` | `MarketSessionPool.stopAll()` e `size`, usados só em teste |
| `useChartDrawings.ts:917` | `undo()` sem chamador — parece afordância pretendida e não ligada |
| `useChartDrawings.ts` | `drawings()` sem chamador, e `styleFor` exportado sem consumidor externo |

### RV-020 · Extração de `MarketChart.vue`

O arquivo tem ~1.130 linhas e três responsabilidades separáveis **sem tocar na
forma do caminho quente**: ciclo de vida dos indicadores (~190 linhas, estado
de UI de baixa frequência que não toca candle algum), tema e paleta (~70), e o
literal de opções da criação do chart (~110, que é configuração disfarçada de
código). Sobrariam ~350 linhas de núcleo real — carga de histórico, callback de
realtime e legenda —, que é tamanho revisável.

### ✅ RV-021 · Duplicação entre `themeCatalog.ts` e `readableColor.ts`

`hexChannels`, `channelHex` e `relativeLuminance` existem nos dois, com
**limiares sRGB diferentes** (`0.03928` contra `0.04045`, ambos legítimos pela
especificação) e suporte a hex de 3 dígitos só em um. Unificar arrastaria um
serviço para dentro de um módulo de domínio, cruzando a fronteira que o lint
impõe — por isso ficou.

### ✅ RV-022 · F-003 desatualizada

A linha 23 ainda diz que o livro usa `depth20@100ms`, que a F-013 substituiu
pelo livro local completo.

### ✅ RV-023 · `repaintPump.ts` fora do alcance do ESLint

É código nosso, mas mora em `src/plugins/lineTools/`, que é ignorado por
inteiro para manter o código de terceiro byte a byte igual ao upstream. Não é
lintado nem formatado. Cobrir exige uma exceção negativa no ignore.

### ✅ RV-024 · `TradingTicket.vue` e `PositionsPanel.vue` são mockups

São os únicos componentes sem caminho de dados real: valores fixos no template
e controles que não fazem nada. Não é defeito — é andaime — mas convém que
esteja escrito em algum lugar antes que alguém confie no que eles mostram.

### ✅ RV-025 · Livro de ordens com menos níveis que linhas

Quando chegam menos níveis do que há linhas, o lado de venda invertido fica
alinhado ao topo, deixando os espaços vazios **entre** as vendas e o preço
médio, em vez de acima delas. Cosmético.

---

## Sem verificação

O servidor do renderer parou de subir na máquina onde a revisão correu, então
dois itens do commit `24ef678` não foram confirmados no app. O caminho de
código dos dois foi conferido e está correto; falta o olho.

Ambos foram confirmados no app depois que a trava de instância única foi
removida: o `Esc` fecha (a checagem anterior olhava a presença do nó, e o
painel usa `v-show`), e a janela restaurou 1230 → 884 → 1230.
