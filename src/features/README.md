# Pacotes do renderer

Cada pasta representa uma capacidade do produto. Subpastas são criadas somente
quando necessárias:

| Pasta | Responsabilidade |
| --- | --- |
| `chart` | Ciclo de vida do Lightweight Charts, candles e histórico |
| `drawings` | Catálogo, interação, persistência e primitives de desenho |
| `indicators` | Catálogo, painéis, cliente e Worker de indicadores |
| `market` | Catálogo de símbolos, busca, favoritos e canais realtime |
| `orderbook` | Livro de ordens e atualização imperativa de linhas |
| `positions` | Visualização de posições |
| `settings` | Temas, aparência e painel de configuração |
| `trading` | Boleta e entrada de ordens |
| `workspace` | Abas, sessões e composição dos painéis |

## Convenções

- `components/`: Vue SFCs; Composition API com `script setup` e TypeScript.
- `composables/`: estado Vue e lifecycle da feature.
- `domain/`: TypeScript puro, sem Vue, Electron ou acesso a browser.
- `services/`: casos de uso, persistência local e coordenação.
- `plugins/`: integração com primitives/custom series de terceiros.
- `workers/`: entrada e suporte de Web Workers.
- Testes ficam ao lado do arquivo testado.
- Importe o módulo concreto pelo alias da feature; não crie barrels.

O renderer compartilhado fica em `src/shared`; contratos neutros entre
processos continuam em `/shared` na raiz. A integração com o preload fica em
`src/platform/desktop`.
