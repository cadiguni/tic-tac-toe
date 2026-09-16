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

## Comandos

```bash
npm start            # sobe o servidor (porta 3000)
npm run dev          # o mesmo, com --watch (reinicia ao salvar)
npm test             # node:test — 18 testes, sem precisar de MongoDB

docker compose up -d --build                          # app + mongo + mongo-express
docker compose -f docker-compose.dev.yml up -d --build  # dev com bind mount
```

Os testes não precisam de banco: `test/jogo.test.js` stuba `db/db.js` e
`models/Partida.js` via `require.cache` antes de carregar `server.js`.
O servidor sim: sem MongoDB acessível, `db/db.js` chama `process.exit(1)`.

## Arquitetura

```
server.js          # rotas HTTP + todos os handlers de Socket.IO + estado das salas
game/modos.js      # regras puras de jogo (sem Express/Socket/Mongo) — testável isolado
db/db.js           # conexão Mongoose
models/Partida.js  # schema do histórico de partidas
public/            # cliente: home.html, index.html (sala), ranking.html, script.js, style.css
test/              # node:test
```

### Estado do servidor

Salas vivem **em memória**, no objeto `salas` de [server.js](server.js):

```js
salas[salaId] = {
  jogadores: [{ id, nome, simbolo, online, timerRemocao, ultimaAtividade }],
  criadaEm: Date,
  jogo: { modo, tabuleiro, turno, finalizada, totalJogadas, ordemMarcas }
}
```

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

## Convenções

- **Código e comentários em português.** Nomes de variáveis, eventos e funções
  seguem o domínio em português (`jogada`, `sala`, `tabuleiro`, `vencedor`).
- **Nunca confie no cliente.** Toda validação de jogada, turno e identidade
  acontece no servidor. O nome do remetente no chat vem do assento no servidor,
  não do payload — veja o handler de `mensagemChat`.
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
- A rota `/ranking` responde HTML ou JSON dependendo do header `Accept`. Ao
  consumir por `fetch`, mande `Accept: application/json` explicitamente.
- No `disconnect` o jogador não é removido na hora: fica 30s offline segurando o
  assento para permitir reconexão (`MS_ATE_REMOVER_JOGADOR`).

## O que está pendente

Bugs conhecidos, dívidas e o roadmap estão em
[docs/MELHORIAS.md](docs/MELHORIAS.md). Antes de propor uma melhoria, confira se
ela já não está listada lá.
