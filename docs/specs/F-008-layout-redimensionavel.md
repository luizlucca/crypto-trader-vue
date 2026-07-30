# F-008 — Layout redimensionável do workspace

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero aumentar ou reduzir o painel Mercado para priorizar lista de
ativos ou gráfico, sem recriar canvas ou suspender dados realtime.

## Comportamento esperado

- O divisor entre painel Mercado e workspace pode ser arrastado.
- Teclado oferece setas, `Home`, `End` e `Shift` para ajuste acessível.
- Duplo clique restaura largura padrão.
- Preferência sobrevive à reinicialização e respeita espaço disponível.

## Implementação e decisões de arquitetura

- `PanelResizeHandle.vue` publica no máximo uma largura por
  `requestAnimationFrame` durante arraste e grava no `localStorage` no final.
- A largura é custom property (`--market-sidebar-width`) da grade, não estado
  de candles ou livro.
- `autoSize` do Lightweight Charts observa o container redimensionado; não há
  recriação de instância nem nova consulta de histórico.
- Limites mínimo, padrão e máximo protegem o espaço de ticket, livro e chart.

Fontes de verdade: `frontend/src/components/layout/PanelResizeHandle.vue`,
`frontend/src/components/workspace/TradingWorkspace.vue` e
`frontend/src/style.css`.

## Testes

- Acessibilidade e persistência são verificações manuais no Electron.
- `npm run typecheck` cobre props e eventos do componente.

## Critérios de aceite

- [ ] Arrastar move divisão fluida e desloca o gráfico.
- [ ] Candle e livro continuam atualizando durante o arraste.
- [ ] Gráfico redimensiona sem recriar nem perder viewport.
- [ ] Setas e `Shift+setas` funcionam no divisor focado.
- [ ] Reabrir app recupera largura válida.

## Evolução

- Permitir presets de layout e outros divisores apenas com igual isolamento de renderização.
