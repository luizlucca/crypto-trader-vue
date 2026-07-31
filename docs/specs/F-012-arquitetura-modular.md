# F-012 — Arquitetura modular do renderer

**Status:** em evolução  
**Última revisão:** 2026-07-31  
**ADR:** [ADR-0004](../adr/0004-camadas-e-fronteiras-de-modulo.md)

## Caso de uso

Como desenvolvedor da plataforma, quero camadas explícitas e verificáveis para
adicionar ordens, posições, indicadores e novos provedores sem aumentar o
acoplamento nem o custo de leitura do código já entregue.

Esta spec não descreve comportamento visível ao usuário. Ela existe porque as
próximas features dependem dela e precisam de um critério de aceite comum.

## Comportamento esperado

- Nenhuma mudança perceptível na interface, nos streams ou na performance.
- `npm run lint`, `npm test`, `npm run typecheck` e `npm run build` passam.
- Um import de `electron/` para o renderer falha no lint.

## Implementação e decisões de arquitetura

### Fase 1 — fundação (concluída)

- `shared/contracts` e `shared/types` deixaram `src/`: o contrato de IPC agora
  é neutro entre os processos.
- `src/domain/` recebeu a regra que morava em `src/types/workspace.ts`. Um
  arquivo chamado `types` não deve conter comportamento.
- `src/domain/marketSelection.ts` passou a ser a fonte única de
  `DEFAULT_MARKET_SELECTION`, `marketSelectionFingerprint` e
  `selectionForNewTab`. Antes o default estava duplicado entre o workspace e a
  janela de pesquisa, e a fingerprint estava reimplementada no `MarketChart`.
- Aliases `@shared/*` e `@/*` substituíram os caminhos relativos profundos.
- ESLint com regras que descrevem o estilo já praticado, mais
  `no-restricted-imports` para as fronteiras do ADR-0004.

### Fase 2A — cortar pontes com o grafo reativo (concluída)

O renderer ainda tinha caminhos periódicos entre o caminho quente e a
reatividade do Vue. Eram o mesmo mecanismo que, no início do projeto, fez o
livro de ordens disputar thread com o desenho do gráfico.

- **Latência.** O livro emitia `latency` a cada 500 ms para `WorkspaceTab`.
  Como a lista de abas é reativa profunda e o rodapé lê esse campo, cada
  amostra agendava uma render pass completa do componente que hospeda o
  `MarketChart`. Agora vai por `services/streamLatency.ts` direto para o nó de
  `StreamLatencyText.vue`, e `latency` deixou de existir em `WorkspaceTab`.
- **Preço.** `services/realtimePrice.ts` percorria todos os assinantes a cada
  publicação, comparando três strings por assinante, a ~60 publicações por
  segundo. Passou a usar `services/imperativeChannel.ts`, indexado por chave.
- **Sidebar.** `MarketSidebar` copiava e ordenava o catálogo inteiro a cada
  tecla para exibir 14 linhas. Passou a usar `domain/topSelection.ts`, que faz
  seleção parcial e aloca apenas o buffer do resultado.

### Fase 2B — composables (concluída)

`TradingWorkspace.vue` saiu de 799 para 233 linhas — 142 de `script setup`. O
componente voltou a fazer o que um componente faz: compor os painéis e traduzir
eventos de janela. Cinco composables:

- `useResizableSidebar` — largura, limites e persistência. A largura preferida
  do usuário fica fora do grafo reativo: encolher a janela ajusta o que cabe
  sem sobrescrever a escolha, então voltar a alargar restaura o valor original.
- `useCatalogCache` — cache por provedor/mercado com single-flight. Usa
  `shallowRef` com mapas imutáveis: um catálogo carrega milhares de pares, e
  reatividade profunda instalaria um proxy em cada um deles.
- `useCandleHistoryCache` — janela limitada de candles por aba.
  **Deliberadamente não reativo**, com essa restrição documentada no próprio
  módulo: ele é escrito a cada candle em tempo real.

- `useWorkspaceTabs` — lista de abas e ciclo de vida das sessões de mercado.
  O contador `generation` de cada aba resolve o problema de uma troca começar
  antes da anterior terminar: uma continuação atrasada percebe que não é mais
  dona da aba e aborta em vez de sobrescrever estado mais novo. Essa
  verificação estava escrita à mão em cinco lugares; agora existe uma vez, em
  `beginTransition` e `stillOwns`. O escopo `'session' | 'candles'` tornou
  explícito o que antes era implícito: trocar só o período preserva o estado e
  a latência do livro, porque o socket do livro não é reiniciado.
- `useGlobalShortcuts` — `Ctrl+T` e `Enter`, suspensos enquanto um modal detém
  o teclado.

Nenhum dos cinco introduz estado reativo tocado por candle ou por snapshot.

### Fase 3 — estilos (concluída)

`src/style.css` tinha 3.672 linhas globais e mais cores em hexadecimal fixo
(301) do que em `var(--)` (248). Isso contradizia a F-009: os 30 presets só
recoloriam parte da interface, porque a maioria das cores não passava pelos
tokens. Pior, 158 declarações de cor não tinham variante clara — elas eram
idênticas nos dois temas.

**Cores.** Cada cor foi comparada com a paleta em espaço Lab (Delta-E). As que
ficavam a menos de 1,5 viraram `var(--token)`; as demais viraram
`color-mix(in srgb, var(--a) N%, var(--b))`, o que preserva a nuance escolhida
e faz a cor acompanhar o preset. Sobraram 31 hexadecimais: cores de marca — o
amarelo da Binance não deve seguir tema — e tons sem aproximação aceitável.
Medido no app: as 7 propriedades sondadas passaram a mudar tanto ao trocar de
preset quanto ao alternar claro/escuro.

Uma armadilha encontrada durante a conversão: uma fórmula ajustada no tema
escuro pode resolver para branco-sobre-branco no claro, porque tokens de
superfície invertem entre os temas enquanto `--accent-contrast` continua
branco. O conversor passou a rejeitar qualquer candidata que perdesse contraste
no tema oposto.

**Módulos.** O arquivo virou `src/styles/*.css` por domínio, e `style.css`
ficou só com os `@import`. A ordem desses imports **é** a ordem da cascata: a
divisão foi feita garantindo que dois blocos com o mesmo seletor nunca caíssem
em arquivos diferentes, e o CSS compilado foi comparado regra a regra com o
anterior (494 antes, 494 depois, nenhuma perdida).

**Fontes de verdade:** `eslint.config.js` (fronteiras), `shared/`,
`src/domain/`, `src/composables/`, `src/services/imperativeChannel.ts`,
`src/styles/tokens.css`, `electron.vite.config.ts`, `tsconfig.json`,
`tsconfig.node.json`, `vitest.config.ts`.

**Fora de escopo:** `<style scoped>` por componente. As 494 regras seguem
globais; migrar exigiria revisar especificidade caso a caso, com um diff
grande demais para ser revisável.

## Testes

- Suíte existente sem alteração de asserções: 38 testes, 12 arquivos.
- `npm run typecheck` cobre renderer e processos desktop separadamente.
- `npm run lint` verifica as fronteiras de camada.
- Validação manual: abrir o app, trocar de aba, par, mercado e período;
  carregar histórico anterior; abrir a janela de pesquisa e o painel de
  configurações.

## Critérios de aceite

- [x] `electron/` não importa nada de `src/`.
- [x] `shared/` não importa Vue nem Electron.
- [x] Nenhum default de `MarketSelection` duplicado entre janelas.
- [x] `marketSelectionFingerprint` existe em um único lugar.
- [x] Lint, testes, typecheck e build passam.
- [x] Nenhuma escrita periódica do livro de ordens em estado reativo do Vue.
- [x] Publicação de preço não percorre assinantes de outros instrumentos.
- [x] A sidebar não ordena o catálogo inteiro para exibir 14 linhas.
- [x] Nenhum estado reativo novo no caminho de candles ou do livro.
- [x] `TradingWorkspace.vue` abaixo de 300 linhas (233).
- [x] Cores da interface acompanham o preset, não só claro/escuro.
- [x] Nenhuma cor convertida perde contraste no tema oposto.
- [x] O CSS compilado mantém as mesmas 494 regras após a modularização.

## Evolução

O `vitest.config.ts` duplica os aliases declarados no `electron.vite.config.ts`
porque o Vitest não lê a configuração do electron-vite. Se um terceiro consumo
surgir, extrair os aliases para um módulo compartilhado.
