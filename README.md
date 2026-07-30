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

Veja [docs/architecture.md](docs/architecture.md) para as decisões de
arquitetura e performance.

## Desenvolvimento com Electron

Recomendado: Node.js 22.

```sh
cd frontend
npm install
npm run dev
```

O processo de desenvolvimento abre a aplicação Electron e mantém hot reload
do renderer Vue e dos processos desktop.

## Build e validação

```sh
cd frontend
npm test
npm run typecheck
npm run build
```

Para gerar AppImage e pacote Debian:

```sh
cd frontend
npm run package:linux
```
