# Architecture Decision Records

ADRs registram decisões que afetam mais de uma feature ou seriam caras de
reverter. Eles são curtos, imutáveis após aceitos e só são substituídos por um
novo ADR que cite o anterior.

## Convenção

- Nome: `NNNN-titulo-curto.md`.
- Status: `proposto`, `aceito`, `substituído` ou `rejeitado`.
- Não reescreva a decisão histórica; acrescente um ADR sucessor.
- Atualize a spec afetada com um link para o ADR.

## Decisões registradas

| ADR | Decisão | Status |
| --- | --- | --- |
| [0001](./0001-electron-vue-typescript.md) | Electron + Vue + TypeScript end-to-end | Aceito |
| [0002](./0002-isolamento-de-dados-realtime.md) | Dados de mercado em processos utilitários | Aceito |
| [0003](./0003-renderizacao-imperativa-do-grafico.md) | Lightweight Charts imperativo no caminho quente | Aceito |
| [0004](./0004-camadas-e-fronteiras-de-modulo.md) | Camadas `shared`/`src`/`electron` impostas por lint | Aceito |
| [0005](./0005-pacotes-por-feature-no-renderer.md) | Renderer organizado em pacotes verticais por feature | Aceito |
| [0006](./0006-cofre-de-credenciais-por-senha.md) | Cofre por senha no processo principal | Aceito |
