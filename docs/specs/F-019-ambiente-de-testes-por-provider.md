# F-019 — Ambiente de testes por provider

**Status:** em desenvolvimento  
**Última revisão:** 2026-08-08  
**Relaciona-se a:** [F-002](./F-002-providers-binance.md),
[F-003](./F-003-streams-realtime.md),
[F-018](./F-018-cofre-de-credenciais-e-conexoes-privadas.md) e ao
[ADR-0006](../adr/0006-cofre-de-credenciais-por-senha.md)

## Caso de uso

Como trader, quero exercitar a plataforma contra a testnet da corretora — abrir
ordens, ver posições, conferir que o caminho privado funciona — sem que nada
disso toque minha conta real nem meu dinheiro. E quero saber, sem precisar
lembrar, em qual dos dois ambientes estou.

## O que decide o desenho

A testnet da Binance **não é a produção com outro endereço**. É outra bolsa:
outro livro, outros preços, outro motor de casamento, e **credenciais próprias**
— uma chave de produção não autentica lá, e uma chave de testnet não autentica
aqui. Três consequências, e o desenho inteiro sai delas:

1. Uma credencial pertence a um ambiente. Não existe "a mesma conta em teste".
2. Se os dados públicos viessem da produção e as ordens fossem para a testnet,
   uma ordem executaria contra um livro que não é o da tela. O preço de
   execução não bateria com o gráfico, e o operador aprenderia algo falso.
3. O que a testnet mostra **não serve para análise**. O livro é raso, o spread é
   largo e os candles têm buracos.

## Comportamento esperado

### Ambiente é propriedade da conta

- Toda conta de provider declara seu ambiente: **produção** ou **testes**. É
  imutável depois de criada — trocar o ambiente é trocar a credencial, o que já
  é cadastrar outra conta.
- O formulário de credenciais no modal de configurações ganha essa escolha, com
  produção como padrão. A escolha muda o texto de ajuda e o destino da
  validação, e nada mais.
- Contas em ambientes diferentes são **irmãs**. Nada as vincula formalmente, e
  a interface não filtra por provider: a pergunta que ela faz é "há para onde
  trocar", e uma conta de outra corretora responde igual.

### Chaveamento reseta o workspace

- Conectar uma conta de testes coloca a aplicação inteira em ambiente de testes;
  conectar uma de produção a devolve para produção. Não existe estado de
  ambiente independente da conta conectada — **a conexão é o interruptor**.
- **Salvar uma conta nunca a conecta.** Cadastrar uma credencial e escolher em
  qual corretora operar são decisões diferentes, e juntá-las fazia o ambiente
  ativo mudar como efeito colateral de preencher um formulário. Conectar é o
  que valida a credencial, então nada se perde: só muda de momento.
- Um botão no cabeçalho abre o **seletor de contas**, em vez de alternar para a
  conta irmã às cegas. Com uma conta de spot e uma de futuros na testnet, "o
  outro ambiente" nomeia duas credenciais, e escolher pelo operador é como se
  conecta a errada. Sem nenhuma conta do outro ambiente, o botão leva ao
  cadastro em vez de desaparecer sem explicação.
- **Trocar de ambiente fecha todas as abas e reconstrói o workspace do zero.**
  Nenhuma aba sobrevive à troca; nenhuma aba lembra de qual ambiente veio. Os
  candles não são remendados: a série é descartada e refeita com o streaming do
  ambiente novo.
- **A troca é sempre confirmada pelo usuário**, com o aviso de que o workspace
  será resetado — não só quando há posição aberta. O reset destrói trabalho
  (abas montadas, intervalos escolhidos, indicadores configurados nelas), e
  destruir trabalho sem perguntar é errado mesmo quando não há dinheiro em jogo.
- Cancelar a confirmação **não deixa rastro**: nem conexão derrubada, nem aba
  fechada, nem stream reaberto. Ou tudo acontece, ou nada aconteceu.
- O que estava aberto na corretora **continua aberto** no ambiente que o
  originou. A plataforma apenas deixa de olhar para ele.

**Por que reset total e não migração.** A alternativa — manter as abas e trocar
a fonte de dados debaixo delas — parece mais gentil e é uma armadilha. Ela
obriga a responder o que fazer com uma aba apontando para um par que não existe
no outro ambiente, com um intervalo sem histórico lá, com indicadores calculados
sobre uma série que vai sumir. **O reset faz essas perguntas desaparecerem em
vez de respondê-las uma a uma.** Um estado que não existe não pode ficar
inconsistente.

É também o que resolve o catálogo de símbolos: ele é **sempre buscado** do
ambiente ativo na reconstrução, nunca embutido e nunca herdado. Não há lista
fixa para envelhecer em silêncio, e não há aba sobrevivente para apontar para um
par ausente.

### Uma porta só, guardada

Existem quatro caminhos até o mesmo pedido de conexão: o seletor do cabeçalho,
o painel de provedores nas configurações, o "tentar de novo" oferecido após uma
falha, e a reconexão automática logo depois de destravar o cofre.

**Todos perguntam ao mesmo portão** antes de conectar, e o portão compara o
ambiente da conta com o que o gráfico está desenhando. Quem recebe "não" não
conecta: entrega o pedido a quem sabe confirmar e reconstruir.

Isso não é cerimônia. A proteção nasceu num caminho só, e conectar pelo painel
de configurações — que não tinha guarda — deixava uma credencial de produção
ligada sob um gráfico de testnet, sem badge, com as duas metades parecendo
saudáveis vistas isoladamente. **Uma invariante guardada num caminho não é uma
invariante.**

Trocar entre duas contas do **mesmo** ambiente não passa pelo portão: muda qual
credencial está validada, não de onde vêm os candles, e não pode custar o
workspace do operador.

### O que a Binance permite, e o que é lei

A testnet de spot e a de futuros da Binance são cadastros separados, e uma
chave só vale na sua. Portanto **uma credencial de teste declara exatamente um
mercado** — no formulário os mercados viram escolha única sob "Testes", e o
contrato recusa um rascunho com os dois.

Isso é fato **daquela corretora**, não de ambientes de teste. A regra vive numa
tabela de capacidades por provider, não como afirmação do contrato: escrita como
lei universal, ela recusaria uma credencial válida da primeira corretora com
testnet única, e a correção seria transformá-la em exceção. Em produção uma
chave da Binance cobre os dois mercados, e o formulário continua permitindo.

### O que muda de endereço

| Superfície | Produção | Testes |
| --- | --- | --- |
| Candles e livro (público) | endpoints atuais | endpoints da testnet |
| Catálogo de símbolos | produção | testnet — **o conjunto de pares é menor** |
| Validação e conta (privado) | produção | testnet |
| Ordens, quando existirem | produção | testnet |

### Como o operador sabe onde está

- **Badge sobre o gráfico**, presente **somente** em ambiente de testes. Em
  produção não há aviso algum: o silêncio é o estado normal, e um aviso
  permanente vira invisível pelo hábito justamente quando precisa ser lido.
- **A boleta muda de cor** em ambiente de testes. É onde o erro custa dinheiro,
  e é a última superfície que o operador olha antes de confirmar.
- **Aviso de dados sintéticos** junto ao badge: os preços e o livro em teste não
  são o mercado. Ele precisa ser dispensável por interação, e reaparecer a cada
  entrada no ambiente de testes — não uma vez na vida.
- Nenhum desses avisos pode entrar no caminho quente de render. O badge é
  estado de baixa frequência: muda quando a conexão muda, nunca por tick
  ([ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)).

## Escopo do incremento

**Entra:** o campo de ambiente no contrato de provider e no cofre; os endpoints
de testnet da Binance; o chaveamento; o badge; a coloração da boleta; o aviso de
dados sintéticos.

**Não entra:** execução de ordem — a boleta continua sendo andaime até a F-020.
O ambiente precisa estar pronto **antes** dela, para que a primeira ordem real
do projeto possa ser disparada contra a testnet.

**Genérico no contrato, Binance na implementação.** O campo de ambiente entra
no contrato de provider desde já, porque o cofre vai acumular contas gravadas e
migrar dado cifrado depois custa caro. Só a Binance ganha endpoints de testnet
agora; Bybit, OKX e Gate.io herdam o modelo quando chegarem.

## Implementação e decisões de arquitetura

### Onde o ambiente precisa viajar

`endpointsFor(market)` hoje resolve um `Record<Market, BinanceEndpoints>`
constante, e é chamado em quatro pontos de
`electron/utility/market-data/providers/binance/provider.ts`. Ele passa a
receber o ambiente: `endpointsFor(market, environment)`.

O ambiente precisa alcançar dois lugares que hoje não o conhecem:

1. **O processo utilitário de market data**, que abre os streams públicos.
   `MarketSelection` é o que viaja até lá, e o ambiente entra **dentro** dela.
   A alternativa considerada era mantê-lo ao lado, como contexto de sessão, e
   ela foi descartada: `marketSelectionFingerprint` e `drawingKey` são
   derivados da seleção, e um ambiente de fora obrigaria os dois — e todo
   futuro derivado — a saber desta feature para não confundir os dois BTCUSDT.
   Dentro da seleção, eles distinguem os ambientes sem mudar uma linha. Os
   pedidos que não carregam seleção (catálogo e símbolos) recebem o ambiente
   como parâmetro próprio, ao lado do provider.
2. **O provider de conta no processo principal**, cujos dois endpoints de
   validação estão hoje literais em `binanceAccountProvider.ts`.

### Endpoints da testnet

Conferidos na documentação oficial da Binance em **2026-08-08**. Endereços de
testnet mudam com mais frequência que os de produção, e um endpoint errado aqui
se manifesta como "credencial inválida", que é a mensagem que mais engana — o
rascunho original desta spec apontava para `testnet.binancefuture.com`, que os
próprios docs da Binance já substituíram.

| | Spot | Futuros |
| --- | --- | --- |
| REST | `testnet.binance.vision/api/v3` | `demo-fapi.binance.com/fapi/v1` |
| WebSocket | `stream.testnet.binance.vision/ws` | `demo-fstream.binance.com/ws` |

A fonte de verdade é
`electron/utility/market-data/providers/binance/endpoints.ts`, que escreve os
quatro conjuntos por extenso em vez de derivar a testnet da produção por
substituição de string.

### Como o reset é executado

As abas **não são persistidas** — `useWorkspaceTabs` as mantém em memória. O
reset não é uma migração de dado guardado: é fechar cada aba pelo caminho normal
(`close`) e chamar `bootstrap()` outra vez, já sob o ambiente novo. O caminho de
saída é o mesmo que o usuário exercita fechando abas à mão, e é isso que o torna
confiável.

A ordem importa, e é a que impede stream órfão:

1. Confirmação do usuário. Antes disso, nada acontece.
2. Conectar a conta irmã — o que já derruba a conexão anterior e troca o
   ambiente ativo, porque o ambiente é derivado da conta conectada.
3. Fechar todas as abas — cada uma desfaz suas próprias assinaturas.
4. `bootstrap()` já sob o ambiente novo.

**Conectar antes de fechar, e não depois.** A ordem óbvia seria destruir o
workspace primeiro e reconstruí-lo no ambiente novo, mas uma chave de testnet
errada é um desfecho comum, não um caso de borda: resetar antes gastaria as
abas do operador só para descobrir que a credencial não presta. Conectando
primeiro, uma falha deixa tudo de pé e a troca simplesmente não aconteceu.

### O que o reset não resolve sozinho

- **Respostas em voo durante o fechamento das abas.** Uma página pedida antes do
  reset pode chegar depois dele. O guarda já existe:
  `stillOwns(tab, generation)` em `useWorkspaceTabs`, e
  `historyGeneration`/`selectionFingerprint` em
  `MarketChart.vue`. Fechar a aba invalida a geração, então a resposta é
  descartada — mas isso precisa ser **testado**, não presumido. Uma página da
  produção aplicada num gráfico de testes seria pior que um erro: seria um
  gráfico plausível e errado.
- **Os desenhos, que sobrevivem ao reset de propósito.** Eles estão em disco,
  chaveados por `drawingKey` em `drawingStore.ts` — fechar a aba não os apaga,
  e não deve apagar: uma linha de tendência custou uma decisão e dois cliques.
  Mas o mesmo `BTCUSDT` tem preços diferentes em cada ambiente, então **o
  ambiente entra na chave**, que passa a ser
  `${provider}:${environment}:${market}:${symbol}`. Sem isso, entrar na testnet
  carrega desenhos da produção sobre uma escala que não é a deles. É a única
  coisa que atravessa a troca, e por isso a única que precisa ser escopada.
  Chaves de três partes, gravadas antes desta feature, são migradas na leitura
  para o ambiente de produção — nenhum desenho existente desaparece.

### O cofre

Uma conta de testes é uma credencial como qualquer outra: fica cifrada no mesmo
cofre, sob a mesma senha. Não há relaxamento de segurança por ser "só teste" —
uma chave de testnet ainda identifica o operador na corretora, e tratar
credencial de teste com menos cuidado é como o hábito errado se instala.

## Critérios de aceite

- [ ] O formulário de credenciais permite escolher o ambiente, com produção como
      padrão, e o ambiente escolhido é imutável depois de salvo.
- [ ] Uma credencial de produção falha ao validar como testes, e vice-versa, com
      a causa nomeada — não um "falhou" genérico (F-018, RV-028).
- [ ] Conectar uma conta de testes reabre candles, livro e catálogo contra os
      endpoints da testnet; conectar uma de produção os devolve.
- [ ] O botão de chaveamento alterna para a conta irmã; sem irmã, leva ao
      cadastro dela.
- [ ] **Toda** troca de ambiente pede confirmação, com o aviso de reset do
      workspace — independente de haver posição aberta.
- [ ] Confirmar fecha todas as abas e reconstrói o workspace no ambiente novo.
- [ ] Cancelar não altera nada: mesmas abas, mesma conexão, mesmos streams.
- [ ] O catálogo de símbolos exibido após a troca é o do ambiente ativo.
- [ ] O badge aparece sobre o gráfico **somente** em ambiente de testes, e a
      boleta muda de cor no mesmo estado.
- [ ] O aviso de dados sintéticos aparece a cada entrada no ambiente de testes e
      pode ser dispensado.
- [ ] Um desenho traçado em produção não aparece no gráfico de testes do mesmo
      par, e vice-versa — e **continua lá** ao voltar para produção.
- [ ] Trocar de ambiente não deixa stream órfão no processo utilitário: medido
      pela contagem de assinaturas antes e depois.
- [ ] Salvar uma conta **não** altera a conexão ativa nem o ambiente, mesmo com
      outra conta conectada.
- [ ] Conectar do painel de configurações passa pela mesma confirmação que o
      seletor do cabeçalho.
- [ ] Trocar entre duas contas do mesmo ambiente **não** pede confirmação nem
      fecha abas.
- [ ] Um rascunho de teste com os dois mercados é recusado na fronteira de IPC.
- [ ] Chavear não produz long task acima de 50ms com o gráfico e o livro ativos.

## Testes

### Domínio (unitário, sem Electron)

| Cenário | Esperado |
| --- | --- |
| `endpointsFor('spot', 'test')` e `('futures', 'test')` | URLs da testnet, distintas das de produção nos três campos |
| `endpointsFor(m, 'live')` para todo mercado | Idêntico ao mapa atual — a mudança não move produção |
| `drawingKey` para o mesmo símbolo nos dois ambientes | Chaves **diferentes** |
| `drawingKey` em produção, antes e depois desta feature | Chave preservada, ou migração explícita — um desenho existente não pode sumir |
| Predicado de conta irmã: nenhuma, uma, e duas do mesmo ambiente | Encontra a do ambiente oposto, de qualquer provider |
| `providerCapabilities('binance').coversBothMarkets` | `true` em produção, `false` em teste |
| `isProviderId` com um provider desconhecido | Recusado, para o cofre não contrabandear um |
| Portão: conta do outro ambiente, do mesmo, e inexistente | Barra só a do outro ambiente, e guarda qual |

### Contrato (`shared/`)

| Cenário | Esperado |
| --- | --- |
| `StartStreamRequest` sem ambiente | Rejeitado pelo validador |
| Ambiente com valor fora do domínio (`'prod'`, `''`, `null`) | Rejeitado; `hasExactKeys` não deixa passar chave extra |
| Draft de conta tentando mudar o ambiente de uma conta existente | Recusado, com causa nomeada |
| Snapshot de segurança | Expõe o ambiente de cada conta e o ambiente ativo |

### Reset do workspace (`useWorkspaceTabs`)

Este é o núcleo desta feature e o que mais pode dar errado em silêncio.

| Cenário | Esperado |
| --- | --- |
| Trocar com 4 abas abertas | Todas fechadas; workspace reconstruído; contagem final igual à do `bootstrap()` limpo |
| Trocar com 1 aba | Mesmo caminho — sem atalho para o caso pequeno |
| **Cancelar** a confirmação | Zero efeito colateral: mesmas abas, mesma conexão, nenhum `close`, nenhum `startStream` |
| Cada aba fechada | Desfaz suas próprias assinaturas — contagem no coordenador volta a zero antes do reabrir |
| Resposta de candles em voo chegando **após** o fechamento | Descartada por `stillOwns`; não toca série nem estado |
| Resposta de catálogo do ambiente antigo chegando após a troca | Descartada; o catálogo exibido é o do ambiente novo |
| Falha ao conectar a conta irmã (chave inválida, testnet fora do ar) | Estado terminal legível, não "Conectando" eterno; sem aba órfã pendurada |
| Trocar duas vezes seguidas, rápido | A segunda troca não interfere na primeira; sem stream órfão ao final |

### Interface

| Cenário | Esperado |
| --- | --- |
| Ambiente de produção | Sem badge, boleta com as cores normais |
| Ambiente de testes | Badge sobre o gráfico e boleta recolorida, simultâneos |
| Entrar em testes, dispensar o aviso, sair e entrar de novo | O aviso **reaparece** |
| Badge durante fluxo de ticks | Não re-renderiza por tick — muda só na troca de conexão ([ADR-0003](../adr/0003-renderizacao-imperativa-do-grafico.md)) |
| Diálogo de confirmação | Diz que as abas serão fechadas, e para qual ambiente vai |

### Manual, com chave real de testnet

Cadastrar a conta de testes, conectar, confirmar o reset, verificar que o
gráfico e o livro são da testnet, traçar um desenho, voltar para produção e
confirmar que o gráfico real retorna **e que o desenho da testnet não veio
junto** — depois voltar para testes e confirmar que ele ainda está lá.

**Fontes de verdade:** `shared/contracts/security.ts`,
`shared/contracts/desktop.ts`,
`electron/utility/market-data/providers/binance/endpoints.ts`,
`electron/main/providers/binance/binanceAccountProvider.ts`,
`src/features/workspace/composables/useWorkspaceTabs.ts`,
`src/features/drawings/services/drawingStore.ts`.
