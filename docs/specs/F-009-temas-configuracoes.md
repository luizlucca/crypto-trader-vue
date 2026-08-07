# F-009 — Temas e painel de configurações

**Status:** implementada  
**Última revisão:** 2026-07-30

## Caso de uso

Como trader, quero escolher aparência confortável para longas sessões e criar
temas próprios sem interromper gráfico, livro ou streams.

## Comportamento esperado

- Há 38 presets, cada um com variantes clara e escura.
- Candles, volume, fundo, grade, crosshair, watermark e superfícies usam cores coerentes.
- É possível criar, aplicar e remover temas locais com cor e transparência por modo.
- O painel é subjanela webview arrastável/redimensionável e persistida, sem blur/backdrop.

## Implementação e decisões de arquitetura

- `themeCatalog.ts` contém presets e palettes. `theme.ts` persiste modo,
  preset e até 12 temas personalizados no `localStorage`.

### A rampa de superfícies é retonalizada, não reescrita

As quarenta cores de cromo — fundo, painéis, bordas, texto, grade — foram
escritas uma vez, no azul frio com que o app nasceu. Um tema que quer outro
caráter não as reescreve: declara um **tom de superfície**, e cada cor é
neutralizada para o cinza de mesma luminosidade percebida e então deslocada na
direção de um matiz.

Deslocar a croma em vez de misturar em direção a uma cor é o que mantém a rampa
utilizável nas duas pontas: misturar um quase-branco com um azul escuro o
escureceria, e o tema claro perderia as superfícies claras. `lift` move a rampa
inteira em profundidade, proporcionalmente ao espaço que cada superfície ainda
tem — é o que separa três cinzas de um só. E a croma é atenuada perto do preto,
onde o mesmo deslocamento seria quase toda a cor.

Sem tom declarado, nada muda: os 30 presets originais permanecem intactos.

### Os oito temas de 2026-08-02

Abrem a lista **três neutros** — Ônix, Carbono e Cinza — em escala de cinza
pura, sem matiz algum no cromo, separados por profundidade e não por cor. As
velas mantêm verde e vermelho: alta e baixa são dado, não decoração, e uma vela
monocromática custa justamente a leitura que ela existe para dar.

Em seguida **TradingView**, com as cores oficiais da plataforma (`#26a69a`,
`#ef5350`, acento `#2962ff`) sobre um cromo azul-carvão equivalente ao
`#131722` do gráfico original.

E quatro pensados para luminosidade clara, cada um para uma condição de uso:
**Papel** (branco quente, baixo ofuscamento), **Névoa** (cinza-azulado nítido),
**Alto Contraste** (ambiente muito iluminado) e **Sépia** (âmbar suave para
sessões longas).
- A raiz recebe `data-theme`, `data-theme-preset` e CSS variables semânticas.
- `MarketChart.vue` usa `chart.applyOptions()` e `series.applyOptions()`;
  não recria chart nem reinicia streams. Volume preserva intervalo lógico.
- `GeneralSettingsPanel.vue` usa `translate3d` coalescido no arraste. Resize
  aplica conteúdo ao soltar, após contorno leve.
- `ThemePresetPreview.vue` usa a palette do próprio tema na miniatura.

### A geometria guardada é a escolhida, não a que coube

O painel guarda dois retângulos: o que o usuário escolheu e o que cabe na tela
agora. Só arrastar, redimensionar e restaurar gravam no `localStorage`;
estreitar a janela do app apenas reencaixa o painel dentro do que sobrou.

Gravar o retângulo já recortado a cada evento de `resize` fazia duas coisas
erradas ao mesmo tempo: escrevia no `localStorage` a cada quadro de um gesto de
redimensionar a janela, e apagava para sempre o tamanho escolhido — voltar a
alargar a janela não trazia o painel de volta ao que era. É a mesma regra que
`useResizableSidebar` já seguia para a largura do painel de mercados.

Fontes de verdade: `src/features/settings/services/theme*.ts` e
`src/features/settings/components/`.

## Testes

- `theme.test.ts` cobre persistência, seleção e atributos de raiz.
- `themeCatalog.test.ts` cobre presets e validade de definições customizadas,
  garante escala de cinza sem matiz nos três neutros nas duas luminosidades e
  fixa as cores oficiais do preset TradingView.
- Arraste, resize e contraste são validações manuais.

## Critérios de aceite

- [ ] Alternar claro/escuro mantém preset e troca variante correta.
- [ ] Escolher preset recolore gráfico sem recriar ou pausar streams.
- [ ] Tema personalizado persiste após reiniciar.
- [ ] Transparência não prejudica legibilidade de texto/preço.
- [ ] Abrir, mover ou redimensionar configurações não gera lag em gráfico/livro.
- [ ] Geometria é restaurada dentro dos limites da tela.
- [ ] Estreitar e alargar a janela do app devolve o painel ao tamanho escolhido.

## Evolução

- Guardar credenciais de providers em armazenamento seguro, nunca `localStorage`.
- Adicionar importação/exportação segura de temas.
