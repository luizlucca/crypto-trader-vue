# ADR-0006 — Cofre de credenciais por senha no processo principal

**Status:** aceito  
**Data:** 2026-08-07  
**Relaciona-se a:** [F-018](../specs/F-018-cofre-de-credenciais-e-conexoes-privadas.md)

## Contexto

A plataforma passará a manter API keys e secrets para conectar contas privadas
em várias corretoras. Os dados públicos já vivem isolados entre renderer,
processo principal e processos utilitários, mas os providers de mercado não
devem ganhar acesso a credenciais por esse motivo.

O requisito de produto é uma senha pessoal que proteja os dados em disco e
controle o uso de recursos privados. O `safeStorage` do Electron não pode ser
a raiz dessa garantia: no Linux, uma instalação sem serviço de segredos pode
usar o backend `basic_text`.

## Decisão

O processo principal é o único dono do cofre de credenciais e da sessão de
desbloqueio. Ele deriva uma chave da senha com `scrypt` assíncrono e cifra um
documento versionado com AES-256-GCM; o arquivo só guarda metadados KDF,
ciphertext e tag de autenticação.

```text
Vue renderer ── IPC validado ──> main/security ──> arquivo cifrado em userData
       │                               │
       │                               └──> main/providers autenticados
       │
       └── sem segredo <── utility market-data (público)
```

O renderer envia credenciais somente no comando explícito de criar/editar ou
validar uma conta e recebe resumos mascarados. Secrets, senha, chave derivada e
documento decifrado não retornam pelo `contextBridge`, não entram em estado Vue
e não chegam aos processos utilitários de catálogo, candles ou livro.

O bloqueio descarta a chave e o documento em memória. O processo principal
aplica lock manual, inatividade, minimização, suspensão/bloqueio da sessão e
ação de fechar conforme preferências não sensíveis controladas por ele mesmo.
O encerramento do processo descarta sempre a sessão.

## Consequências

- Uma futura feature de ordens ou saldo chama o guarda de sessão antes de usar
  um `AccountProvider`; ela não implementa outra autenticação própria.
- Providers autenticados são independentes de `MarketDataProvider`, preservando
  dados públicos sem credenciais e o caminho quente do realtime.
- A troca de senha precisa decifrar e recifrar o documento; uma senha esquecida
  não é recuperável e apaga o cofre por decisão explícita.
- O main process concentra código de criptografia e persistência, exigindo
  testes de corrupção, IPC e ciclo de vida além dos testes do renderer.
- `safeStorage` ou keyrings poderão acrescentar defesa em profundidade depois,
  mas uma indisponibilidade deles não reduz a proteção baseada em senha nem
  libera gravação em texto simples.

## Alternativas consideradas

- **`safeStorage` como único cofre:** rejeitado porque não usa a senha pessoal
  e pode degradar para `basic_text` no Linux.
- **Cifrar no renderer e gravar pelo preload:** rejeitado porque deixa chave e
  documento decifrado no contexto mais exposto e acopla segurança à reatividade
  da UI.
- **Guardar API key/secret em `localStorage`:** rejeitado por texto simples e
  exposição a qualquer código do renderer.
- **Adicionar keytar como dependência obrigatória:** rejeitado por dependência
  nativa e porque não substitui a proteção pela senha pessoal.
