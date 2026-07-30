# F-009 — Temas e painel de configurações

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero escolher aparência confortável para longas sessões e criar
temas próprios sem interromper gráfico, livro ou streams.

## Comportamento esperado

- Há 30 presets, cada um com variantes clara e escura.
- Candles, volume, fundo, grade, crosshair, watermark e superfícies usam cores coerentes.
- É possível criar, aplicar e remover temas locais com cor e transparência por modo.
- O painel é subjanela webview arrastável/redimensionável e persistida, sem blur/backdrop.

## Implementação e decisões de arquitetura

- `themeCatalog.ts` contém presets e palettes. `theme.ts` persiste modo,
  preset e até 12 temas personalizados no `localStorage`.
- A raiz recebe `data-theme`, `data-theme-preset` e CSS variables semânticas.
- `MarketChart.vue` usa `chart.applyOptions()` e `series.applyOptions()`;
  não recria chart nem reinicia streams. Volume preserva intervalo lógico.
- `GeneralSettingsPanel.vue` usa `translate3d` coalescido no arraste. Resize
  aplica conteúdo ao soltar, após contorno leve.
- `ThemePresetPreview.vue` usa a palette do próprio tema na miniatura.

Fontes de verdade: `src/services/theme*.ts` e
`src/components/settings/`.

## Testes

- `theme.test.ts` cobre persistência, seleção e atributos de raiz.
- `themeCatalog.test.ts` cobre presets e validade de definições customizadas.
- Arraste, resize e contraste são validações manuais.

## Critérios de aceite

- [ ] Alternar claro/escuro mantém preset e troca variante correta.
- [ ] Escolher preset recolore gráfico sem recriar ou pausar streams.
- [ ] Tema personalizado persiste após reiniciar.
- [ ] Transparência não prejudica legibilidade de texto/preço.
- [ ] Abrir, mover ou redimensionar configurações não gera lag em gráfico/livro.
- [ ] Geometria é restaurada dentro dos limites da tela.

## Evolução

- Guardar credenciais de providers em armazenamento seguro, nunca `localStorage`.
- Adicionar importação/exportação segura de temas.
