# BUG-001 — Indicador do livro permanece vermelho com dados válidos

**Status:** corrigido  
**Severidade:** alta  
**Data:** 2026-07-30  
**Specs:** F-003 e F-007

## Comportamento observado

Uma nova aba podia exibir o livro de ordens enquanto o ponto de status
permanecia vermelho.

## Causa

O ponto usava o estado agregado da sessão. Assim, um erro exclusivo dos candles
também pintava de vermelho o indicador que o usuário associa ao livro. Além
disso, um payload válido não confirmava defensivamente a recuperação do estado
do respectivo stream.

## Correção

- A aba armazena separadamente os estados de candle e livro.
- O ponto visual representa `orderBookState`; o estado agregado continua na
  barra inferior.
- Um snapshot/candle válido confirma o stream como conectado, sem transformar
  um snapshot antigo retido em falsa conexão.
- O tooltip informa os estados dos dois streams.

## Regressão

- `electron/utility/market-data/session.test.ts`
- `src/features/workspace/domain/workspace.test.ts`

## Critérios validados

- [x] Erro de candle não deixa o ponto do livro vermelho.
- [x] Snapshot válido recupera o estado do livro.
- [x] Estado agregado continua expondo falha parcial.
