# Documentação de engenharia

| Documento | Finalidade |
| --- | --- |
| [Arquitetura](./architecture.md) | Visão de processos, módulos e isolamento de performance |
| [Specs](./specs/README.md) | Requisitos e aceite por funcionalidade |
| [ADRs](./adr/README.md) | Decisões arquiteturais e seus trade-offs |
| [Roadmap](./roadmap/README.md) | Próximos incrementos, riscos e dependências |
| [Performance](./performance/README.md) | Metas, cenários e processo de medição |
| [Testes](./testing/strategy.md) | Pirâmide, camadas e comandos de validação |
| [Bugs](./bugs/README.md) | Modelo de relato, triagem e regressão |
| [Definition of Done](./definition-of-done.md) | Condições mínimas para concluir uma mudança |

## Fluxo de desenvolvimento

1. Crie ou atualize a spec da feature.
2. Se a escolha técnica for duradoura ou difícil de reverter, registre um ADR.
3. Implemente com testes na camada correta.
4. Execute os cenários de performance quando tocar caminho quente.
5. Registre bugs conhecidos ou correções no changelog.
6. Marque os critérios de aceite e a Definition of Done antes de concluir.
