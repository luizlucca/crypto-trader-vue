# BUG-003 — Livro conectado sem snapshot inicial

**Status:** corrigido  
**Severidade:** alta  
**Data:** 2026-08-03  
**Spec:** F-013

## Comportamento observado

Depois de abrir uma sessão, o estado do livro podia ficar verde enquanto todas
as linhas permaneciam vazias. O problema era intermitente porque dependia de
uma falha transitória na primeira chamada REST `/depth`.

## Causa

- A falha do snapshot era capturada, mas não agendava outra tentativa.
- A abertura do WebSocket marcava o livro como conectado antes da sincronização
  entre snapshot e diff stream.
- Sem snapshot, os eventos de profundidade podiam permanecer no buffer sem
  limite enquanto o socket continuava aberto.
- Uma troca de socket durante um snapshot em voo podia deixar a nova geração
  sem uma requisição própria.

## Correção

- O snapshot usa retry com backoff exponencial de 1 a 15 segundos.
- O estado `connected` só é publicado depois do primeiro livro sincronizado.
- Reconectar o socket invalida o livro local e exige um snapshot novo.
- Tentativas e timers antigos são identificados por geração e cancelados ao
  encerrar a assinatura.
- Eventos acumulados durante o backoff são ignorados; somente os recebidos
  durante a requisição do snapshot participam da sincronização.
- O buffer de bootstrap tem limite defensivo de 256 atualizações. Um estouro
  invalida o snapshot e inicia uma sincronização nova.

## Regressão

- `provider.test.ts`: falha inicial seguida de recuperação, status verdadeiro,
  reconexão do socket, cancelamento e corrida entre gerações.
- `orderBookSync.test.ts`: overflow do buffer invalida o snapshot.
- `provider.live.test.ts`: Spot e Futures carregam REST, candles e livro usando
  os endpoints públicos reais da Binance.

## Critérios validados

- [x] Uma falha transitória no primeiro snapshot agenda nova tentativa.
- [x] Livro vazio nunca publica estado `connected`.
- [x] Reconexão do WebSocket exige snapshot da nova geração.
- [x] Encerrar a sessão cancela retries pendentes.
- [x] O buffer não cresce indefinidamente sem snapshot.
- [x] Spot e Futures continuam entregando dez linhas por lado no teste live.
