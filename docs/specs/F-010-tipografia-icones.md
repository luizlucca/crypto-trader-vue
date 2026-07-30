# F-010 — Tipografia e ícones de criptoativos

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero ler preços, percentuais e controles rapidamente e reconhecer
ativos importantes sem inflar bundle ou lista de mercado.

## Comportamento esperado

- Textos de interface possuem hierarquia legível para sessões extensas.
- Valores financeiros usam fonte monoespaçada para alinhamento estável.
- Principais ativos exibem SVG; ativos fora do conjunto recebem fallback leve.
- Somente ícones usados entram no bundle.

## Implementação e decisões de arquitetura

- `style.css` registra Inter Variable para UI e JetBrains Mono Variable para dados.
  Tokens `--font-ui` e `--font-data` evitam escolhas ad-hoc.
- `cryptoIconRegistry.ts` importa explicitamente SVGs curados de
  `@web3icons/core`; não importa o registro global da biblioteca.
- `CryptoAssetIcon.vue` resolve símbolo e apresenta fallback. Listas
  virtualizadas instanciam ícones somente nas linhas visíveis.

Fontes de verdade: `frontend/src/style.css`,
`frontend/src/components/market/CryptoAssetIcon.vue` e
`frontend/src/components/market/cryptoIconRegistry.ts`.

## Testes

- O typecheck valida imports SVG e declarações de módulo.
- Legibilidade, alinhamento e fallback devem ser verificados nos temas claro e escuro.

## Critérios de aceite

- [ ] Preços e quantidades permanecem alinhados nas tabelas.
- [ ] Cabeçalhos, controles e conteúdo têm contraste nos dois modos.
- [ ] BTC, ETH, SOL e ativos do registro mostram SVG correto.
- [ ] Ativo não mapeado não quebra linha nem faz requisição externa.
- [ ] A aplicação não importa milhares de ícones não utilizados.

## Evolução

- Revisar conjunto curado por liquidez/demanda.
- Adicionar testes visuais automatizados quando houver pipeline de screenshot.
