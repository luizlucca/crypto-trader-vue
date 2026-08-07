# CryptoPro — instruções para agentes

Plataforma desktop de trade de criptoativos: Electron 43, Vue 3, TypeScript,
RxJS e Lightweight Charts v5. Dados de mercado chegam em tempo real e alimentam
decisões de compra e venda. **Latência de render é requisito funcional, não
polimento.**

## Verificação

Nenhuma mudança está pronta antes destes quatro passarem. Rode todos:

```bash
npm run typecheck && npx eslint . && npx vitest run && npm run build
```

O lint tem hoje ~80 *warnings* de `max-len` tolerados e **zero erros**. Não
gaste a sessão zerando warnings; não introduza erros.

## Convenções

O estilo é imposto por `eslint.config.js` e não é matéria de opinião: sem ponto
e vírgula, aspas simples, indentação 2 com `offsetTernaryExpressions`, vírgula
final em multilinha, chaves `1tbs`, parênteses em arrow de argumento único,
linha de 80 colunas. Rode `npx eslint . --fix` em vez de ajustar à mão.

Documentação em `docs/` é escrita em português; comentários de código, em
inglês. Comentário explica **por que**, não o que — o código já diz o que faz.

## Fronteiras de módulo

Impostas por lint, não por convenção (`eslint.config.js`):

- `electron/` resolve somente `@shared/`; aliases do renderer são indisponíveis.
- `shared/` é neutro: sem `vue`, sem `electron`.
- `src/shared/` não depende de app, plataforma ou features.
- Módulos `domain/` do renderer não importam Vue nem Electron.
- `lightweight-charts-indicators` só pode ser importado em `src/features/indicators/workers/`.
  Fora dali, fale pelo protocolo em `src/features/indicators/domain/indicatorProtocol.ts`.

Contexto completo em [ADR-0004](docs/adr/0004-camadas-e-fronteiras-de-modulo.md)
e [ADR-0005](docs/adr/0005-pacotes-por-feature-no-renderer.md).

## Complexidade que parece acidental e não é

Esta é a seção que não existe em nenhum outro documento. Cada item abaixo já
foi confundido com excesso, ou existe porque alguém confundiu. **Não simplifique
nada daqui sem instrução explícita.**

| Onde | Por que existe |
| --- | --- |
| `src/shared/services/imperativeChannel.ts` e seus consumidores (`RealtimePriceText`, `StreamLatencyText`, `IndicatorReadout`) | Escrita direta no DOM, fora do grafo reativo. O livro de ordens já disputou thread com o gráfico neste projeto. Converter para estado reativo destrói a propriedade central do app ([ADR-0003](docs/adr/0003-renderizacao-imperativa-do-grafico.md)) |
| `useCandleHistoryCache` e `@indicators/services/indicatorLayout.ts` | Não reativos de propósito, e dizem isso no cabeçalho |
| `populatedRevision` em `useChartIndicators` | Um contador existe justamente para **não** tornar um `Set` reativo no caminho de desenho |
| `lastValues` em `useChartIndicators` | Evita `series.data()`, que copiaria o array inteiro num caminho que roda por pixel de cursor |
| `readPendingCandle()` em `MarketChart.vue` | Derrota o estreitamento de fluxo do TypeScript. Já foi apagada como "código morto" e quebrou o typecheck |
| `chained` em `providers/binance/orderBookSync.ts` | O stream de Futures sempre envia `pu`, inclusive no primeiro evento. Tratar a presença dele como "não é o primeiro" faz o livro nunca sincronizar |
| `generation`, `roundId` e `instanceRevision` em `@indicators/services/indicators.ts` | Cada peça saiu de um bug real de indicador que parava de desenhar. Parece cerimônia; é a máquina que garante determinismo |
| `previous` retido no worker de indicadores | É o que faz um tick custar `update()` em poucos pontos em vez de `setData()` na série inteira |
| `try/catch` em `applyPatches` e no laço por instância do worker | Isolamento de erro é o objetivo: uma instância que falha não pode derrubar as outras nem a mensagem que libera a próxima rodada |
| `IndicatorDrawingsPrimitive` | Desenha no mesmo passe de pintura dos candles: sem alocação por frame, recorte antes da conversão de coordenadas, largura de texto medida uma vez por conjunto |
| `logicalForTime` em `@drawings/domain/chartDrawings.ts` | `timeScale().timeToCoordinate()` parece o caminho óbvio e está errado: resolve só horários que são exatamente uma barra, e um desenho traçado no 1h some ao mudar para 4h. A interpolação existe por causa disso |
| `src/features/drawings/plugins/line-tools/` | Código de terceiro mantido byte a byte igual ao upstream, fora do ESLint, para que atualizar seja um `diff`. Não reformate ([procedência](src/features/drawings/plugins/line-tools/README.md)) |
| `RepaintPump` e o `requestAnimationFrame` dentro dele | As ferramentas do upstream não implementam `attached()`, então ninguém pede repintura e a forma só aparecia segundos depois. O adiamento não é cerimônia: pedir o quadro de dentro do handler de crosshair reentra na atualização em curso |
| A prévia da tendência nascer no clique, não no movimento | Anexar primitiva muta o modelo do gráfico. Fazer isso por pixel de ponteiro invalida o gráfico inteiro por pixel |
| A prévia nascer com uma barra de extensão em vez de dois pontos iguais | Segmento de comprimento zero dá faixa degenerada em `autoscaleInfo()` e **o gráfico para de entregar cliques** — a linha nunca podia ser concluída |
| As âncoras virem do `mouseup` do contêiner, e não de `subscribeClick` | O gráfico engole **qualquer** segundo clique dentro de 500ms do primeiro, à distância que for: os dois entram no ramo de duplo-clique, que não dispara nada por estarem longe. Toda ferramenta de dois ou três pontos perdia o ponto colocado depressa |
| `timeForLogical` em `@drawings/domain/chartDrawings.ts` | `param.time` só existe quando o clique cai exatamente sobre uma barra. Sem a inversa, clicar entre duas barras — ou na margem vazia à frente do preço — não fazia nada |
| `handleScroll: false` durante o arrasto de um desenho | O gráfico rola no mesmo gesto. É devolvido no `mouseup`, nunca na próxima seleção: deixar a rolagem desligada congela o gráfico se o arrasto terminar fora da área de plotagem |
| `anchorEditAt` derivar a alça da geometria em vez de tabelar os índices | As ferramentas numeram as alças por **canto**, não por âncora: o retângulo devolve quatro cantos tendo duas âncoras, e o `date-range` repete índices. A tabela seriam quinze casos presos à numeração do upstream |

## Caminho quente

Exigem instrução explícita antes de qualquer refatoração: `MarketChart.vue`,
`useChartIndicators.ts`, `@indicators/services/indicators.ts`,
`src/features/indicators/workers/`,
`orderBookSync.ts` e o componente do livro de ordens.

Uma mudança nesses arquivos precisa de evidência, não de argumento: meça long
tasks e a proporção de patches completos contra patches de cauda com oito
indicadores e o livro ativo, como descrito em
[F-014](docs/specs/F-014-indicadores-tecnicos.md).

## Onde está o resto

- [docs/architecture.md](docs/architecture.md) — processos, IPC, isolamento
- [docs/adr/](docs/adr/) — cinco decisões e o porquê de cada uma
- [docs/specs/](docs/specs/) — uma spec por feature, com critérios de aceite

Toda alteração de produto atualiza a spec afetada no mesmo commit.
