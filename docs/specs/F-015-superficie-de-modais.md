# F-015 — Superfície de modais destacada do fundo

**Status:** em desenvolvimento  
**Última revisão:** 2026-08-01  
**Relaciona-se a:** [F-009](./F-009-temas-configuracoes.md) e
[F-014](./F-014-indicadores-tecnicos.md)

## Caso de uso

Como operador, quero distinguir imediatamente onde um painel flutuante começa e
termina, para não confundir o conteúdo do diálogo com o gráfico atrás dele.

## Problema observado

Os modais usam `--panel`, a mesma superfície dos painéis fixos do workspace, e
`--chart-bg` é próximo dela. Sem um fundo escurecido atrás — removido de
propósito na F-014, para que o gráfico continue visível enquanto os parâmetros
mudam — a borda de 1px passou a ser o único limite entre o diálogo e o gráfico.
Em vários dos 30 presets isso quase desaparece.

Plataformas de referência resolvem por elevação de superfície: a TradingView
usa cinza-escuro sobre fundo preto, e não um contorno.

## Comportamento esperado

- Todo painel flutuante fica visivelmente acima do que está atrás dele, em
  qualquer preset e nas duas luminosidades.
- O destaque vem de superfície e sombra, não de cor saturada: o painel emoldura
  o conteúdo, não compete com ele.
- Um painel flutuante é distinguível de um painel fixo do workspace.
- Todos os modais seguem o mesmo padrão.

## Implementação e decisões de arquitetura

### Novos tokens derivados, não escritos por preset

Os 30 presets declaram apenas as cores-semente — accent, alta, baixa,
secundária e tinta — e a `ThemePalette` inteira é derivada em `darkPalette` e
`lightPalette`. Portanto a elevação entra como **dois tokens novos derivados**,
e os 30 presets a recebem sem edição:

| Token | Papel |
| --- | --- |
| `--overlay-surface` | fundo dos painéis flutuantes |
| `--overlay-border` | contorno, mais forte que `--border` |

**No tema escuro o painel clareia; no claro, escurece.** É a direção que
funciona nos dois casos: elevar significa aproximar-se da luz no escuro e
ganhar peso no claro. Aplicar o mesmo deslocamento nos dois produziria um
painel que some no claro — o erro que a F-012 já registrou ao converter cores.

A separação é reforçada por sombra projetada, que não depende de contraste de
cor e por isso sobrevive a qualquer preset.

### Onde se aplica

Seletor de indicadores, configurações de indicador, janela de configurações
gerais, editor de temas e a janela de busca de símbolos. Painéis fixos do
workspace continuam em `--panel`: a distinção entre fixo e flutuante é
justamente o que se quer preservar.

**Fontes de verdade:** `src/services/themeCatalog.ts` (derivação),
`src/services/theme.ts` (publicação como custom properties),
`src/styles/tokens.css`.

**Fora de escopo:** revisão do espaçamento e da tipografia dos painéis; aqui
trata-se apenas de superfície, contorno e sombra.

## Testes

- `themeCatalog.test.ts`: os dois tokens existem em todos os presets, nas duas
  luminosidades, e o contraste entre `overlay-surface` e `panel` supera um
  limiar mínimo em cada um deles.
- Validação manual: percorrer presets em claro e escuro com um modal aberto.

## Critérios de aceite

- [ ] `--overlay-surface` e `--overlay-border` existem nos 30 presets, em ambas
      as luminosidades.
- [ ] O contraste entre a superfície do modal e `--panel` supera o limiar em
      todos eles, medido em teste.
- [ ] Os modais listados usam os novos tokens.
- [ ] Nenhum painel fixo do workspace muda de aparência.

## Evolução

Os mesmos tokens servem a menus de contexto e tooltips, quando existirem.
