# F-008 — Layout redimensionável do workspace

**Status:** implementada  
**Última revisão:** 2026-08-03

## Caso de uso

Como trader, quero aumentar, reduzir ou **ocultar** os painéis laterais para
priorizar lista de ativos, livro ou gráfico, sem recriar canvas ou suspender
dados realtime.

## Comportamento esperado

- O divisor entre painel Mercado e workspace pode ser arrastado.
- Teclado oferece setas, `Home`, `End` e `Shift` para ajuste acessível.
- Duplo clique restaura largura padrão.
- **Mercado e Livro de ordens podem ser ocultados e reexibidos.** Ocultar é um
  botão no cabeçalho do próprio painel; reexibir aparece na barra do gráfico,
  na borda que o painel deixou livre. `Ctrl+B` e `Ctrl+Shift+B` fazem os dois.
  A largura liberada vai para o gráfico.
- Preferência sobrevive à reinicialização e respeita espaço disponível.

## Implementação e decisões de arquitetura

- `PanelResizeHandle.vue` publica no máximo uma largura por
  `requestAnimationFrame` durante arraste e grava no `localStorage` no final.
- A largura é custom property (`--market-sidebar-width`) da grade, não estado
  de candles ou livro.
- `autoSize` do Lightweight Charts observa o container redimensionado; não há
  recriação de instância nem nova consulta de histórico.
- Limites mínimo, padrão e máximo protegem o espaço de ticket, livro e chart.

### Ocultar colapsa a faixa, não remove a coluna

A grade tem seis colunas e **cada filho é posicionado por número de coluna
explícito**. Remover uma coluna renumeraria todos os outros painéis, então um
painel oculto tem sua faixa colapsada para `0px` por custom property
(`--market-track`, `--market-handle-track`, `--order-book-track`), enquanto o
componente sai do DOM por `v-if`.

Sair do DOM é o que importa para performance: o livro de ordens escreve no DOM
a cada frame, e oculto ele para de escrever. O stream continua conectado, então
reexibir é instantâneo e não exige nova sincronização de snapshot.

### Esconder onde o painel está, reabrir onde o espaço ficou

São dois controles distintos, não um alternador. **Ocultar** vive no cabeçalho
do painel, discreto, porque é uma saída — não uma função a anunciar.
**Reexibir** só existe enquanto o painel está fora, e aparece na barra do
gráfico exatamente na borda que ficou livre: o Mercado à esquerda do `+`, o
Livro à direita da tela cheia. O olho procura o painel onde ele estava, e é lá
que encontra a forma de trazê-lo de volta.

Um alternador fixo numa barra lateral foi a primeira tentativa e não funcionou:
o ícone ficava longe do vazio que ele preenchia.

### O cabeçalho do livro não tinha espaço — e já não tinha antes

Título (114px) mais controles (130px) pediam 244px num painel de 232px, então o
excesso já vazava pela borda antes deste trabalho. Com o botão de ocultar
passaria a 270px.

O título é a única parte que pode ceder sem eliminar um alvo de clique: passou
a `LIVRO`, com o nome completo no tooltip, e o cabeçalho agora fecha em 231px
com folga. A alternativa seria alargar a coluna do livro, o que iria contra o
motivo de existir desta feature.

Fontes de verdade: `src/components/layout/PanelResizeHandle.vue`,
`src/services/workspacePanels.ts`, `src/components/chart/ChartToolbar.vue`,
`src/components/workspace/TradingWorkspace.vue` e `src/styles/layout.css`.

## Testes

- Acessibilidade e persistência são verificações manuais no Electron.
- `npm run typecheck` cobre props e eventos do componente.

## Critérios de aceite

- [ ] Arrastar move divisão fluida e desloca o gráfico.
- [ ] Candle e livro continuam atualizando durante o arraste.
- [ ] Gráfico redimensiona sem recriar nem perder viewport.
- [ ] Setas e `Shift+setas` funcionam no divisor focado.
- [ ] Reabrir app recupera largura válida.
- [x] Ocultar um painel entrega a largura ao gráfico: medido em 766px com os
      dois visíveis, 1022px sem o Mercado, 1254px sem os dois.
- [x] O estado de cada painel sobrevive ao fechamento do app.
- [x] Ocultar está no cabeçalho do painel; reexibir, na borda livre da barra do
      gráfico. Os dois botões nunca coexistem para o mesmo painel.
- [x] O cabeçalho do livro cabe em 231px, sem truncar e sem vazar.

## Evolução

- Permitir presets de layout e outros divisores apenas com igual isolamento de
  renderização.
- Ocultar também Boleta e Posições fecharia o conjunto; a mecânica de faixa
  colapsada já serve, falta só decidir os atalhos.
