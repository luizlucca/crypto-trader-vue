# Fluxo de conexão segura com providers — Design

**Data:** 2026-08-07
**Feature:** F-018 — Cofre de credenciais e conexões privadas de providers

## Objetivo

Completar a jornada entre desbloquear o cofre e estabelecer uma única conexão
privada ativa, sem misturar autenticação local, seleção de conta e validação do
provider. Esta entrega valida a conexão autenticada, mas não consulta saldos,
posições, ordens ou streams privados.

## Decisões aprovadas

- A aplicação continua pública e funcional enquanto o cofre está bloqueado.
- O cofre é desbloqueado antes de qualquer escolha de conta.
- Nenhuma conta é conectada automaticamente apenas por existir no cofre.
- Com zero contas, o fluxo abre Configurações diretamente em Provedores.
- Com uma conta, a aplicação seleciona e valida essa conta automaticamente.
- Com várias contas, o usuário escolhe uma conta antes da validação.
- Existe somente uma conta privada ativa por sessão desbloqueada.
- A escolha não é persistida e é descartada ao bloquear a sessão.
- A boleta só é renderizada quando a conta ativa está `connected`.
- Saldos e demais dados privados pertencem a uma feature posterior.

## Arquitetura

`SecuritySession` permanece responsável por senha, cofre cifrado, conteúdo
desbloqueado, preferências de segurança e ciclo de bloqueio. Um novo
`ProviderConnectionCoordinator`, no processo principal, recebe apenas a conta
escolhida para a tentativa corrente, consulta o `AccountProviderRegistry` e
mantém `activeAccountId`, estado e falha normalizada.

O coordenador nunca persiste seleção ou credenciais. `SecuritySession` localiza
a conta dentro do conteúdo decifrado e entrega o registro ao coordenador sem
expor segredo no preload ou no renderer. Bloqueio, reset e remoção da conta
ativa invalidam a revisão corrente e limpam o coordenador.

O snapshot IPC continua sendo um DTO de baixa frequência e passa a distinguir:

- contas armazenadas e mascaradas;
- identificador da conta ativa;
- estado da conexão ativa;
- falha normalizada da última tentativa.

O renderer pode pedir `connect-account` e `disconnect-account`. Respostas
atrasadas são ignoradas por revisão lógica, impedindo que uma tentativa antiga
sobrescreva uma seleção nova ou uma sessão já bloqueada.

## Fluxos de interface

### Desbloqueio

1. O usuário seleciona **Entrar** e informa a senha pessoal.
2. O processo principal abre o cofre sem validar todas as contas.
3. O renderer avalia somente os resumos mascarados recebidos:
   - zero contas: abre Configurações > Provedores;
   - uma conta: mostra carregamento e solicita `connect-account`;
   - várias contas: abre o seletor de conta.
4. A validação bem-sucedida mostra o toast
   **Conectado à Binance — {apelido}**.
5. Uma falha mostra mensagem normalizada e as ações **Tentar novamente** e
   **Abrir configurações**.

### Esqueci minha senha

O link aparece somente no modo de desbloqueio. Ele abre uma etapa destrutiva
explicando que a senha não pode ser recuperada e que todas as API keys,
secrets, contas e conexões serão removidas. O usuário precisa digitar
`APAGAR`; cancelar não altera o cofre. Após confirmação, o arquivo cifrado é
destruído e a aplicação volta a `setup-required`.

### Cadastro de provider

Configurações > Provedores exibe **Adicionar provedor**. O botão abre um
catálogo declarativo com ícone, nome, descrição e disponibilidade. Binance é a
única opção habilitada nesta entrega; providers futuros podem adicionar um
descritor e um formulário próprio sem alterar o painel de contas.

O formulário Binance é dividido em identificação, mercados, credenciais e
comportamento ao salvar. `validateAndConnect` é uma intenção transitória da
submissão e não uma propriedade persistida da conta. Quando habilitada, uma
gravação bem-sucedida é seguida da tentativa de conexão daquela conta.

### Superfície privada

A boleta não é apenas desabilitada: ela deixa o DOM quando não há conta ativa
conectada. O grid devolve a coluna ao gráfico e aos demais painéis. Candles,
livro, indicadores e desenhos não dependem desse estado e continuam ativos.

## Catálogo de providers

O renderer terá um catálogo tipado independente dos formulários. Cada entrada
declara `id`, nome, descrição, ícone e disponibilidade. O ícone Binance será um
componente local e reutilizável; nenhuma credencial ou lógica de conexão entra
no catálogo visual.

## Erros e segurança

- Credenciais inválidas, permissão, relógio, rede e erro desconhecido mantêm os
  códigos já normalizados no processo principal.
- Mensagens brutas da Binance não atravessam o IPC.
- Senha, chave derivada, API key completa e secret nunca retornam ao renderer.
- Reset exige o literal validado `APAGAR` e remove o cofre inteiro.
- Troca de conta, lock, reset e remoção cancelam logicamente tentativas antigas.
- O fluxo não cria ordens nem consulta saldos nesta entrega.

## Estratégia de testes

- Domínio/contratos: validar novos comandos e snapshots sem campos secretos.
- Processo principal: provar seleção única, descarte no lock, proteção contra
  resposta atrasada e ausência de validação automática no unlock.
- Renderer: provar os caminhos de zero, uma e várias contas.
- Recuperação: provar que confirmação incorreta preserva o cofre e `APAGAR`
  remove todas as contas.
- Providers: provar catálogo genérico e abertura do formulário Binance.
- Workspace: provar que a boleta aparece somente em `connected`.
- Regressão: executar typecheck, lint, testes, build e verificação manual com
  gráfico e livro ativos durante os fluxos de segurança.

## Fora de escopo

- Consulta ou apresentação de saldo.
- Ordens, posições, histórico e streams privados.
- Persistência de conta padrão ou da última conta escolhida.
- Conexões privadas simultâneas com mais de uma conta.
- Providers além da Binance.
