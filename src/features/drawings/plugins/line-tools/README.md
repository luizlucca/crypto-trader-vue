# lineTools — primitivas com procedência externa e adaptações locais

Primitivas de desenho do plugin `line-tools`, copiadas em **2026-08-03**.

| | |
| --- | --- |
| Origem | [`crypt0inf0/lightweight-charts`](https://github.com/crypt0inf0/lightweight-charts) |
| Caminho | `plugin-examples/src/plugins/line-tools/tools` |
| Commit | `3a5685cc6f3c` — *fix bugs and added new tools*, 2025-12-10 |
| Versão da lib no fork | 5.0.9 (o app usa 5.2.0 — mesma major, API de primitivas compatível) |
| Licença | Apache 2.0, do repositório Lightweight Charts |

## O que foi copiado, e o que não foi

Só os **primitivos**: cada ferramenta é um `ISeriesPrimitive<Time>` autocontido
que depende apenas de `base-types.ts`, `geometry.ts`, `lightweight-charts` e
`fancy-canvas`.

Em 2026-08-05, `cross-line.ts` e `date-price-range.ts` foram acrescentados a
partir do mesmo commit. O catálogo do app passou de quinze para dezessete
ferramentas sem incorporar o manager ou a interface do exemplo.

Depois da importação, parte das primitives foi simplificada localmente:
`CrossLine`, as medições e as posições adotam o padrão TypeScript do app,
encapsulam estado e reutilizam pane view, renderer e coordenadas entre
repaints. `SignedRangeDrawing` reúne régua e faixas; `PositionDrawing` reúne
long e short e acrescenta métricas de valor/percentual. Os wrappers preservam
os nomes públicos usados pelo manager. A procedência e o contrato visual
continuam rastreáveis, mas esses arquivos não são cópias byte a byte.

O `LineToolManager` do upstream (2.027 linhas) **não foi copiado**. Ele traz
junto uma barra flutuante própria, controles de gráfico e um CSS de 13 KB —
uma segunda interface de desenho, que competiria com o `DrawingToolbar.vue` e
com os tokens de tema deste app. O gerente daqui é
`src/features/drawings/composables/useChartDrawings.ts`, escrito para este projeto: liga-se à
barra existente e persiste por aba, como os indicadores.

## Regras para atualizar

Não se deve assumir igualdade byte a byte com o upstream. Antes de atualizar,
compare cada primitive com o commit de origem e preserve deliberadamente as
adaptações locais de performance, hit test, métricas e opções. Arquivos que
continuam próximos da referência devem permanecer fáceis de comparar.

Uma adaptação histórica ainda relevante:

- `horizontal-line.ts`: o import `'./utils'` virou `'./base-types'`. No
  upstream esse arquivo vive em `tools/horizontal-line/` e importa um
  `utils.ts` que é **cópia byte a byte** de `tools/base-types.ts`; manter as
  duas seria duplicar 219 linhas.

Os arquivos herdados permanecem fora do ESLint para conservar a comparação.
Novos módulos locais (`signed-range.ts`, `position-drawing.ts` e os wrappers)
seguem o padrão de legibilidade do app mesmo dentro desse diretório.

Para atualizar:

```bash
BASE=https://raw.githubusercontent.com/crypt0inf0/lightweight-charts/master/plugin-examples/src/plugins/line-tools/tools
curl -sL "$BASE/trend-line.ts" | diff - src/features/drawings/plugins/line-tools/trend-line.ts
```
