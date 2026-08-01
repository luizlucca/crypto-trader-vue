# Especificações funcionais

Este diretório é a fonte de rastreabilidade das funcionalidades já entregues.
Cada alteração de produto deve atualizar a spec afetada no mesmo pull request,
incluindo comportamento, decisão técnica, testes e critério de aceite.

## Convenções

- **Status** registra o estágio da feature: `implementada`, `em evolução` ou `planejada`.
- **Caso de uso** descreve o problema do usuário, não a estrutura do código.
- **Implementação** aponta para os módulos que são fonte de verdade.
- **Testes** lista o que é automatizado e o que requer validação manual.
- **Critérios de aceite** servem de checklist para correções e incrementos.

Crie uma nova spec a partir do [template](./TEMPLATE.md), atribua o próximo ID
e inclua o link no índice antes de iniciar a implementação.

## Índice

| ID | Feature | Status |
| --- | --- | --- |
| F-001 | [Runtime desktop Electron e segurança](./F-001-runtime-desktop-electron.md) | Implementada |
| F-002 | [Providers de dados e Binance Spot/Futures](./F-002-providers-binance.md) | Implementada |
| F-003 | [Streams realtime de candles e livro de ordens](./F-003-streams-realtime.md) | Implementada |
| F-004 | [Gráfico Lightweight Charts e plugins visuais](./F-004-grafico-lightweight.md) | Implementada |
| F-005 | [Navegação e carregamento progressivo de histórico](./F-005-historico-do-grafico.md) | Implementada |
| F-006 | [Catálogo, busca de pares e favoritos](./F-006-catalogo-busca-favoritos.md) | Implementada |
| F-007 | [Abas independentes de mercado](./F-007-abas-independentes.md) | Implementada |
| F-008 | [Layout redimensionável do workspace](./F-008-layout-redimensionavel.md) | Implementada |
| F-009 | [Temas e painel de configurações](./F-009-temas-configuracoes.md) | Implementada |
| F-010 | [Tipografia e ícones de criptoativos](./F-010-tipografia-icones.md) | Implementada |
| F-011 | [Agregação de preços do livro de ordens](./F-011-agregacao-livro-ordens.md) | Implementada |
| F-012 | [Arquitetura modular do renderer](./F-012-arquitetura-modular.md) | Em evolução |
| F-013 | [Profundidade real do livro de ordens](./F-013-profundidade-livro-ordens.md) | Implementada |
| F-014 | [Indicadores técnicos no gráfico](./F-014-indicadores-tecnicos.md) | Em desenvolvimento |

Para a visão transversal de processos, IPC e isolamento de performance, veja a
[arquitetura](../architecture.md).
