# CryptoPro

Plataforma desktop de negociação de criptoativos construída com Vue 3,
TypeScript, Wails e Go.

O primeiro recorte funcional integra a Binance Futures e exibe:

- histórico e atualizações de candles em tempo real;
- volume em um painel separado do Lightweight Charts;
- livro de ordens parcial com 20 níveis atualizado a cada 100 ms;
- seleção funcional entre Binance Spot/Futures e símbolos USDT;
- componentes isolados para evitar competição entre o gráfico e o livro.

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
