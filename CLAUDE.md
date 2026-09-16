# CLAUDE.md

Guia para o Claude Code trabalhar neste repositório.

## O que é

Jogo da velha multiplayer em tempo real. Node.js + Express + Socket.IO no servidor,
HTML/CSS/JS puro no cliente (sem build step, sem framework), MongoDB para o
histórico de partidas e o ranking global.

Dois modos de jogo:

- **Clássico** — regras tradicionais, pode dar velha.
- **Infinito** — cada jogador mantém no máximo 3 marcas; ao colocar a 4ª, a mais
  antiga dele some. Empate é matematicamente impossível.

Identidade é **opcional**: convidado joga direto pelo link; conta (usuário +
senha) é o que faz a vitória contar no ranking. Ver
[docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

## Comandos

```bash
npm start            # sobe o servidor (porta 3000)
npm run dev          # o mesmo, com --watch (reinicia ao salvar)
npm test             # node:test — 37 testes, sem precisar de MongoDB

npm run up           # sobe app + mongo via Docker, gera SESSION_SECRET, espera /health
npm run up:dev       # o mesmo, em modo desenvolvimento
npm run down         # derruba tudo (-- --tudo apaga também o volume do banco)
```

`scripts/subir.js` é o único caminho recomendado para subir a stack: o
`docker-compose.yml` exige `SESSION_SECRET` e falha de propósito se você chamar
`docker compose up` direto sem ter um `.env`.

Os testes não precisam de banco: `test/jogo.test.js` stuba `db/db.js`,
`models/Partida.js` e `models/Usuario.js` via `require.cache` antes de carregar
`server.js`. O servidor sim: sem MongoDB acessível, `db/db.js` chama
`process.exit(1)`.

## Arquitetura

```
server.js          # rotas HTTP + handlers de Socket.IO + estado das salas
game/modos.js      # regras puras de jogo (sem Express/Socket/Mongo) — testável isolado
auth/senha.js      # hash scrypt e verificação — puro, sem I/O
auth/sessao.js     # token HMAC do cookie e parser de cookie — puro, sem I/O
auth/index.js      # resolve o usuário a partir do cookie (usa o model)
auth/rotas.js      # router /api: registrar, login, logout, eu
db/db.js           # conexão Mongoose
models/Partida.js  # histórico de partidas
models/Usuario.js  # contas
scripts/subir.js   # automação: .env + docker compose + healthcheck + IP da LAN
scripts/parar.js   # derruba as duas stacks
public/            # cliente: home.html, index.html (sala), ranking.html,
                   #          script.js, auth.js, style.css
test/              # node:test
```

### Estado do servidor

Salas vivem **em memória**, no objeto `salas` de [server.js](server.js):

```js
salas[salaId] = {
  jogadores: [{ id, nome, contaId, simbolo, online, timerRemocao, ultimaAtividade }],
  criadaEm: Date,
  jogo: { modo, tabuleiro, turno, finalizada, totalJogadas, ordemMarcas }
}
```

`contaId` é `null` para convidado. É ele que decide se a vitória entra no
ranking e qual selo aparece na sala.

Consequência prática: **o processo é stateful**. Reiniciar o servidor derruba
todas as partidas em andamento, e rodar mais de uma instância não funciona sem
um adapter de Redis para o Socket.IO. O MongoDB só guarda partidas terminadas.

### O contrato cliente/servidor

O servidor é a **única** fonte de verdade. Ele não manda deltas de jogada: manda
o estado inteiro da sala no evento `estadoSala`, e o cliente redesenha tudo a
partir dele (`renderizarTabuleiro`, `renderizarTurno`, `renderizarJogadores`).

Isso é o que mantém reconexão, modo infinito e reinício consistentes. **Ao
adicionar qualquer campo de estado novo, coloque-o em `estadoPublico()`** em vez
de criar um evento novo.

Eventos cliente → servidor: `entrarSala`, `escolherInicio`, `jogada`,
`mensagemChat`, `reiniciar`.
Eventos servidor → cliente: `estadoSala`, `atribuirSimbolo`, `entradaRecusada`,
`mensagem` (erro pontual), `mensagemChat`, `vitoria`, `empate`,
`rankingAtualizado`.

O payload extra de `estadoSala` carrega o que é evento e não estado:
`ultimaJogada`, `removida` (posição que sumiu), `linha` (combinação vencedora),
`reiniciada`.

Rotas de sessão (fora do Socket.IO): `POST /api/registrar`, `POST /api/login`,
`POST /api/logout`, `GET /api/eu`.

## Convenções

- **Código e comentários em português.** Nomes de variáveis, eventos e funções
  seguem o domínio em português (`jogada`, `sala`, `tabuleiro`, `vencedor`).
- **Nunca confie no cliente.** Toda validação de jogada, turno e identidade
  acontece no servidor. O nome do remetente no chat vem do assento no servidor,
  não do payload — veja o handler de `mensagemChat`. Quando há conta, o `nome`
  mandado no `entrarSala` é ignorado.
- **Nada de segredo no cliente.** O token de sessão é `httpOnly`; `public/auth.js`
  nunca o enxerga, só pergunta `GET /api/eu`.
- **Nunca use `innerHTML` com dado de jogador** (nome, mensagem, `_id` vindo do
  ranking). O cliente usa `textContent` e `createElement`; manter assim.
  Ver [public/script.js](public/script.js).
- **Regras de jogo vão em `game/modos.js`**, não em `server.js`. O módulo é puro
  de propósito: é o que permite testar as regras sem subir socket nem banco.
- Sem build step. Não introduza bundler, TypeScript ou framework de front sem
  que isso tenha sido pedido.

## Como adicionar um modo de jogo

Toda a variação de regra passa por [game/modos.js](game/modos.js):

1. Adicione a entrada em `MODOS` com `nome`, `descricao`, `maxMarcas` e
   `permiteEmpate`.
2. Se a mecânica for diferente de "limite de marcas", estenda `aplicarJogada` e
   `marcasExpirando` — são os dois pontos onde o modo influencia o tabuleiro.
3. Adicione um cartão em `public/home.html` (o `value` do radio é o id do modo).
4. Escreva os testes em `test/modos.test.js`.

`normalizarModo()` protege contra id inválido e contra chaves herdadas de
`Object.prototype` — use-a em qualquer ponto que receba modo vindo de fora.

O servidor não precisa mudar: ele lê o modo da sala e delega.

## Armadilhas conhecidas

- `nanoid` está preso na **3.x** porque a 4+ é ESM-only e o projeto é CommonJS.
  Não atualize sem converter o projeto para ESM.
- O modo é definido **na criação da sala**. `?modo=` na URL só tem efeito se a
  sala ainda não existir; quem entra depois joga o modo dela.
- `server.js` chama `server.listen()` no carregamento do módulo e exporta
  `{ app, server, io, salas }` no final — os testes dependem desses exports.
- No `disconnect` o jogador não é removido na hora: fica 30s offline segurando o
  assento para permitir reconexão (`MS_ATE_REMOVER_JOGADOR`).
- **A identidade do socket é resolvida no handshake.** Login ou logout feitos
  depois só valem para uma conexão nova — por isso o cliente faz
  `socket.disconnect(); socket.connect();` antes de entrar na sala. Se você mexer
  no fluxo de entrada, preserve isso.
- Em produção o servidor **não sobe** sem `SESSION_SECRET`. Em dev, gera um
  temporário e avisa no console.
- `/ranking` responde HTML ou JSON conforme o `Accept`. Já quebrou a página de
  ranking uma vez; ao consumir por `fetch`, mande o header.
- **`express.static` usa `{ index: false }` de propósito.** Sem isso ele serve
  `public/index.html` na raiz e sequestra `/`, entregando a tela de jogo no lugar
  da home — foi um bug real. Não remova essa opção.
- A tela de jogo só funciona dentro de `/sala/:id`. O cliente redireciona para a
  home fora disso, e o servidor recusa `entrarSala` sem sala.
- **O jogo só funciona com uma instância.** As salas estão na memória do
  processo; duas réplicas quebram o pareamento. Não ligue autoscaling sem antes
  resolver o adapter de Redis.

## O que está pendente

Bugs conhecidos, dívidas e o roadmap estão em
[docs/MELHORIAS.md](docs/MELHORIAS.md). Antes de propor uma melhoria, confira se
ela já não está listada lá.
