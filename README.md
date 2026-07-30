# CryptoPro

Plataforma desktop de negociação de criptoativos construída com Electron,
Vue 3, TypeScript e RxJS.

O primeiro recorte funcional integra a Binance Futures e exibe:

- histórico e atualizações de candles em tempo real;
- volume em um painel separado do Lightweight Charts;
- livro de ordens parcial com 20 níveis atualizado a cada 100 ms;
- seleção funcional entre Binance Spot/Futures e todos os pares negociáveis;
- catálogo com estatísticas de 24h, cache de uma hora e atualização forçada;
- busca e ordenação em Web Worker, favoritos persistentes e lista virtualizada;
- painel de mercados redimensionável e ordenação rápida nas colunas;
- pesquisa em uma `BrowserWindow` nativa, movível e redimensionável pelo
  sistema operacional;
- ícones SVG locais para 100 ativos principais, com fallback para os demais;
- processos separados para catálogo e streaming, preservando a ingestão
  realtime durante pesquisas e atualizações forçadas.
- múltiplas abas com ativo, mercado, período, cache de candles e conexões
  realtime independentes.
- criação de aba por `Ctrl+T`/`+` com seleção prévia do ativo e
  `Ctrl+clique` nos símbolos do painel Mercado.

Veja [docs/architecture.md](docs/architecture.md) para as decisões de
arquitetura e performance.

O ponto de entrada para specs, ADRs, roadmap, performance, testes, bugs e
Definition of Done está em [docs/README.md](docs/README.md). Alterações de
comportamento percebido também são registradas no [CHANGELOG.md](CHANGELOG.md).

## Desenvolvimento com Electron

Recomendado: Node.js 22.

```sh
npm install
npm run dev
```

O processo de desenvolvimento abre a aplicação Electron e mantém hot reload
do renderer Vue e dos processos desktop.

## Build e validação

```sh
npm test
npm run typecheck
npm run build
```

Para gerar AppImage e pacote Debian:

```sh
npm run package:linux
```

Os artefatos AppImage e Debian são gravados em `release/`.
