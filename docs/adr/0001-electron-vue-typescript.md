# ADR-0001 — Electron + Vue + TypeScript end-to-end

**Status:** aceito  
**Data:** 2026-07-30  
**Relaciona-se a:** [F-001](../specs/F-001-runtime-desktop-electron.md)

## Contexto

A aplicação Wails/WebKit apresentava latência perceptível em janelas internas,
arraste e resize. A plataforma precisa de uma experiência desktop previsível
para fluxos de trading com gráfico e livro em tempo real.

## Decisão

Usar Electron como runtime desktop, Vue 3 no renderer e TypeScript em main,
preload, renderer e processos utilitários.

## Consequências

- O processo principal pode criar BrowserWindows independentes para pesquisa.
- IPC, preload isolado e processo utilitário exigem contratos tipados e
  validação de payload.
- A aplicação não possui mais backend Go/Wails em seu caminho de execução.
- O custo de distribuição e consumo base do Electron é aceito em troca de
  Chromium atualizado, DevTools e separação de processos.

## Alternativas consideradas

- Permanecer no Wails/WebKit: rejeitado por limitações observadas de composição
  e interação de janelas neste ambiente.
- Flutter/Rust: não adotado para evitar reescrever o frontend e perder o
  ecossistema Vue/TypeScript já consolidado.
