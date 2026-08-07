# Candidatos a refatoração por tamanho e responsabilidade

**Data da análise:** 2026-08-05
**Escopo:** relatório; nenhuma refatoração funcional foi executada.

Quantidade de linhas é um sinal, não um defeito por si só. A prioridade abaixo
combina tamanho, número de responsabilidades e presença no caminho crítico de
candles, livro, indicadores ou sessões.

## Prioridade alta — caminho crítico

| Arquivo | Linhas | Motivo para revisão | Fronteira sugerida |
| --- | ---: | --- | --- |
| `features/drawings/composables/useChartDrawings.ts` | 1.300 | Estado, gestos, hit test, factories, seleção e rebuild no mesmo módulo | Separar registry de primitives, máquina de interação e adapter de persistência, mantendo o repaint imperativo |
| `features/indicators/composables/useChartIndicators.ts` | 1.113 | Coordena séries, panes, estilos, resultados e lifecycle | Separar lifecycle de séries, layout de panes e aplicação de patches do Worker |
| `features/chart/components/MarketChart.vue` | 1.104 | Componente integra chart, histórico, tema, desenhos, indicadores e eventos | Extrair controller do chart e coordenador de histórico; manter o SFC como composição |
| `features/drawings/plugins/catalog-drawings/catalog-renderer.ts` | 1.036 | Renderer despacha dezenas de geometrias no caminho de pintura | Dividir por família geométrica com helpers sem alocação e benchmark antes/depois |
| `features/indicators/workers/indicators.worker.ts` | 1.025 | Router, cache, normalização e cálculo dividem a mesma entrada de Worker | Separar protocolo/router, cache e adapter da biblioteca sem criar Workers extras inadvertidamente |
| `features/indicators/services/indicators.ts` | 695 | Transporte, pendências, coalescência e recuperação do Worker | Extrair transporte e scheduler mantendo uma fila/fonte de verdade |
| `electron/utility/market-data/providers/binance/provider.ts` | 631 | REST, WebSocket, Spot/Futures e criação dos fluxos do provider | Separar clientes REST e fábricas de stream; preservar o contrato `MarketDataProvider` |
| `features/orderbook/components/OrderBook.vue` | 490 | UI Vue e adapter DOM imperativo coexistem em um arquivo quente | Extrair renderer imperativo de linhas sem converter snapshots em estado reativo |
| `features/workspace/composables/useWorkspaceTabs.ts` | 467 | Sessões, gerações, cache, troca de símbolo/período e lifecycle | Separar máquina de transição da fachada Vue, preservando os guards de geração |

## Prioridade média — domínio e interface

| Arquivo | Linhas | Motivo para revisão | Fronteira sugerida |
| --- | ---: | --- | --- |
| `features/drawings/domain/chartDrawings.ts` | 933 | Tipos, catálogo, defaults, capacidades e parsing no mesmo domínio | Separar catálogo estático de validação/persistência |
| `features/settings/components/GeneralSettingsPanel.vue` | 743 | Janela, navegação, geometria e seções de configuração | Extrair seções e manter o painel como shell |
| `features/market/components/SymbolSearchModal.vue` | 641 | Teclado, filtros, virtualização e tabela no mesmo SFC | Extrair header/filtros e viewport virtual sem mover busca para Vue reativo |
| `features/drawings/components/DrawingStyleBar.vue` | 517 | Barra, menus, foco, paleta e popovers avançados | Extrair controles de cor/linha reutilizáveis |
| `features/indicators/components/IndicatorPicker.vue` | 411 | Janela, busca, navegação e aplicação do formulário | Separar viewport do catálogo e shell da janela |
| `electron/main/market-data/coordinator.ts` | 370 | Coordena dois utility processes, recovery e pending requests | Separar supervisor de processo da tabela de requisições |

## Arquivos grandes que não são prioridade automática

- `features/settings/services/themeCatalog.ts` — 1.033 linhas, mas a maior
  parte é catálogo declarativo de presets. Separar dados pode facilitar leitura,
  porém não reduz risco de runtime.
- `features/drawings/plugins/line-tools/*.ts` — vários arquivos entre 250 e 465
  linhas mantêm procedência de código externo. Refatorá-los dificultaria
  comparação com upstream; revisar somente ao atualizar a origem.
- CSS global: `chart.css` (1.272), `indicators.css` (1.081) e `settings.css`
  (1.025). A cascata foi modularizada por domínio; dividir novamente exige
  auditoria de especificidade e comparação do CSS compilado.
- Testes extensos não entram na prioridade apenas por linhas: tamanho pode
  representar cobertura de combinações críticas.

## Ordem segura sugerida

1. Criar testes de caracterização e medições antes de cada extração.
2. Refatorar primeiro limites semânticos fora do loop de pintura.
3. Alterar apenas um caminho crítico por vez.
4. Comparar long tasks, repaint, quantidade de mensagens IPC e memória.
5. Só então atacar renderers canvas e o adapter imperativo do livro.
