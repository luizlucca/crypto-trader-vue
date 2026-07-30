# Estratégia de testes

## Objetivo

Proteger contratos de mercado e evitar regressões de performance sem depender da
Binance real para a maior parte da suíte.

## Camadas

| Camada | Escopo | Ferramenta atual | Exemplo |
| --- | --- | --- | --- |
| Unidade | normalização, tipos, services e plugins | Vitest | cursor histórico, temas, Rounded Candles |
| Contrato | IPC/preload/provider | Vitest | request de candles e structured clone |
| Processo | sessões RxJS e coalescência | Vitest com timers | um livro por frame |
| Integração | janelas Electron, abas e busca | manual hoje; automatizar | Ctrl+T, Enter, troca de período |
| Visual | temas, layout e chart | manual hoje; automatizar | claro/escuro, resize, fallback de ícone |
| Live | compatibilidade Binance | Vitest opt-in | REST + sockets Spot/Futures |
| Carga | bursts e múltiplas abas | fixtures; a criar | p95 e long tasks |

## Comandos atuais

    npm test
    npm run typecheck
    npm run build

Teste live explícito:

    BINANCE_LIVE_TEST=1 npm test -- --run electron/utility/market-data/providers/binance/provider.live.test.ts

## Regras

- Todo bug corrigido adiciona teste de regressão na camada mais baixa possível.
- Todo contrato novo atravessando IPC adiciona teste de validação e clone seguro.
- Toda mudança em stream, Worker ou gráfico executa cenários de
  [performance](../performance/README.md).
- Fixture de exchange deve ser determinística: timestamps, preços e volumes
  conhecidos; nunca snapshot copiado sem anonimização/controle de tamanho.
- Automação Electron é a próxima lacuna prioritária: deve testar busca, criação
  de abas, troca de período e paginação histórica.

## Matriz mínima por feature

| Tipo de mudança | Validação mínima |
| --- | --- |
| Provider/endpoint | unidade + contrato + live opt-in quando aplicável |
| Realtime | unidade com timers + perfil manual |
| Chart/plugin | unidade + typecheck + teste manual de interação |
| IPC/janela | contrato + integração Electron |
| Tema/layout | unidade + visual/manual em claro e escuro |
