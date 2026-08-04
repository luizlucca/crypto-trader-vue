# F-006 — Catálogo, busca de pares e favoritos

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero localizar e comparar rapidamente pares da corretora,
atualizar a lista quando necessário e acessar favoritos sem congestionar o gráfico.

## Comportamento esperado

- A barra lateral filtra enquanto o usuário digita e ordena símbolo, último e 24h.
- `Enter`, fora de campos de edição, abre janela de busca de símbolos.
- A busca oferece filtros, ordenação, teclado, refresh forçado e favoritos.
- Lista grande é virtualizada e não cria um nó DOM por par.
- Favoritos persistem por provider, mercado e símbolo e sincronizam janelas.

## Implementação e decisões de arquitetura

- A pesquisa é uma `BrowserWindow` Electron com renderer próprio, sem compartilhar
  ponteiro, layout ou ciclo de renderização com o workspace.
- `marketCatalog.worker.ts` filtra/ordena índices e transfere `Uint32Array`.
  `SymbolSearchModal.vue` monta somente viewport e overscan.
- Formatações são memorizadas e o catálogo vem de processo auxiliar separado de
  realtime.
- `favorites.ts` persiste chaves no `localStorage`; IPC sincroniza alterações.
  A chave é sempre minúscula — sementes e valores lidos do armazenamento são
  normalizados na leitura, senão um favorito gravado por outra versão nunca
  volta a casar com o par que nomeia.
- A barra lateral limita a lista compacta a 14 linhas; a busca explora todos os pares.

Fontes de verdade: `src/components/market/`,
`src/workers/marketCatalog.worker.ts`,
`src/services/marketCatalogSearch*.ts` e
`src/services/favorites.ts`.

## Testes

- `provider.test.ts` cobre catálogo/cache.
- `marketData.test.ts` cobre a fronteira de dados do renderer.
- Busca, virtualização, atalhos e sincronização entre janelas são testes manuais.

## Critérios de aceite

- [ ] Digitar na barra lateral filtra sem abrir a busca.
- [ ] `Enter` em área não editável abre a busca e foca o campo.
- [ ] Busca/ordenação grande não reduz a fluidez de gráfico/livro.
- [ ] Atualizar da corretora ignora o cache de uma hora.
- [ ] Favorito alterado em uma janela reflete na outra.
- [ ] `Esc` fecha a busca e `Enter` seleciona a linha ativa.

## Evolução

- Atualizar catálogo com mini-tickers sem refresh REST.
- Tornar outras colunas ordenáveis na barra lateral conforme o espaço disponível.
