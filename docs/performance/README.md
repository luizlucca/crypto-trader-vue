# Baseline e orçamento de performance

As metas abaixo são **SLOs iniciais**, ainda não uma medição certificada. O
primeiro ciclo deve registrar uma medição de referência por máquina, versão da
aplicação, resolução, escala de tela e rede. Nenhuma feature de caminho quente
deve ser considerada pronta sem comparação antes/depois.

## Cenários e metas

| Cenário | Medida | Meta inicial |
| --- | --- | --- |
| Candle realtime | custo p95 de atualização no renderer | até 4 ms |
| Livro ativo | custo p95 de um commit por frame | até 8 ms |
| Frame de interação | long tasks no renderer | nenhuma acima de 50 ms |
| Busca com catálogo aquecido | filtro + ordenação no Worker p95 | até 50 ms |
| Abertura de busca | solicitação até input focado | até 1,5 s |
| Histórico | travar interação após gatilho | até 2 frames |
| Histórico | aplicar página de 400 candles p95 | até 50 ms |
| Histórico | resposta REST Binance | monitorar; alvo de UX até 1,5 s |
| Abas | livro de aba inativa entregue ao renderer | zero |
| Memória | crescimento após 15 min sem troca de ativo | sem crescimento contínuo |

## Procedimento de medição

1. Executar `npm run dev` em modo de desenvolvimento e anotar ambiente.
2. Abrir DevTools Performance na janela principal e gravar 30 segundos.
3. Exercitar: livro ativo, candle realtime, arraste do painel, busca, troca de
   abas e carregamento de três páginas históricas.
4. Repetir ao menos três vezes, registrar mediana e p95 em uma issue ou PR.
5. Em build de produção, repetir os cenários que falharem no desenvolvimento.
6. Anexar trace/screenshot e atualizar a spec/bug correspondente.

## Regras de regressão

- Aumento superior a 20% do p95 exige justificativa e aprovação explícita.
- Long task nova acima de 50 ms em interação de gráfico, livro ou busca bloqueia
  a entrega até ser corrigida ou aceita como exceção documentada.
- Não substitua isolamento de processo por otimização visual sem medição.
- Métricas devem separar rede, parsing, IPC, atualização de dados e pintura.

## Ferramentas

- Chromium DevTools Performance e Memory.
- Performance marks no renderer para fluxos medidos.
- Logs de processo utilitário para taxa de eventos, coalescência e reinícios.
- Testes de carga determinísticos com fixtures, antes de depender da Binance real.
