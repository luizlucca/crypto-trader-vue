# lineTools — código de terceiro, copiado

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

O `LineToolManager` do upstream (2.027 linhas) **não foi copiado**. Ele traz
junto uma barra flutuante própria, controles de gráfico e um CSS de 13 KB —
uma segunda interface de desenho, que competiria com o `DrawingToolbar.vue` e
com os tokens de tema deste app. O gerente daqui é
`src/composables/useChartDrawings.ts`, escrito para este projeto: liga-se à
barra existente e persiste por aba, como os indicadores.

## Regras para mexer aqui

**Estes arquivos são mantidos byte a byte iguais ao upstream**, para que
atualizar seja um `diff` e não uma arqueologia. A única alteração até hoje:

- `horizontal-line.ts`: o import `'./utils'` virou `'./base-types'`. No
  upstream esse arquivo vive em `tools/horizontal-line/` e importa um
  `utils.ts` que é **cópia byte a byte** de `tools/base-types.ts`; manter as
  duas seria duplicar 219 linhas.

Estão fora do ESLint por isso: o estilo é o do upstream — ponto e vírgula,
indentação de 4 espaços, `any` — e reformatá-los inviabilizaria o `diff`.

Para atualizar:

```bash
BASE=https://raw.githubusercontent.com/crypt0inf0/lightweight-charts/master/plugin-examples/src/plugins/line-tools/tools
curl -sL "$BASE/trend-line.ts" | diff - src/plugins/lineTools/trend-line.ts
```
