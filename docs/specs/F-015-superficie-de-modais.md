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
Em vários dos presets isso quase desaparece.

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

Os presets declaram apenas as cores-semente — accent, alta, baixa,
secundária e tinta — e a `ThemePalette` inteira é derivada em `darkPalette` e
`lightPalette`. Portanto a elevação entra como **dois tokens novos derivados**,
e todos os presets a recebem sem edição:

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

### A elevação vale para dentro do painel, não só para a borda

Aplicar `--overlay-surface` na raiz do painel não bastou. As áreas internas —
faixa de cabeçalho, coluna de navegação, blocos recuados — continuavam lendo os
tokens do workspace, a mesma família do gráfico atrás delas. Metade do diálogo
estava elevada e metade não, e os três painéis flutuantes discordavam entre si
sobre qual metade.

A correção é uma religação de tokens no escopo do painel: dentro de um painel
flutuante, `--panel`, `--panel-raised`, `--panel-muted`, `--header-bg`,
`--navigation-bg` e as bordas passam a ser derivados de `--overlay-surface`.
Toda regra já escrita contra as superfícies comuns passa a cair na família
elevada sem ser reescrita.

Cada degrau interno é misturado em direção a `--overlay-border`, que pertence à
mesma família e fica entre a superfície e a tinta. A direção fica correta nas
duas luminosidades — clareia no escuro, adensa no claro — que é a mesma regra
que os tokens da F-015 já seguem.

A janela de busca de símbolos nunca tinha seguido a spec: usava
`--control-bg` e cinco cores fixas em hexadecimal. Passou para os mesmos
tokens, e o arquivo ficou sem nenhum hex literal.

### Onde se aplica

Seletor de indicadores, configurações de indicador, janela de configurações
gerais, editor de temas e a janela de busca de símbolos — os quatro seletores
estão listados em um único bloco em `tokens.css`. Painéis fixos do
workspace continuam em `--panel`: a distinção entre fixo e flutuante é
justamente o que se quer preservar.

**Fontes de verdade:** `src/features/settings/services/themeCatalog.ts` (derivação),
`src/features/settings/services/theme.ts` (publicação como custom properties),
`src/app/styles/tokens.css`.

**Fora de escopo:** revisão do espaçamento e da tipografia dos painéis; aqui
trata-se apenas de superfície, contorno e sombra.

## Testes

- `themeCatalog.test.ts`: os dois tokens existem em todos os presets, nas duas
  luminosidades, e o contraste entre `overlay-surface` e `panel` supera um
  limiar mínimo em cada um deles.
- Validação manual: percorrer presets em claro e escuro com um modal aberto.

## Critérios de aceite

- [ ] `--overlay-surface` e `--overlay-border` existem em todos os presets, em ambas
      as luminosidades.
- [ ] O contraste entre a superfície do modal e `--panel` supera o limiar em
      todos eles, medido em teste.
- [x] Os modais listados usam os novos tokens, inclusive nas áreas internas.
- [x] Os painéis flutuantes têm a mesma superfície entre si, em qualquer preset.
- [ ] Nenhum painel fixo do workspace muda de aparência.

## Evolução

Os mesmos tokens servem a menus de contexto e tooltips, quando existirem.
