# F-013 — Profundidade real do livro de ordens

**Status:** implementada
**Última revisão:** 2026-07-31
**Relaciona-se a:** [F-003](./F-003-streams-realtime.md),
[F-011](./F-011-agregacao-livro-ordens.md) e ao item DA-002 do
[roadmap](../roadmap/README.md)

## Caso de uso

Como operador, quero que o livro de ordens mostre a mesma quantidade de linhas
qualquer que seja a agregação escolhida, para comparar a liquidez em diferentes
granularidades sem perder contexto de mercado.

## Problema observado

O seletor de agregação começa em `0,1` e preenche as 20 linhas (10 de compra e
10 de venda). Ao mudar para `1,0`, restam cerca de 8 linhas, e cada aumento de
granularidade reduz mais.

**Causa:** a origem tem apenas 20 níveis. O provider assina
`<symbol>@depth20@100ms`, o *partial book depth stream* da Binance, que aceita
somente 5, 10 ou 20 níveis — não existe variante com mais. Agregar 20 níveis de
`0,1` em faixas de `1,0` produz no máximo ~2 unidades de preço de cobertura, ou
seja, poucos baldes. A agregação está correta; falta profundidade na fonte.

## Comportamento esperado

- O livro preenche todas as linhas visíveis em qualquer nível de agregação,
  enquanto houver liquidez no mercado para isso.
- Trocar a agregação não reinicia a conexão nem produz livro vazio.
- Uma perda de sequência no stream é detectada e se recupera sozinha, sem
  exibir um livro corrompido.
- O custo de IPC por frame não cresce com a profundidade mantida.

## Implementação e decisões de arquitetura

### Origem: snapshot REST + diff stream

O partial stream é substituído pelo *diff depth stream* (`<symbol>@depth@100ms`)
combinado com um snapshot REST, que é a forma suportada de manter um livro local
completo. O processo utilitário passa a manter o livro inteiro em memória e a
aplicar cada diferença.

**Os dois mercados usam algoritmos diferentes** e cada um precisa da sua
implementação:

| | Spot | Futures |
| --- | --- | --- |
| Snapshot | `/api/v3/depth`, limite 5000 | `/fapi/v1/depth`, limite 1000 |
| Descarte inicial | `u <= lastUpdateId` | `u < lastUpdateId` |
| Primeiro evento válido | `U <= lastUpdateId + 1` | `U <= lastUpdateId` e `u >= lastUpdateId` |
| Continuidade | `U` == `u` anterior + 1 | `pu` == `u` anterior |

Em ambos, a quantidade recebida é absoluta e `0` remove o nível. Eventos que
chegam antes do snapshot são bufferizados. Uma quebra de continuidade descarta o
livro e refaz o snapshot, em vez de seguir com dados furados — um livro
silenciosamente errado é pior do que um livro que reconecta.

### A agregação passa para o processo utilitário

Manter o livro completo e enviá-lo pelo IPC a cada frame anularia o isolamento
descrito no [ADR-0002](../adr/0002-isolamento-de-dados-realtime.md): são
milhares de níveis contra os 40 que a interface mostra.

Portanto o renderer informa o passo de agregação, e o processo utilitário envia
apenas as linhas já agregadas. O volume por frame passa a ser **constante** e
independente da profundidade mantida — inclusive menor do que hoje, porque
`total` e ordenação já vêm prontos.

Como consequência, a agregação deixa de ser código do renderer e vai para
`shared/domain/orderBook.ts`, onde os dois processos podem usá-la e ela
permanece testável isoladamente ([ADR-0004](../adr/0004-camadas-e-fronteiras-de-modulo.md)).

### Contrato

`start-stream` passa a carregar o passo inicial, e um comando novo
`set-order-book-aggregation` troca o passo sem reiniciar a sessão — o socket, o
livro em memória e a instância Vue do livro continuam vivos, como já acontece
com a troca de período em relação aos candles.

**Fontes de verdade:** `electron/utility/market-data/providers/binance/orderBookSync.ts`,
`shared/domain/orderBook.ts`, `shared/contracts/desktop.ts`,
`electron/utility/market-data/session.ts`,
`src/components/orderbook/OrderBook.vue`.

**Fora de escopo:** exibir profundidade acumulada em gráfico, mapa de calor de
liquidez e detecção de icebergs. O livro completo em memória habilita esses
recursos, mas eles têm spec própria.

## Testes

- `shared/domain/orderBook.test.ts`: agregação, contagem de linhas por passo e
  acumulado.
- `orderBookSync.test.ts`: aplicação de diffs, remoção por quantidade zero,
  descarte de eventos antigos, aceitação do primeiro evento em cada mercado e
  detecção de quebra de sequência.
- Validação manual: percorrer todos os passos do seletor em Spot e Futures e
  confirmar que as linhas permanecem preenchidas.

## Critérios de aceite

- [x] Todos os passos de agregação preenchem as 20 linhas em BTCUSDT.
      Verificado com dados ao vivo: Futures (0,1 / 1 / 10 / 100) e Spot
      (0,01 / 0,1 / 1 / 10) mantêm 10 linhas por lado.
- [x] Trocar o passo não reinicia o WebSocket nem esvazia o livro.
- [x] Uma quebra de sequência refaz o snapshot automaticamente.
- [x] O payload de IPC por frame não cresce com a profundidade mantida.
- [x] Spot e Futures usam cada um a sua regra de sincronização.

## Armadilha encontrada na implementação

O stream de Futures envia `pu` em **todos** os eventos, inclusive no primeiro
após o snapshot — e esse `pu` não guarda relação com o `lastUpdateId` do
snapshot. Tratar a presença de `pu` como sinal de "não é o primeiro evento"
fazia a validação de continuidade reprovar o primeiro evento sempre, e o livro
nunca sincronizava.

A distinção correta é de estado, não de payload: o livro registra se já aplicou
algum evento desde o snapshot. Enquanto não aplicou, vale a regra do primeiro
evento; depois dela, vale o encadeamento. O teste
`aceita o primeiro evento mesmo trazendo pu de outra sequência` cobre esse caso.

## Evolução

O livro completo em memória é pré-requisito para profundidade acumulada,
detecção de paredes de liquidez e para os itens DA-003 e DA-004 do roadmap.
