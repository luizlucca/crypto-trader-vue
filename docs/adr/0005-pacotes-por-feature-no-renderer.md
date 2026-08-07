# ADR-0005 — Pacotes por feature no renderer

**Status:** aceito
**Data:** 2026-08-05
**Substitui parcialmente:** [ADR-0004](./0004-camadas-e-fronteiras-de-modulo.md)

## Contexto

O ADR-0004 separou corretamente renderer, processos Electron e contratos
neutros, mas o interior de `src/` continuou organizado por tipo técnico:
`components/`, `composables/`, `domain/`, `services/`, `plugins/` e `workers/`.

Com a expansão do produto, uma única mudança em indicadores ou desenhos passou
a exigir navegação por seis árvores paralelas. A estrutura informava **como** o
arquivo era implementado, mas escondia **a qual capacidade do produto** ele
pertencia.

## Decisão

O renderer passa a usar pacotes verticais por feature:

```text
src/
├── app/                    composição, shell e estilos globais
├── features/
│   └── <feature>/
│       ├── components/     interface Vue
│       ├── composables/    estado Vue e ciclo de vida
│       ├── domain/         regra TypeScript pura
│       ├── services/       casos de uso e coordenação
│       ├── plugins/        extensões de bibliotecas
│       └── workers/        processamento fora da thread do renderer
├── platform/desktop/       adaptador do contextBridge/IPC
└── shared/                 reúso exclusivo do renderer
```

Uma feature cria apenas as subpastas que usa. Testes permanecem ao lado do
módulo testado. Não são criados `index.ts` agregadores: imports apontam para o
módulo concreto, reduzindo dependências ocultas e ciclos.

`shared/` na raiz continua sendo a fronteira neutra entre processos. O novo
`src/shared/` é diferente: contém somente código reutilizável entre features do
renderer e pode usar Vue quando o artefato for um componente ou composable.

Aliases identificam os pacotes (`@chart`, `@drawings`, `@indicators`,
`@market`, `@settings`, `@workspace` e equivalentes). Eles existem apenas na
configuração do renderer e dos testes. Main, preload e utility resolvem apenas
`@shared`, preservando a fronteira do ADR-0004 também no bundler.

O código de domínio de cada feature e de `src/shared/domain` não pode importar
Vue ou Electron. `src/shared` não pode depender de app, plataforma ou features;
essas restrições são verificadas pelo ESLint.

## Consequências

- Uma feature pode ser entendida e alterada a partir de uma única árvore.
- Plugins e Workers ficam junto do domínio que atendem, sem perder o isolamento
  de runtime.
- Caminhos físicos e aliases agora expressam propriedade, não apenas tecnologia.
- Imports entre features permanecem explícitos; o workspace e o chart são os
  principais pontos de composição.
- Mover arquivos gera um diff grande de renames, porém não altera runtime,
  contratos, estado, renderização ou API pública.
- Um pacote npm por feature continua desnecessário para este aplicativo único;
  a fronteira é de código-fonte e compilação.

## Alternativas consideradas

- **Manter pastas globais por tipo:** rejeitado porque a navegação piora a cada
  nova capacidade e não mostra a propriedade do código.
- **Criar workspaces npm:** rejeitado por adicionar builds e versionamento sem
  necessidade atual de distribuição independente.
- **Adicionar barrels por feature:** rejeitado porque facilita ciclos, esconde
  dependências reais e pode aumentar o alcance de mudanças.
