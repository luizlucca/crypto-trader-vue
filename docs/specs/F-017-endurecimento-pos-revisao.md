# F-017 — Endurecimento pós-revisão

**Status:** em desenvolvimento  
**Última revisão:** 2026-08-04  
**Origem:** [Revisão de código de agosto de 2026](../roadmap/revisao-de-codigo-2026-08.md)  
**Relaciona-se a:** [F-003](./F-003-streams-realtime.md),
[F-005](./F-005-historico-do-grafico.md),
[F-014](./F-014-indicadores-tecnicos.md) e ao
[ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)

## Caso de uso

Como operador, preciso confiar no que a tela diz. Um aviso de que os dados
estão degradados quando eles não estão me faz hesitar sem motivo; a ausência de
aviso quando estão me faz decidir sobre número velho. Nenhum dos dois é
aceitável numa plataforma de trade.

Esta spec agrupa o trabalho que saiu da revisão de código: os defeitos que
enganam quem opera, os que interrompem o fluxo de dados, e a dívida que sobrou
depois de aplicadas as correções seguras.

## Escopo

A revisão percorreu o repositório em quatro frentes e aplicou o que era
correção segura e defensável (commits `20fa3f3`, `6e0d330`, `69f0876`,
`24ef678`). Restaram 25 achados que exigiam decisão — porque mudam
comportamento de produto, porque tocam caminho quente e precisam de medição, ou
porque a correção óbvia tem efeito colateral pior que o problema.

O detalhe de cada um — o que acontece, por que importa, onde, e a medição
necessária — está no
[documento da revisão](../roadmap/revisao-de-codigo-2026-08.md). Aqui ficam os
critérios de aceite e o andamento.

## Ordem de ataque

Por consequência para quem opera, não por facilidade de correção.

| Onda | Itens | Critério de entrada |
| --- | --- | --- |
| 1 | RV-001 a RV-005 | Engana o operador ou interrompe o fluxo de dados |
| 2 | RV-006 a RV-011 | Obriga a reiniciar o app ou perde trabalho manual |
| 3 | RV-012 a RV-014 | Correção contida, risco baixo, ganho claro |
| 4 | RV-015 a RV-025 | Qualidade, acessibilidade, limpeza e dívida |

## Critérios de aceite

### Onda 1 — engana o operador ou interrompe os dados

- [x] **RV-001** · O estado de cada stream é dito separadamente. Com o livro
      dessincronizado e os candles chegando, a barra de status diz "Candles
      conectados · livro reconectando" em vez de reportar a sessão inteira
      como "Reconectando".
- [x] **RV-002** · Um quadro que não é kline é ignorado com o motivo exposto,
      em vez de errar o observable e disparar reconexão indefinida.
- [x] **RV-003** · Um stream permanentemente inválido chega a `error` depois de
      seis falhas consecutivas, em vez de exibir "Reconectando" para sempre —
      e continua tentando, porque desistir de um mercado não é opção.
- [x] **RV-004** · Um assinante do canal imperativo que lança não interrompe a
      entrega aos demais, e o erro é reportado. Medido no app com o livro
      ativo: 60s de ticks ao vivo e 600 movimentos de cursor, mediana 7ms, p90
      8ms, **zero long tasks**. Ressalva: não consegui aplicar os oito
      indicadores por script, então a medição correu sem eles.
- [x] **RV-005** · Um indicador não-overlay nunca desenha contra a escala de
      preço, mesmo quando o primeiro resultado desenhável traz só bandas: ele
      migra para painel próprio na rodada em que os pontos aparecem.

### Onda 2 — obriga a reiniciar ou perde trabalho

- [x] **RV-006** · A profundidade pedida ao livro é proporcional ao quanto a
      agregação alarga o balde. Medido no app, uma aba com o livro ativo:
      **19,2% → 1,8% de um núcleo**, RSS de 192MB para 128MB. As vinte linhas
      continuam preenchidas nas quatro agregações.
- [x] **RV-007** · Falha na carga inicial do histórico oferece nova tentativa
      sem trocar de par ou período.
- [x] **RV-008** · Falha na carga inicial não faz os desenhos do ativo
      desaparecerem da sessão — nem do armazenamento, que era a perda de
      verdade escondida atrás do sintoma.
- [x] **RV-009** · Rolar para trás não é desabilitado em definitivo por uma
      anomalia: página vazia é fim do histórico e latcha; página cheia toda
      deduplicada suspende só o disparo automático, e o botão continua sendo a
      volta.
- [x] **RV-010** · Uma falha transitória do provedor não derruba a carga: 429 e
      5xx são retentados com `Retry-After` honrado, onde não há retentativa por
      fora. Uma linha malformada **continua** derrubando a página, por decisão
      registrada abaixo — e agora diz qual candle.
- [x] **RV-011** · Abrir o seletor de indicadores e não aplicar nada não deixa
      Worker ocioso; o pedido de catálogo tem tempo limite; e um cliente
      descartado não propaga sua falha aos demais.

### Onda 3 — correção contida, risco baixo

- [x] **RV-012** · Soltar o botão fora da área do gráfico não deixa o press
      anterior pendurado: o `mouseup` passou a ouvir no documento.
- [x] **RV-013** · O desenho de bandas preserva o estado do contexto de canvas,
      com um `save`/`restore` por pintura — não por banda.
- [x] **RV-014** · Medido, e a medição diz para **não** mexer: `slice` é de 6,7
      a 64 vezes mais lento que `subarray`, e o desperdício é de 3,2 KB por
      plot — cerca de 100 KB com oito indicadores de período 200. Fica como
      está, agora com o número no código.

### Onda 4 — qualidade, acessibilidade e dívida

- [x] **RV-015** · O tema claro não tem regra morta: 18 regras e 26
      declarações removidas, 122 linhas a menos. Provado no app — 203
      propriedades computadas idênticas antes e depois, no tema claro real, no
      escuro, e numa terceira rodada de controle.
- [x] **RV-016** · A tira de abas navega por setas com roving tabindex, declara
      `aria-controls` e o gráfico é um `tabpanel` nomeado.
- [x] **RV-017** · A ordenação chega a quem usa leitor de tela. **Não** por
      semântica de grid: o papel órfão saiu e a informação foi para o nome
      acessível do botão. Ver a decisão abaixo.
- [x] **RV-018** · O editor de temas avisa quando uma cor de candle fica
      ilegível contra o fundo escolhido — avisa, não corrige.
- [x] **RV-019** · Removidos `normalizeDepthEvent`, `normalizeLevels`,
      `belongsToMarket` e `undo()`, cada um conferido contra os quatro portões.
      `stopAll()` e `size` do pool ficaram: são costura de teste, não código
      morto.
- [x] **RV-020** · `MarketChart.vue` foi de 1.188 para 981 linhas, com o tema
      e o painel de indicadores em composables próprios. Medido antes e
      depois: cursor com mediana de 7ms nos dois, zero long tasks nos dois,
      troca de período em 6.034ms contra 6.030ms.
- [x] **RV-021** · A conversão de cor existe num lugar só, em
      `src/features/settings/domain/color.ts`. A unificação é comprovadamente neutra: os dois
      limiares sRGB só discordam para canais entre 10,016 e 10,315, e nenhum
      inteiro de 8 bits cai ali — há teste varrendo os 256.
- [x] **RV-022** · A F-003 descreve o livro como ele é hoje.
- [x] **RV-023** · `repaintPump.ts` é lintado — movido para fora da pasta do
      upstream, que é onde ele nunca deveria ter morado.
- [x] **RV-024** · A boleta e o painel de posições declaram que são andaimes.
- [x] **RV-025** · O livro alinha os vazios acima das vendas quando chegam
      menos níveis que linhas.

### Pendências de verificação

- [x] `Esc` fecha o painel de configurações, confirmado no app com a checagem
      de visibilidade correta (o painel usa `v-show`, então o nó fica no DOM).
- [x] A janela de configurações volta ao tamanho escolhido depois de estreitar
      e alargar a janela do app: medido 1230 → 884 → 1230.

## Implementação e decisões

### RV-001 — o dado já existia, só era descartado

O contrato `StreamStatus` **já carregava** `candleState` e `orderBookState`, e
a aba já os guardava: o caminho inteiro existia e só o rótulo os colapsava num
`switch` sobre o agregado. A correção foi mover o rótulo para uma função pura
no domínio, `sessionStatusLabel`, que nomeia os dois streams quando discordam.

O agregado continua pessimista de propósito — ele pinta o ponto de estado da
aba, e ali "o pior dos dois" é a leitura certa. O que mudou é que a frase ao
lado do ponto para de mentir.

Duas tabelas de palavras porque só a concordância difere: "candles
conectados", "livro conectado".

### RV-002 — um quadro estranho não é uma falha do stream

O socket de kline carrega mais que candles: a Binance responde a comandos de
assinatura e reporta problemas como `{"error":{…}}` na mesma conexão. Tratar
isso como candle malformado errava o observable, que derrubava o socket e
reconectava com backoff — indefinidamente, porque a conexão seguinte recebia o
mesmo quadro. Um quadro que não é kline não é falha do stream de candles; ele
só não é um candle.

`isKlineEvent` decide, `describeStreamFrame` explica, e o quadro é ignorado com
o motivo indo para a linha de status. O erro da corretora agora aparece com
código e mensagem, em vez de virar "reconectando" sem explicação.

### RV-003 — retentar para sempre, mas parar de chamar de oscilação

A retentativa continua **sem teto**: um stream que pode voltar tem que voltar
sozinho, e uma queda de rede não é motivo para desistir do mercado. O que passa
a ter limite é a *afirmação*. Um símbolo deslistado falha igual para sempre, e
reportar isso como "reconectando" deixa a interface incapaz de distinguir
oscilação de stream morto.

Seis falhas consecutivas sem dado no meio — cerca de um minuto com o backoff
atual — e o estado passa a `error`. Um sucesso zera a contagem, porque
`resetOnSuccess` já estava lá.

### RV-004 — isolar o assinante, sem engolir o erro

`publish` percorria os assinantes sem isolamento, e um `throw` numa escrita de
DOM subia por `publish`, pelo callback de candle, até o roteador que distribui
a mensagem aos handlers da sessão: uma escrita ruim no rótulo de preço parava
de alimentar o gráfico. É o mesmo isolamento que o worker de indicadores já
aplica por instância, pelo mesmo motivo.

O erro é **reportado**, não engolido. Silêncio aqui trocaria uma falha visível
por um valor que para de atualizar sem avisar, que numa tela de trade é a pior
das duas.

**Medição.** 60s com o livro ativo e ticks ao vivo: zero long tasks. 600
movimentos de cursor varrendo o gráfico — o caminho que mais publica —,
mediana 7ms, p90 8ms, pior 11ms, zero long tasks. A medição correu **sem os
oito indicadores** que o critério pede: não consegui aplicá-los por script,
porque as linhas do catálogo abrem um acordeão e só vão ao gráfico ao aplicar.
O custo de um `try/catch` em torno de uma chamada é nulo em V8, mas a medição
com carga de indicadores fica devendo.

### RV-005 — decidir o painel tarde, em vez de decidir melhor cedo

`ensureChartObjects` recusa criar painel para um resultado sem pontos de plot,
e isso está certo: um indicador que só desenha faixas ganharia uma faixa vazia
embaixo do gráfico. Mas os pontos chegam depois, quando o aquecimento é maior
que o histórico carregado no momento da montagem — um oscilador sobre histórico
curto é o caso comum —, e até agora as linhas ficavam desenhadas contra a
escala de preço, onde se leem como nível de preço e não são.

A correção **não** foi decidir por `definition.plots` na montagem: um plot
declarado e nunca produzido devolveria justamente a faixa vazia que a decisão
original existe para evitar. `ensureOwnPane` decide tarde e migra as séries com
`moveToPane` na rodada em que o conteúdo aparece — uma migração, uma vez.

### RV-006 — o multiplicador que parecia adaptativo

`Math.max(rows, Math.min(rows * 200, 4_000))` lia-se como adaptativo e não era:
`rowsPerSide()` é fixo em vinte, então resolvia **sempre para exatamente
4000**. Cada emissão — dez por segundo, por sessão — ordenava quatro mil níveis
para mostrar vinte linhas.

A profundidade passou a ser função de quanto a agregação alarga o balde, que é
a variável que de fato manda: na agregação padrão um nível bruto é uma linha, e
um múltiplo pequeno cobre as lacunas que um livro fino deixa.

**Medição, uma aba com o livro ativo, janelas de 45s:**

| Agregação | Profundidade | CPU do processo utilitário |
| --- | --- | --- |
| 0,1 (padrão) | 4000 → **80** | 19,2% → **1,8%** de um núcleo |
| 100 (a mais larga) | 4000 → 4000 | 19,8% → 19,8% |

O RSS caiu de 192MB para 128MB. Na agregação mais larga nada muda, e é
correto: encher vinte baldes de cem exige mesmo quase todo o livro — ali o
custo é inerente, não desperdício.

**O que precisava continuar valendo.** A F-013 existe porque o stream parcial
`@depth20` não conseguia encher as linhas nas agregações largas. Conferido no
app: **20/20 linhas com número em 0,1, 1, 10 e 100.**

### RV-007 — a falha inicial deixou de ser sem saída

`loadHistory` é seguro de reinvocar: o contador de geração descarta resposta
obsoleta, e o caminho de falha ganhou guarda no commit `69f0876`. Faltava só
oferecer. A mensagem de erro passou a carregar o mesmo botão que o histórico
antigo já tinha, com o texto limitado por reticências para que a razão do
provedor não empurre o botão para fora do gráfico.

### RV-008 — o sintoma escondia uma perda de dado

O relatado era que os desenhos do ativo não apareciam quando a carga inicial
falhava, embora estivessem íntegros no `localStorage`. Investigando, o
problema era pior: `mountAll` descartava silenciosamente o desenho que não
conseguia construir, e `persist` gravava **só o que estava montado**. Bastava o
operador desenhar uma forma nova para que todos os desenhos que a falta de
barras impediu de montar fossem **apagados do armazenamento**.

Um desenho sem barras contra as quais se posicionar não deixa de ser um desenho
do operador. Agora ele é guardado em `unbuilt`: conta na barra de ferramentas,
é gravado junto com os demais, e `rebuild` o materializa quando houver o que
medir. A restauração passou a acontecer nos dois caminhos de `loadHistory`, e a
primeira vela que chega a um gráfico vazio dispara um `rebuild`.

Três testes novos, todos verificados falhando sem a correção.

### RV-009 — nem toda página inútil é fim de histórico

Duas situações respondem sem nada aproveitável, e só uma significa que o ativo
acabou. Página **vazia** é o provedor dizendo que não há mais nada, e latchar
está certo. Página **cheia** cujos candles já estavam todos no gráfico é
anomalia — cursor mal convertido, relógio fora de sincronia — e latchar ali
desabilita a rolagem para trás pelo resto da sessão por causa de um transitório.

Tirar o latch de vez também não serve: o cursor não avançou, então a
retentativa automática entraria em laço. A correção separa os dois casos e, no
segundo, suspende **só o disparo automático** — o botão ao lado da mensagem
continua sendo a volta.

Isso dispensou a medição que o item pedia: a correção é segura nos dois
sentidos, então contar ocorrências deixou de ser pré-requisito.

### RV-010 — retentar onde ninguém retenta, e falhar alto onde é preciso

`fetchJSON` ganhou retentativa com `Retry-After` honrado (limitado a 10s, para
um cabeçalho ruim não estacionar a carga), mas **por chamada, não por padrão**.
Os testes existentes pegaram a razão: o snapshot do livro já agenda a própria
retentativa com backoff, e retentar por baixo multiplicava as requisições e
atrasava o momento em que o livro admite estar reconectando. Histórico e
catálogo, que não têm ninguém retentando por fora, optam por ela.

Só 429, 5xx e falha de rede são repetidos. Um 4xx que não seja 429 é pedido
errado deste código, e repetir gasta orçamento à toa.

**A linha malformada continua derrubando a página inteira, e é deliberado.**
Pular a linha deixaria um buraco idêntico a um gap de mercado: todo indicador
calcularia por cima dele como se fosse real, e nada na tela diria que falta um
candle. Falha alta é recuperável — a requisição acima retenta e o operador tem
botão —, buraco silencioso é número errado apresentado como certo. O que mudou
é que a mensagem agora diz **qual** candle.

### RV-011 — três problemas no mesmo caminho

**Tempo limite.** Um worker que sobe e nunca responde deixava a promessa
compartilhada pendente para sempre, e como ela é compartilhada, toda abertura
seguinte do seletor recebia essa mesma promessa morta — o seletor ficava
quebrado até reiniciar o app. `onerror` e `onmessageerror` só cobrem o worker
que falha alto.

**Worker ocioso.** Listar o catálogo exige um worker, e abrir o seletor sem
aplicar nada deixava esse worker vivo pela vida inteira do gráfico: um bundle
de 2 MB por aba, segurando a biblioteca, sem fazer nada. `releaseIdleWorker`
larga o worker sem aposentar o cliente, que é o que `dispose` faria.

**Rejeição cruzada.** A promessa é compartilhada entre gráficos, mas os
interessados pertencem a um cliente: um gráfico descartado no meio da rodada
rejeitava todos que tinham entrado nela. Só esse caso é retentado, e é por isso
que ele tem um erro próprio — retentar um tempo limite seriam dois tempos
limite, que foi exatamente o que o primeiro teste pegou.

### RV-012 — o release passou a ouvir no documento

Os dois ouvintes estavam no contêiner do gráfico. Um botão solto fora da área
de plotagem — sobre o livro, sobre a barra de desenho — nunca chegava, e o
press iniciado dentro ficava pendurado: o próximo press em qualquer lugar
casava com aquela posição velha, e um deslocamento menor que cinco pixels lia-se
como clique, largando âncora fantasma ou trocando a seleção.

O `mousedown` continua no gráfico; o `mouseup` ouve no documento. O handler já
recusava qualquer release fora do painel, então ouvir mais largo não custa
nada — e agora ele limpa o press e devolve a rolagem também quando o gesto
termina fora.

### RV-013 — bracketar o desenho de bandas

`renderBands` escrevia `fillStyle` e deixava escrito, ao contrário de `render`,
que preserva. Se isso alcança outra view de painel depende de como a biblioteca
bracketa as próprias passagens, o que não é garantia em que se apoiar. Um
`save` e um `restore` por pintura — não por banda — são duas operações de pilha
num caminho que já percorre todas as bandas.

### RV-017 — a semântica que faltava não era a que estava escrita

`aria-sort` pertence a um `columnheader`, e um `columnheader` pertence a uma
linha dentro de um grid — que esta lista não é: as linhas abaixo são botões
simples. Declarar o papel mesmo assim deixava o atributo órfão e descartado
pela tecnologia assistiva, então o estado de ordenação não chegava a ninguém.

Semântica de grid de verdade, no cabeçalho **e** nas linhas, é a correção que
vale — e meia correção seria pior que a atual. Até lá a informação foi para
onde é de fato lida: o nome acessível do botão diz por qual coluna se ordena e
em que sentido.

### RV-023 — o arquivo estava na pasta errada

`repaintPump.ts` é nosso, mas morava em `src/features/drawings/plugins/line-tools/`, que é
ignorada por inteiro para manter o código de terceiro byte a byte igual ao
upstream. A exceção negativa no ESLint não funciona dentro de um diretório
ignorado, e isso apontou o problema real: o arquivo não pertence ali. Movido
para o antigo `src/plugins/repaintPump.ts`, hoje em
`src/features/drawings/plugins/repaintPump.ts`. O lint achou uma linha longa
nele no primeiro passe.

### RV-019 — o que saiu e o que ficou

Saíram `normalizeDepthEvent` e `normalizeLevels` — cinquenta linhas da era
pré-F-013, alcançáveis só pelo próprio teste —, `belongsToMarket`, sem nenhum
chamador, e `undo()`, uma afordância pretendida e nunca ligada. Se ela for
desejada, o caminho é ligá-la a `Ctrl+Z`, não ressuscitar o método solto.

`MarketSessionPool.stopAll()` e `size` **ficaram**: são usados por teste, o que
os torna costura de teste e não código morto.

### RV-018 — avisar, nunca corrigir

Nada impedia salvar um candle que some contra o fundo escolhido. O aviso usa
`contrastRatio`, que já existia, e o limiar de 3:1 que a WCAG pede de objetos
gráficos — o mesmo que `readableOn` aplica à paleta de indicadores.

É aviso e não correção porque as miniaturas existem justamente para mostrar o
que o operador escolheu; ajustar a escolha em silêncio seria pior que o
problema.

### RV-021 — a fronteira estava ao contrário

A revisão registrou que unificar arrastaria um serviço para dentro do domínio.
É o inverso: aritmética de cor **é** domínio, e serviço importar domínio é a
direção normal, que o lint permite.

O que de fato exigia cuidado era o limiar sRGB diferente nos dois lugares,
`0.03928` e `0.04045`. Eles só discordam para canais entre 10,016 e 10,315, e
**nenhum inteiro de 8 bits cai nessa faixa** — as duas implementações sempre
concordaram, e unificar é aritmeticamente neutro. Um teste varre os 256 canais
comparando as duas fórmulas, para que isso não vire suposição depois.

### RV-014 — a medição disse para não mexer

O item supunha que trocar a view por cópia fosse ganho. Medido:

| Cenário | `subarray` | `slice` | Desperdício retido |
| --- | --- | --- | --- |
| 600 barras, 401 úteis | 0,59ms | 3,93ms (×6,7) | 1.592 B |
| 1.500 barras, 1.300 úteis | 0,25ms | 8,54ms (×34) | 1.600 B |
| 5.000 barras, 4.800 úteis | 0,17ms | 11,16ms (×64) | 1.600 B |

O desperdício **não cresce com o histórico**: ele é o aquecimento do indicador,
que é constante. Uma média de 200 períodos retém 3,2 KB a mais por plot, e oito
indicadores com quatro plots cada dão cerca de 100 KB — contra um bundle de
2 MB e um RSS de 128 MB. Pagar por isso uma cópia por plot por rodada, no
caminho que roda a cada tick, é trocar coisa barata por coisa cara.

Fica como está, e agora o número está no código para o próximo leitor não
refazer a pergunta.

### RV-015 — apagar o que nunca pintou

O bloco `html[data-theme="light"]` e o bloco `html[data-theme]` têm
especificidade idêntica — ambos valem (0,2,1) — e o genérico vem depois, então
vencia toda propriedade que os dois declaravam. Eram **26 declarações** que
nunca pintaram nada, **14 delas pedindo um valor diferente** do que a tela
mostrava.

Saíram 18 regras inteiras e as 26 declarações; nove regras claras
sobreviveram, as que declaram algo que o genérico não tem. São 122 linhas a
menos.

**A prova.** Estilo computado de 29 elementos em 22 seletores, sete
propriedades cada, capturado antes e depois: **203 propriedades idênticas, zero
diferenças** — no tema claro real (com `--bg #dfeaf0` aplicado pelo próprio
app), no escuro, e numa rodada de controle. Vale notar por que a captação
precisou de cuidado: o app escreve as variáveis do tema **inline no `<html>`**,
então trocar só o atributo `data-theme` muda a regra que casa mas não a paleta.
A comparação final foi feita com o tema trocado pelo botão do próprio app.

### RV-020 — o que saiu, e o que deliberadamente ficou

Saíram dois composables:

- **`useChartTheme`** (154 linhas) — paleta entra, opções de gráfico saem. Toca
  o gráfico numa troca de tema e em mais nada: nunca num tick, nunca num
  movimento de ponteiro.
- **`useIndicatorPanel`** (220 linhas) — o que está aplicado, o que está sendo
  configurado, o que o seletor mostra. Tudo muda quando o operador age, nunca
  quando um valor atualiza; os valores chegam à tela pelo canal imperativo, que
  este arquivo não toca.

`MarketChart.vue` foi de **1.188 para 981 linhas**. Os nomes são
desestruturados no topo do `<script setup>` de propósito: uma ref alcançada
através de um objeto não é desembrulhada no template, e escrever `.value` na
marcação seria a refatoração vazando para a parte do arquivo que não tinha
motivo para mudar — o template não mudou uma linha.

**O núcleo quente não foi tocado**: carga de histórico, callback de tempo real,
legenda e o caminho de desenho continuam onde estavam. Medido antes e depois,
no app com dados ao vivo:

| | Antes | Depois |
| --- | --- | --- |
| Cursor, 500 movimentos | mediana 7ms, p90 8ms, pior 18ms | mediana 7ms, p90 8ms, pior 11ms |
| Long tasks | 0 | 0 |
| Troca de período | 6.034ms | 6.030ms |

E a regressão funcional: seletor abre com 130 itens e fecha no `Esc`, três
ferramentas de desenho, seleção pela borda, troca de tema em ambos os sentidos,
zero exceções.

**Fontes de verdade:** variam por item; cada um aponta o arquivo no
[documento da revisão](../roadmap/revisao-de-codigo-2026-08.md).
