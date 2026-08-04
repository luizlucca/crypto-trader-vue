# Registro e triagem de bugs

Bugs devem ser registrados como issue usando este modelo. Um bug corrigido só é
encerrado com reprodução documentada, teste de regressão quando viável e spec
atualizada se o comportamento esperado mudou.

## Bugs registrados

| ID | Descrição | Status |
| --- | --- | --- |
| [BUG-001](./BUG-001-indicador-do-livro-na-aba.md) | Indicador do livro permanece vermelho | Corrigido |
| [BUG-002](./BUG-002-proporcao-do-livro-estatica.md) | Proporção do livro era estática | Corrigido |
| [BUG-003](./BUG-003-livro-conectado-sem-snapshot.md) | Livro conectado sem snapshot inicial | Corrigido |

## Modelo

    Título: [área] descrição objetiva

    Spec relacionada: F-XXX
    Severidade: crítica | alta | média | baixa
    Regressão: sim | não | desconhecido
    Ambiente: versão, SO, escala de tela, rede, provider/mercado/símbolo/período

    Passos para reproduzir:
    1.
    2.
    3.

    Resultado esperado:
    Resultado observado:
    Frequência:
    Evidência: screenshot, trace, log ou vídeo curto
    Impacto em decisão de trading:
    Hipótese técnica inicial:

## Severidade

- **Crítica:** dado incorreto, execução indevida futura, travamento ou perda de
  conexão que torna a tomada de decisão insegura.
- **Alta:** gráfico, livro, busca ou aba ficam indisponíveis ou materialmente lentos.
- **Média:** comportamento incorreto com alternativa disponível.
- **Baixa:** problema visual ou de ergonomia sem efeito nos dados.

## Triagem

1. Confirmar mercado, símbolo, período e horário do evento.
2. Determinar se o dado estava errado na Binance, no provider, IPC ou renderer.
3. Classificar como regressão de funcionalidade, performance, segurança ou UX.
4. Vincular à spec e, se necessário, criar ADR/roadmap.
5. Definir teste de regressão e critério de aceite para a correção.
