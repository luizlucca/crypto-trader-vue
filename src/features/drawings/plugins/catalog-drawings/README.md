# Catálogo adicional de desenhos — implementação local

Primitive local criada em **2026-08-05** depois de auditar o catálogo público
do projeto
[`deepentropy/lightweight-charts-drawing`](https://github.com/deepentropy/lightweight-charts-drawing).

| | |
| --- | --- |
| Referência auditada | commit `5f2afc335028d6a188ce0a50361056518c84cf72` |
| Data do commit | 2026-05-27 |
| Versão declarada | 0.1.1 |
| API declarada | `lightweight-charts ^5.0.0` |
| API local verificada | `lightweight-charts 5.2.0` |
| Licença declarada | MIT no `package.json`; o repositório não possui arquivo `LICENSE` |

## Resultado do inventário

O README da referência anuncia 68 ferramentas, mas `TOOL_DEFINITIONS`, seu
registro executável, contém **67 ids únicos**. O app já possuía 16 deles e uma
ferramenta própria, `measure`, ausente na referência. Foram então
implementadas localmente as **51 diferenças**, levando o catálogo do app a 68
ferramentas sem instalar o pacote.

As diferenças cobrem linhas, canais, quatro pitchforks, nove ferramentas
Fibonacci, quatro Gann, sete formas, três projeções e dezesseis anotações. A
fonte exata desses ids é `CATALOG_DRAWING_TOOL_IDS`, no domínio; um teste exige
51 ids únicos, e outro percorre e pinta cada um.

## Por que o código da biblioteca não foi incorporado

- São 22,6 mil linhas em 144 arquivos TypeScript dentro de `src/tools`.
- Não há testes automatizados no repositório.
- Há oito commits no histórico público e nenhum release publicado.
- O renderer de referência calcula geometrias e cria arrays durante a pintura.
- O manager adiciona listeners próprios de mouse e duplicaria o ciclo de
  seleção, persistência e repaint já otimizado neste app.
- A conversão usa `timeToCoordinate`, que falha quando uma âncora de 1h não
  coincide com uma barra de 4h; o app resolve isso por interpolação lógica.

Nenhum arquivo ou trecho do projeto de referência foi copiado. O repositório
serviu como inventário funcional e referência visual; as geometrias, o contrato
e a integração foram escritos para a arquitetura deste app.

## Contrato de desempenho

`CatalogDrawing` é uma única `ISeriesPrimitive<Time>` imperativa por desenho.
Ela recebe no máximo quatro pontos lógicos, mantém pane view, renderer e buffer
de coordenadas estáveis, e desenha dentro do canvas do Lightweight Charts. Vue
só conhece estados de baixa frequência — ferramenta ativa, seleção,
visibilidade e contagem.

Durante prévia e arrasto:

1. a primitive existente recebe `updatePoints`;
2. nenhum componente Vue é renderizado;
3. nenhuma primitive é anexada ou removida;
4. o `RepaintPump` agrupa movimentos no próximo frame.

As âncoras persistidas continuam sendo `{ time, price }`. O gerente converte
tempo para índice lógico por busca binária, preservando desenhos ao carregar
histórico e trocar período.

## Limites deliberados desta entrega

Ferramentas de texto usam rótulos iniciais (`Texto`, `Nota` e o preço da
âncora). Editar conteúdo, fonte e alinhamento exige um editor não bloqueante e
um payload versionado na persistência; isso deve ser uma evolução separada,
sem `prompt()` ou outro diálogo síncrono na thread do renderer.

`Path`, `Polyline`, `Brush` e `Highlighter` mantêm o contrato de duas âncoras do
registro executável da referência. Captura livre com dezenas de pontos também
deve ter protocolo próprio, com redução de amostras, para não ampliar o custo
de persistência e repaint sem orçamento mensurado.
