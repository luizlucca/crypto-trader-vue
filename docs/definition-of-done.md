# Definition of Done

Uma feature, correção ou refatoração está pronta somente quando os itens
aplicáveis abaixo forem atendidos.

## Produto e documentação

- [ ] A spec foi criada/atualizada com comportamento e critérios de aceite.
- [ ] Critérios de aceite foram validados manualmente quando envolverem UI,
  Electron, interação de gráfico ou rede.
- [ ] Decisão arquitetural duradoura possui ADR, quando aplicável.
- [ ] Roadmap, bug e changelog foram atualizados quando aplicável.

## Código e arquitetura

- [ ] A mudança respeita fronteiras: renderer, preload, main e processo utilitário.
- [ ] Dados de alta frequência não introduzem render Vue ou alocação por tick.
- [ ] Não há segredo, chave de API ou dado sensível em fonte, log ou localStorage.
- [ ] Listeners, frames, streams e instâncias de chart são liberados no unmount.

## Qualidade

- [ ] `npm run typecheck` passou.
- [ ] `npm test` passou.
- [ ] `npm run build` passou para alterações de código empacotável.
- [ ] Novo bug possui teste de regressão na menor camada possível.
- [ ] Fluxos com provider possuem fixture/contrato; live test é opt-in.

## Performance

- [ ] Mudança no caminho quente foi comparada ao baseline de performance.
- [ ] Não criou long task acima de 50 ms em gráfico, livro ou busca.
- [ ] Mudança em stream preserva coalescência, isolamento e limite de filas.
- [ ] Mudança em lista grande preserva virtualização/Worker quando aplicável.

Uma exceção deve ser registrada na PR/issue com risco, impacto, dono e data de
revisão.
