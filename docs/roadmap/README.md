# Roadmap técnico e de produto

Este é um backlog priorizado, não um compromisso de data. Itens só entram em
desenvolvimento quando houver spec, critérios de aceite e impacto de performance
avaliado.

## Agora — confiabilidade e mensuração

| ID | Item | Prioridade | Dependências |
| --- | --- | --- | --- |
| RT-001 | Instrumentar latência, filas e descarte por processo/sessão | P0 | F-003, performance |
| RT-002 | Medir e registrar baseline dos cenários críticos | P0 | performance |
| RT-003 | Teste de integração Electron para abas, busca e histórico | P0 | testing |
| RT-004 | Persistir/restaurar abas abertas de forma opcional | P1 | F-007 |

## Próximo — dados e análise

| ID | Item | Prioridade | Dependências |
| --- | --- | --- | --- |
| DA-001 | Mini-tickers para atualizar catálogo entre refreshes | P1 | F-002, F-006 |
| DA-003 | Indicadores e ferramentas de desenho reais | P1 | F-004 |
| DA-004 | Primitivas visuais de entrada, TP, SL e break-even | P1 | F-004 |

DA-002 (livro completo por snapshot + diff stream) foi entregue pela
[F-013](../specs/F-013-profundidade-livro-ordens.md).

## Achados de revisão

A [revisão de código de agosto de 2026](./revisao-de-codigo-2026-08.md) percorreu
o repositório em quatro frentes. O que era correção segura foi aplicado; os 25
itens que restaram exigem decisão — mudam comportamento de produto, tocam
caminho quente e precisam de medição, ou têm correção óbvia com efeito colateral
pior que o problema. O documento traz uma ordem sugerida em quatro ondas.

## Posterior — execução e segurança

| ID | Item | Prioridade | Dependências |
| --- | --- | --- | --- |
| EX-001 | Credenciais em keychain/secure storage | P0 antes de ordens | F-009 |
| EX-002 | Contrato modular de ordens e posições | P0 antes de execução real | provider |
| EX-003 | Simulação/paper trading e confirmações de risco | P0 antes de execução real | EX-002 |
| EX-004 | Providers Bybit, OKX e Gate.io | P2 | F-002 |

## Regra de priorização

P0 bloqueia segurança, confiabilidade ou regressão crítica. P1 amplia valor sem
comprometer o caminho quente. P2 é expansão opcional. Um item concluído deve
referenciar a spec atualizada, testes adicionados e entrada no changelog.
