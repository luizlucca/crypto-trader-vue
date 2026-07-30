# Changelog

O formato segue a ideia de Keep a Changelog. Entradas descrevem comportamento
observável; detalhes de implementação permanecem nas specs e ADRs.

## [Unreleased]

### Added

- Runtime desktop Electron com janelas isoladas, IPC tipado e processos de dados.
- Provider Binance modular com mercados Spot e Futures.
- Candles, livro de ordens realtime, catálogo com cache e busca isolada.
- Gráfico Lightweight Charts com Rounded Candles, watermark e histórico paginado.
- Abas independentes, favoritos, temas, configurações redimensionáveis e ícones.
- Base documental: specs, ADRs, roadmap, performance, testes, bugs e DoD.

### Changed

- A janela principal inicia em tela cheia.
- Gráfico abre nas últimas 20 barras com espaço à direita e carrega páginas
  anteriores de 400 candles ao navegar para o limite esquerdo.

### Fixed

- Indicador da aba agora representa o estado do livro e recupera ao receber
  snapshots válidos, sem esconder falhas exclusivas de candles.
- Percentuais e barra de compra/venda agora acompanham a liquidez dos 10 níveis
  visíveis do livro de ordens.

## Convenção de atualização

- Use **Added**, **Changed**, **Fixed**, **Deprecated**, **Removed** ou
  **Security**.
- Registre uma entrada em toda entrega que altere comportamento percebido.
- Vincule a spec, issue ou ADR no texto quando isso facilitar rastreabilidade.
