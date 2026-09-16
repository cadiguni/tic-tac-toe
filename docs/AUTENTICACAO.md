# Autenticação

Conta é **opcional**. Quem chega pelo link da sala joga na hora, como convidado;
quem quiser aparecer no ranking cria uma conta.

A decisão de não exigir login foi deliberada: o fluxo central do jogo é mandar o
link da sala para um amigo. Uma tela de cadastro nesse ponto derrubaria a
partida antes dela começar.

| | Convidado | Conta |
|---|---|---|
| Jogar | sim | sim |
| Chat | sim | sim |
| Entra no ranking | **não** | sim |
| Nome | digitado na hora | fixo, o da conta |
| Selo na sala | `convidado` | `✓ conta` |

---

## Como funciona

### Senha

Hash com **scrypt** do `node:crypto` — sem dependência externa e sem compilação
nativa, o que mantém a imagem Docker alpine simples.

```
scrypt$16384$8$1$<salt base64>$<hash base64>
```

Os parâmetros ficam guardados junto do hash, então dá para aumentar o custo no
futuro sem invalidar as senhas já cadastradas. A comparação usa
`crypto.timingSafeEqual`.

Mínimo de 8 caracteres, máximo de 128. Ver [`auth/senha.js`](../auth/senha.js).

### Sessão

Cookie `velha_sessao`, `httpOnly` e `sameSite=lax`, com validade de 30 dias.
O conteúdo é assinado com HMAC-SHA256:

```
<userId>.<expiraEm>.<assinatura>
```

Não há store de sessão no servidor. O cookie é `httpOnly`, então **nenhum
JavaScript do cliente enxerga o token** — inclusive o `public/auth.js`, que só
sabe perguntar "quem sou eu" para `/api/eu`.

Ver [`auth/sessao.js`](../auth/sessao.js).

### Identidade dentro da sala

O Socket.IO resolve a identidade **no handshake**, lendo o mesmo cookie das
rotas HTTP:

```js
io.use(async (socket, next) => {
  socket.data.conta = await usuarioDoCookie(socket.handshake.headers.cookie);
  next();
});
```

Se há conta, o nome do jogador vem dela e o `nome` mandado pelo cliente é
ignorado. Se não há, vale o nome digitado, sanitizado.

> Consequência importante: login e logout **só valem para conexões novas**. Por
> isso o cliente reconecta o socket (`disconnect()` + `connect()`) antes de
> entrar na sala — senão o servidor continuaria usando a identidade do momento
> em que a página carregou.

---

## Ranking

Cada partida grava `vencedorId` (a conta que venceu) ou `null` (convidado ou
empate). O ranking filtra por `vencedorId != null`:

```js
{ $match: { vencedorId: { $ne: null } } }
```

Duas consequências:

- Convidados nunca entram no ranking, sem precisar de nenhuma verificação extra.
- As partidas gravadas **antes** da autenticação existir também têm `null` ali,
  então saíram do ranking sozinhas — **não houve script de migração e nenhum
  dado foi apagado**. Elas continuam contando em `/estatisticas`.

---

## Impersonação

Um convidado não pode usar o nome de uma conta registrada:

```
Esse nome pertence a uma conta. Faça login ou escolha outro.
```

Além disso, contas aparecem com selo `✓ conta` na lista de jogadores e um `✓` no
chat, para que dê para distinguir na hora.

**Trade-off assumido**: essa mensagem confirma que um usuário existe, ou seja,
permite enumerar nomes cadastrados. Para um jogo isso é aceitável, e a
alternativa (mensagem genérica) deixaria o jogador sem entender por que o nome
foi recusado. Não há e-mail associado à conta, então a enumeração não abre porta
para nada além de descobrir apelidos.

---

## Proteções

| Ataque | Proteção |
|---|---|
| Força bruta de senha | 10 tentativas por IP a cada 15 min em `/api/login` e `/api/registrar` |
| Enumeração por tempo de resposta | Login inexistente roda um scrypt descartável, gastando o mesmo tempo |
| Enumeração por mensagem | "Usuário ou senha inválidos" nos dois casos |
| Token forjado ou esticado | HMAC sobre `userId` **e** validade |
| Roubo de token por XSS | Cookie `httpOnly` |
| CSRF | `sameSite=lax` |
| Payload gigante | `express.json({ limit: '10kb' })` |

---

## Rotas

| Método | Rota | Corpo | Resposta |
|---|---|---|---|
| POST | `/api/registrar` | `{ usuario, senha }` | `201 { usuario }` e cookie |
| POST | `/api/login` | `{ usuario, senha }` | `200 { usuario }` e cookie |
| POST | `/api/logout` | — | `200 { ok: true }`, limpa o cookie |
| GET | `/api/eu` | — | `{ usuario }` ou `{ usuario: null }` |

Regras do nome de usuário: 3 a 20 caracteres, apenas `a-z A-Z 0-9 . _ -`.
É guardado em minúsculas para o login, e o `nomeExibicao` preserva como foi
digitado.

---

## Configuração

```bash
SESSION_SECRET=<string longa e aleatória>   # obrigatório em produção
COOKIE_SECURE=true                          # só com HTTPS
TRUST_PROXY=true                            # se estiver atrás de proxy reverso
```

`SESSION_SECRET` é **obrigatório** quando `NODE_ENV=production` — sem ele o
servidor se recusa a subir, porque um segredo gerado a cada boot derrubaria
todas as sessões a cada deploy. Em desenvolvimento, um segredo temporário é
gerado com um aviso no console.

Gerar um:

```bash
openssl rand -hex 32
```

`COOKIE_SECURE` fica **desligado por padrão, inclusive em produção**. É proposital:
este projeto também roda em rede local sobre HTTP puro (o servidor até imprime o
IP da LAN no boot), e `Secure` quebraria o login sem dar nenhuma pista do motivo.
**Ligue quando servir por HTTPS.**

`TRUST_PROXY` precisa estar ligado atrás de nginx/Traefik/Cloudflare, senão o
rate limit por IP enxerga o IP do proxy e limita todo mundo junto.

---

## O que não existe (ainda)

- **Recuperação de senha** — não há e-mail cadastrado. Senha perdida é conta
  perdida.
- **Trocar senha ou nome de exibição.**
- **Revogar uma sessão específica** — como não há store no servidor, a única
  forma de invalidar tokens antes do vencimento é trocar o `SESSION_SECRET`, o
  que derruba todo mundo.
- **Verificação de e-mail, 2FA, OAuth.**

Está tudo em [MELHORIAS.md](MELHORIAS.md).
