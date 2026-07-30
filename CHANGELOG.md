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

## Convenção de atualização

- Use **Added**, **Changed**, **Fixed**, **Deprecated**, **Removed** ou
  **Security**.
- Registre uma entrada em toda entrega que altere comportamento percebido.
- Vincule a spec, issue ou ADR no texto quando isso facilitar rastreabilidade.
