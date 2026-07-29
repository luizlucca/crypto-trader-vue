# CryptoPro

Plataforma desktop de negociação de criptoativos construída com Vue 3,
TypeScript, Wails e Go.

O primeiro recorte funcional integra a Binance Futures e exibe:

- histórico e atualizações de candles em tempo real;
- volume em um painel separado do Lightweight Charts;
- livro de ordens parcial com 20 níveis atualizado a cada 100 ms;
- seleção funcional entre Binance Spot/Futures e todos os pares negociáveis;
- catálogo com estatísticas de 24h, cache de uma hora e atualização forçada;
- busca e ordenação em Web Worker, favoritos persistentes e lista virtualizada;
- painel de mercados redimensionável e ordenação rápida nas colunas;
- ícones SVG locais para 100 ativos principais, com fallback para os demais;
- canais realtime imperativos e componentes isolados para preservar gráfico,
  livro e responsividade do modal.

Veja [docs/architecture.md](docs/architecture.md) para as decisões de
arquitetura e performance.

## Desenvolvimento no Ubuntu 24.04

Sempre execute o Wails com a tag do WebKit 2.41:

```sh
wails dev -tags webkit2_41
```

## Validação

```sh
go test ./...
cd frontend && npm run build
wails build -tags webkit2_41
```
