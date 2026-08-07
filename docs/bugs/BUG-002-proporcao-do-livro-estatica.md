# BUG-002 — Proporção de compra/venda do livro era estática

**Status:** corrigido  
**Severidade:** média  
**Data:** 2026-07-30  
**Spec:** F-003

## Comportamento observado

Os textos `54,2%` e `45,8%` e o preenchimento de `54%` permaneciam fixos,
independentemente das mudanças do livro.

## Causa

Percentuais e largura estavam codificados diretamente no template e no CSS.

## Correção

- A proporção usa a soma das quantidades nos 10 melhores níveis visíveis de
  bids e asks.
- A barra e os dois textos são atualizados no mesmo frame imperativo do livro.
- Não foi criado estado Vue no caminho quente.
- Um livro vazio exibe valores indisponíveis e uma divisão visual neutra.

## Regressão

- `shared/domain/orderBookRatio.test.ts`

## Critérios validados

- [x] Alterar bids/asks altera percentuais e barra.
- [x] Níveis fora da profundidade visível não afetam o cálculo.
- [x] Livro vazio não produz divisão por zero.
