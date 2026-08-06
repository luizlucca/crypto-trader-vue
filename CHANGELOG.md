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

- Contratos de IPC e tipos de domínio movidos para `shared/`, com a fronteira
  entre renderer e processos desktop verificada por lint ([ADR-0004] e [F-012]).
- A latência do livro de ordens deixou de passar pelo estado reativo da aba:
  amostrá-la não agenda mais render do componente que hospeda o gráfico.
- Publicação de preço em tempo real passou a ser indexada por instrumento.
- O painel de mercados seleciona as linhas visíveis sem ordenar o catálogo
  inteiro.
- As cores da interface passaram a derivar dos tokens de tema: trocar de preset
  agora recolore livro, abas, painéis e rótulos, e não apenas o gráfico.
- Estilos divididos em `src/app/styles/` por domínio.
- Renderer reorganizado em pacotes verticais por feature, com aliases próprios
  indisponíveis aos processos Electron ([ADR-0005] e [F-012]).

- Aliases `@shared/`, `@/` e aliases por feature no lugar de caminhos relativos
  profundos.
- ESLint adicionado (`npm run lint`), descrevendo o estilo já praticado.
- A janela principal inicia em tela cheia.
- Gráfico abre nas últimas 20 barras com espaço à direita e carrega páginas
  anteriores de 400 candles ao navegar para o limite esquerdo.

### Fixed

- O livro de ordens perdia linhas ao aumentar a agregação: a origem entregava
  apenas 20 níveis. O processo utilitário passou a manter o livro completo por
  snapshot REST + diff stream e agora preenche todas as linhas em qualquer
  granularidade ([F-013]).
- No tema claro, "Nenhum favorito neste mercado" ficava ilegível.
- Indicador da aba agora representa o estado do livro e recupera ao receber
  snapshots válidos, sem esconder falhas exclusivas de candles.
- Percentuais e barra de compra/venda agora acompanham a liquidez dos 10 níveis
  visíveis do livro de ordens.

[ADR-0004]: docs/adr/0004-camadas-e-fronteiras-de-modulo.md
[ADR-0005]: docs/adr/0005-pacotes-por-feature-no-renderer.md
[F-012]: docs/specs/F-012-arquitetura-modular.md
[F-013]: docs/specs/F-013-profundidade-livro-ordens.md

## Convenção de atualização

- Use **Added**, **Changed**, **Fixed**, **Deprecated**, **Removed** ou
  **Security**.
- Registre uma entrada em toda entrega que altere comportamento percebido.
- Vincule a spec, issue ou ADR no texto quando isso facilitar rastreabilidade.
