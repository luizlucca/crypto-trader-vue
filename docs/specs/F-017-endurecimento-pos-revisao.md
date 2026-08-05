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
- [ ] **RV-009** · Rolar para trás não é desabilitado em definitivo por uma
      falha. Medido antes: quantas vezes ocorre página cheia com deduplicação
      zerada, em sessão real.
- [ ] **RV-010** · Uma falha transitória do provedor não descarta uma página
      inteira de candles nem derruba a carga.
- [ ] **RV-011** · Abrir o seletor de indicadores e não aplicar nada não deixa
      Worker ocioso; o pedido de catálogo tem tempo limite; e um cliente
      descartado não propaga sua falha aos demais.

### Onda 3 — correção contida, risco baixo

- [ ] **RV-012** · Soltar o botão fora da área do gráfico não deixa o press
      anterior pendurado.
- [ ] **RV-013** · O desenho de bandas preserva o estado do contexto de canvas.
- [ ] **RV-014** · O worker de indicadores não retém buffer além do que usa.

### Onda 4 — qualidade, acessibilidade e dívida

- [ ] **RV-015** · O tema claro não tem regra morta: as sobrescritas foram
      removidas ou revividas, por decisão explícita.
- [ ] **RV-016** · A tira de abas navega por setas e declara `tabpanel`.
- [ ] **RV-017** · Os cabeçalhos de ordenação têm semântica de grid completa.
- [ ] **RV-018** · O editor de temas avisa quando uma cor escolhida fica
      ilegível contra o fundo escolhido.
- [ ] **RV-019** · O código morto identificado foi removido, cada remoção
      conferida contra o typecheck.
- [ ] **RV-020** · `MarketChart.vue` tem as três responsabilidades separáveis
      extraídas, sem mudar a forma do caminho quente.
- [ ] **RV-021** · A conversão de cor existe num lugar só.
- [ ] **RV-022** · A F-003 descreve o livro como ele é hoje.
- [ ] **RV-023** · `repaintPump.ts` é lintado.
- [ ] **RV-024** · A boleta e o painel de posições declaram que são andaimes.
- [ ] **RV-025** · O livro alinha os vazios acima das vendas quando chegam
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

**Fontes de verdade:** variam por item; cada um aponta o arquivo no
[documento da revisão](../roadmap/revisao-de-codigo-2026-08.md).
