# F-018 — Cofre de credenciais e conexões privadas de providers

**Status:** implementada  
**Última revisão:** 2026-08-07  
**Relaciona-se a:** [F-002](./F-002-providers-binance.md),
[F-009](./F-009-temas-configuracoes.md),
[F-012](./F-012-arquitetura-modular.md) e
[ADR-0006](../adr/0006-cofre-de-credenciais-por-senha.md)

## Caso de uso

Como trader, quero cadastrar várias contas em providers como Binance e manter
as credenciais protegidas por minha senha pessoal, para usar recursos privados
somente depois de desbloquear a plataforma, sem interromper a análise pública
de mercado.

## Escopo do incremento

Esta entrega cria o cofre local, o ciclo de bloqueio/desbloqueio, a tela de
providers, as preferências de segurança e a validação autenticada de leitura.
Ela **não** envia ou cancela ordens, não lê saldo, posições ou histórico, e não
abre streams privados. A boleta e os painéis privados continuam andaimes até a
feature de execução; esta F-018 apenas entrega o guarda comum que eles deverão
consultar antes de qualquer chamada autenticada.

## Comportamento esperado

### Cofre e senha

- Sem cofre, a aplicação começa em `setup-required`: dados públicos, temas,
  gráfico, livro e desenhos permanecem disponíveis; nenhuma conta está
  conectada.
- O primeiro acesso a **Entrar** ou **Configurações > Provedores** pede o
  cadastro de uma senha pessoal e sua confirmação.
- A senha aceita de 8 a 128 caracteres e exige ao menos uma letra maiúscula,
  uma minúscula, um número e um símbolo. Ela não é aparada, normalizada,
  registrada em log nem persistida.
- Depois de criado, o cofre sempre começa bloqueado ao abrir a aplicação. A
  senha correta desbloqueia apenas a sessão atual.
- Trocar senha exige a senha atual, cifra novamente o cofre com novo `salt` e
  só confirma depois da escrita atômica bem-sucedida.
- Esqueci minha senha inicia um fluxo destrutivo: após confirmação explícita,
  remove o cofre e todas as contas. Não há recuperação alternativa.
- API key, secret, senha, chave derivada e conteúdo decifrado nunca são
  escritos em `localStorage`, fonte, telemetria, erros ou logs.

### Contas e providers

- O modelo suporta várias contas por provider desde a primeira versão. Cada
  conta tem identificador estável, apelido, provider, mercados habilitados e
  credenciais próprias.
- A primeira implementação visual é Binance, com API key e secret HMAC. A
  conta pode habilitar Spot, Futures ou ambos.
- O painel mostra somente o apelido, provider, mercados e sufixo mascarado da
  API key; o secret nunca volta ao renderer. Editar uma credencial pede o valor
  novamente.
- Salvar uma conta cifra o novo documento e inicia imediatamente uma validação
  de leitura em cada mercado habilitado, sem criar ordem, transformar saldo em
  DTO ou iniciar stream privado. Uma falha de credencial, permissão ou rede é
  exibida como estado da conta e permite corrigi-la depois; a mensagem bruta
  do provider não atravessa o IPC.
- **Entrar** desbloqueia o cofre e valida as contas habilitadas com concorrência
  limitada. Cada conta informa `desconectada`, `conectando`, `conectada` ou
  `falhou`; `conectada` significa "validada nesta sessão", não um stream
  privado aberto.
- **Bloquear** encerra as conexões privadas de validação, descarta o material
  sensível em memória e devolve todas as contas a `desconectada`. O modo
  público continua funcionando.

### Preferências de bloqueio

Em **Configurações > Geral > Segurança e sessão**, mesmo com o cofre bloqueado,
o usuário pode configurar:

- bloquear ao minimizar a janela;
- bloquear ao suspender ou bloquear a sessão do sistema quando a plataforma
  disponibilizar esse evento;
- tempo de inatividade: nunca, 1, 5, 15, 30, 60 ou 120 minutos;
- ação do botão de fechar: encerrar a aplicação e bloquear, ou bloquear e
  minimizar a janela.

Os padrões são bloquear ao minimizar, bloquear ao suspender/bloquear a sessão,
15 minutos de inatividade e encerrar/bloquear ao fechar. Mesmo que o usuário
opte por não bloquear ao minimizar ou desative o tempo, encerrar o processo
sempre descarta a sessão. Em sistemas que não informam bloqueio de tela — caso
possível no Linux — a preferência é exibida como indisponível para esse gatilho;
minimização, suspensão e inatividade continuam válidos.

## Implementação e decisões de arquitetura

### Um cofre por senha, não um segredo dependente do SO

O processo principal cria `credentials.v1.enc` dentro de `app.getPath('userData')`.
O arquivo não possui campos secretos em claro:

```ts
interface EncryptedCredentialVaultV1 {
  version: 1
  kdf: {
    name: 'scrypt'
    N: 32_768
    r: 8
    p: 1
    salt: string // base64, 16 bytes aleatórios
  }
  cipher: {
    name: 'aes-256-gcm'
    iv: string // base64, 12 bytes aleatórios por escrita
    ciphertext: string // base64
    authTag: string // base64, 16 bytes
  }
}
```

`scrypt` assíncrono deriva uma chave de 32 bytes e AES-256-GCM garante
confidencialidade e autenticidade do documento. O arquivo temporário recebe
permissão `0600` em sistemas POSIX, é sincronizado e renomeado para o destino
somente ao final. Uma falha, tag inválida ou senha errada não substitui o
arquivo existente.

`safeStorage` não é usado como raiz do cofre: em Linux ele pode escolher
`basic_text` sem um serviço de segredos, o que não satisfaz a proibição de
armazenamento desprotegido. Ele poderá ser avaliado futuramente apenas como
camada adicional, nunca como alternativa à cifra pela senha.

O conteúdo cifrado é um documento versionado com contas. O processo principal
retém a chave derivada e o documento decifrado apenas enquanto a sessão está
desbloqueada; ao bloquear, buffers sensíveis e referências são descartados. As
limitações de limpeza de memória do JavaScript são reconhecidas, mas nenhum
segredo é copiado ao renderer nem ao processo de dados em tempo real.

### Fronteiras de processo e contratos

`shared/contracts/security.ts` reúne os DTOs planos, canais e validadores. A
API exposta pelo preload permite consultar o estado, desbloquear, bloquear,
trocar/redefinir senha, gerir contas mascaradas e editar preferências; nenhuma
operação retorna uma credencial.

`electron/main/security/` contém a criptografia, o repositório em disco, a
sessão, o temporizador de inatividade, IPC e ciclo de vida. Ele é a única
camada que recebe senhas e credenciais pelo IPC e verifica origem, tamanho e
formato antes de qualquer uso. A janela de busca não pode chamar os comandos
de segurança.

`electron/main/providers/` introduz uma interface independente de
`MarketDataProvider`:

```ts
interface AccountProvider<Credentials> {
  readonly id: string
  validateConnection(
    credentials: Credentials,
    markets: readonly Market[],
  ): Promise<readonly AccountMarketValidation[]>
}
```

`BinanceAccountProvider` assina os endpoints privados de leitura de Spot e
Futures e normaliza erros de credencial, permissão, relógio e rede. O provider
de conta não entra no `utilityProcess` de candles/livro, e
`MarketDataProvider` continua público e sem credenciais.

### Interface e estado

`src/features/security/` mantém somente estado de baixo volume: `setup-required`,
`locked`, `unlocking` ou `unlocked`; não participa dos canais imperativos do
livro nem do gráfico. `src/features/providers/` renderiza a lista de contas e
o editor apenas quando a sessão está desbloqueada.

O cabeçalho recebe o botão global **Entrar** ou **Bloquear**. A seção
**Provedores** deixa de ser placeholder, enquanto **Geral** ganha o bloco
**Segurança e sessão**. Preferências de bloqueio não são credenciais e são
persistidas/controladas pelo processo principal, para que minimização,
fechamento e inatividade sejam aplicados mesmo se o renderer não estiver
responsivo.

### Isolamento de performance

O cofre não é reativo, não assina streams e não é consultado por candle, livro
ou cursor. Derivação de chave e validação remota ocorrem somente por ação do
usuário no processo principal; validações de várias contas usam limite de duas
requisições simultâneas. O bloqueio por inatividade consulta o estado do
sistema em baixa frequência no processo principal e nunca gera evento por
tick no renderer.

**Fontes de verdade:** `shared/contracts/security.ts`,
`shared/domain/personalPassword.ts`, `electron/main/security/`,
`electron/main/providers/`, `electron/preload/index.ts`,
`src/platform/desktop/security.ts`, `src/features/security/`,
`src/features/providers/` e `src/features/settings/`.

## Testes

- Domínio: regra de senha, serialização de vault, `scrypt`, AES-GCM, alteração
  de senha, autenticação inválida e corrupção/adulteração de arquivo.
- Repositório: escrita atômica, ausência de segredo no arquivo, permissões
  POSIX, leitura de versão inválida e destruição por redefinição de senha.
- Sessão: início bloqueado, lock manual, minimização, suspensão, inatividade,
  ação de fechar e descarte das contas decifradas.
- Contrato IPC/preload: origem confiável, payloads inválidos, limite de campos,
  janela de busca bloqueada e garantia de que respostas não possuem `secret`,
  senha ou documento do vault.
- Binance: fixtures cobrem assinatura HMAC, seleção Spot/Futures, mapeamento de
  resposta e erro. Um teste ao vivo será opt-in, usa variáveis de ambiente e
  nunca imprime credenciais.
- Renderer: diálogos de cadastro/desbloqueio, lista mascarada, estados por
  conta, preferências e guarda visual dos recursos privados.
- Manual: com gráfico, livro e oito indicadores ativos, cadastrar/desbloquear
  e bloquear não pode criar *long task* acima de 50 ms no renderer nem pausar
  os streams públicos.

## Critérios de aceite

- [x] A aplicação inicia sem conta privada conectada e os recursos públicos
      continuam disponíveis bloqueados.
- [x] Só uma senha válida que obedece à política cria ou desbloqueia o cofre.
- [x] O arquivo em disco, `localStorage`, logs e IPC de resposta não expõem API
      key, secret, senha ou chave derivada em texto simples.
- [x] Alterar a senha recifra todas as contas; redefini-la remove todas elas.
- [x] É possível adicionar, editar, remover e distinguir várias contas Binance
      por apelido, sem expor o secret no renderer.
- [x] Salvar uma conta valida imediatamente os mercados autenticados
      habilitados, sem enviar qualquer ordem.
- [x] Entrar valida as contas habilitadas; Bloquear, timeout, minimização,
      suspensão/bloqueio suportado e fechamento aplicam a política configurada.
- [x] A tela Segurança e sessão persiste os gatilhos e o tempo escolhidos.
- [ ] Nenhum processo de dados públicos recebe credenciais, e gráfico/livro
      continuam atualizando durante os fluxos de segurança.

## Evolução

- Adicionar providers e tipos de credencial próprios (RSA, Ed25519, OAuth ou
  hardware-backed), sem mudar a API da UI.
- Permitir chave de dados separada envolvida pelo cofre por senha, se o volume
  de segredos justificar rotação sem recifrar o documento completo.
- Implementar saldos, posições, histórico, streams de usuário e execução de
  ordens em features separadas, todas protegidas pelo mesmo guarda de sessão.
- Avaliar uma camada complementar no keyring do sistema, sem substituir a
  senha pessoal nem aceitar backend `basic_text`.
