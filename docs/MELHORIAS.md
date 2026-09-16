# Melhorias do projeto

Levantamento feito em 16/09/2026 sobre o estado do repositório no commit `39984a5`.
A primeira seção é o que **já foi corrigido**; o resto é roadmap, em ordem de
prioridade.

---

## ✅ Feito nesta rodada

### Modo Infinito (novo modo de jogo)

Cada jogador mantém no máximo 3 marcas no tabuleiro. Ao colocar a 4ª, a mais
antiga **dele** some. Detalhes em [MODOS-DE-JOGO.md](MODOS-DE-JOGO.md).

- `game/modos.js` — módulo novo com as regras puras dos dois modos.
- Seleção de modo na home e via `?modo=` na URL; badge do modo dentro da sala.
- A marca prestes a sumir pisca com borda dourada; a que sai tem animação própria.
- `modo` gravado em cada partida, permitindo `/ranking?modo=infinito`.

### Correções de segurança

| Problema | O que acontecia | Correção |
|---|---|---|
| **XSS no chat, na lista de jogadores e no ranking** | O cliente montava HTML com `innerHTML` usando nome e mensagem digitados pelo jogador. Um nome como `<img src=x onerror=...>` executava script em quem estivesse na sala. | Todo dado de jogador agora vai por `textContent` / `createElement`. |
| **Vitória declarada pelo cliente** | Existia um handler `socket.on('vitoria')` que aceitava `{ salaId, simbolo }` de qualquer cliente e anunciava a vitória + resetava o tabuleiro. Dava para vencer sem jogar. | Handler removido. Vitória só é calculada no servidor, dentro de `jogada`. |
| **Sequestro de assento** | A reconexão era identificada só pelo nome. Entrar numa sala com o nome de um jogador **online** tomava o lugar (e o símbolo) dele. | Só assume o assento se ele estiver `offline`; caso contrário a entrada é recusada. |
| **Nome forjado no chat** | O nome do remetente vinha do payload do cliente, dava para se passar por outro jogador. | O nome vem do assento registrado no servidor. |
| **`escolherInicio` e `reiniciar` sem dono** | Qualquer socket conectado, mesmo fora da sala, podia trocar o turno ou zerar o tabuleiro de uma partida em andamento. | Exige ser jogador da sala; `escolherInicio` só antes da 1ª jogada. |
| **Nome sem validação** | Aceitava string vazia, gigante ou não-string. | `sanitizarNome()`: trim, colapsa espaços, limita a 20 caracteres. |

### Correções de bugs

- **Símbolo duplicado**: o símbolo era escolhido por `jogadores.length === 0 ? 'X' : 'O'`.
  Se o X saísse e alguém entrasse, a sala ficava com dois "O". Agora escolhe o
  símbolo que estiver livre.
- **Turno errado depois de reconectar**: o estado era restaurado reemitindo um
  evento `jogada` por célula ocupada, e o handler do cliente invertia o turno a
  cada um — o jogador voltava com o turno trocado e ouvia um som por célula.
  Substituído por um snapshot único (`estadoSala`).
- **"Empate" no ranking**: o `$group` por vencedor incluía os empates, então
  "Empate" aparecia como se fosse um jogador no topo da lista. Agora é filtrado.
- **Oponente sempre "Jogador"** no histórico local: o cliente não recebia o nome
  do adversário e gravava um placeholder. Agora vem no evento de vitória/empate.
- **Erro de gravação engolido**: `partida.save().then(...)` sem `.catch()` —
  falha do Mongo virava unhandled rejection. Agora tem `try/catch`.
- **Vazamento de memória**: o `Map` de rate limit nunca era limpo (crescia por
  socket, para sempre) e salas criadas por `/nova-sala` mas nunca usadas ficavam
  na memória indefinidamente. Ambos limpos agora.
- **Timer de desconexão órfão**: o timer não era cancelado na reconexão.

### Infraestrutura

- **`npm test` agora existe de verdade** — 18 testes com `node:test`
  (10 de regras, 8 de integração de socket). Antes o script era
  `echo "Error: no test specified" && exit 1`.
- Índices no `Partida` para `vencedor`, `dataPartida` e `modo` — o ranking
  agregava com collection scan a cada fim de partida.
- `/estatisticas` passou a rodar as 5 queries em `Promise.all` em vez de em série.
- `GET /health` para healthcheck de container/orquestrador.
- `npm run dev` usa `node --watch`; `engines: node >=20` declarado.
- `__dirname + '/public/...'` trocado por `path.join` (concatenação de path
  quebra em ambiente misto).

---

## 🔴 Prioridade alta

### 1. Não há autenticação — o ranking é só um campo de texto

O "jogador" é uma string digitada no `prompt()`. Qualquer um pode entrar como
"Lucas" e as vitórias vão para a mesma linha do ranking. Não existe noção de
conta, e não dá para confiar em nada que o ranking diga.

**Caminho sugerido**: identidade persistente por `localStorage` + um id assinado
(cookie httpOnly assinado com `SESSION_SECRET`, que já está no `.env.example` e
não é usado por nada). Login social (GitHub/Google) se a ideia for ranking sério.

### 2. O estado só existe na memória de um processo

Reiniciar o servidor derruba todas as partidas. Rodar duas réplicas quebra o jogo
(cada uma enxerga metade das salas). O `docker-compose` de hoje só funciona com
`replicas: 1`.

**Caminho sugerido**: `@socket.io/redis-adapter` + guardar o estado das salas no
Redis. É o pré-requisito para qualquer escala horizontal.

### 3. Sem cabeçalhos de segurança nem rate limit no HTTP

`helmet` e `express-rate-limit` não estão instalados. As rotas `/ranking`,
`/estatisticas` e `/nova-sala` são abertas — `/nova-sala` em loop enche a memória
de salas (o sweeper de 10 minutos ajuda, mas não impede o pico).

### 4. O `.env` não é lido

Existe `.env.example` documentando `MONGODB_URI`, `SESSION_SECRET`,
`CHAT_RATE_LIMIT`, `LOG_LEVEL` — mas `dotenv` não é dependência e nada carrega o
arquivo. Fora do Docker, quem copiar o `.env.example` vai achar que configurou
algo. Além disso, `CHAT_RATE_LIMIT`, `GAME_RATE_LIMIT`, `SESSION_SECRET` e
`LOG_LEVEL` não são lidos em lugar nenhum do código.

**Caminho sugerido**: `require('dotenv').config()` no topo do `server.js` e usar
as variáveis, ou remover do `.env.example` o que é ficção.

---

## 🟡 Prioridade média

### 5. `server.js` faz coisa demais

~420 linhas com rotas HTTP, handlers de socket, rate limit, persistência e
gerenciamento de salas. `game/modos.js` já tirou as regras de lá; o próximo
passo natural é separar `rooms/` (ciclo de vida das salas), `routes/` e
`sockets/`.

### 6. UX de entrada: dois `prompt()` em sequência

O jogador é recebido por um `prompt()` de sala e outro de nome, sem validação
visual — e um nome vazio recarrega a página. Uma tela de entrada dentro da sala
(nome + modo + botão) resolveria, e ainda permitiria lembrar o nome no
`localStorage` entre partidas.

### 7. Jogar contra o computador

Hoje é preciso ter duas pessoas. Um bot (minimax no clássico; no infinito,
heurística ou busca limitada, já que o jogo não tem estado terminal por empate)
tornaria o projeto utilizável sozinho e seria um bom exercício para o modo novo.

### 8. Espectadores

A 3ª pessoa que entra é recusada com "Sala cheia!". Deixá-la assistir (recebendo
`estadoSala` sem poder jogar) é barato: o estado já é broadcast para a sala.

### 9. Sem placar da série

Cada partida é independente. Um "melhor de 3/5" por sala, com placar no topo,
é o que a maioria das pessoas espera de um jogo assim.

### 10. Acessibilidade

O tabuleiro é uma grade de `<div>` sem papel semântico, sem foco por teclado e
sem `aria-label`. As marcas são emoji (❌/⭕) lidos como "cruz vermelha" por
leitor de tela. No modo Infinito, a marca prestes a sumir é sinalizada **só** por
cor e piscar — sem alternativa textual. Mínimo: `role="grid"`, navegação por
setas, `aria-label` por célula e `prefers-reduced-motion` nas animações.

### 11. Testes de cliente

Os 18 testes cobrem regras e protocolo de socket. O `public/script.js` (render,
XSS, histórico) não tem cobertura nenhuma.

---

## 🟢 Prioridade baixa / arrumação

### 12. Inconsistências na documentação de deploy

`DEPLOY.md` afirma que `railway.dockerfile` foi removido, mas o arquivo continua
no repositório — e usa `node:18` + `npm install --production`, enquanto o
`Dockerfile` usa `node:20` + `npm ci --omit=dev`. Ou apaga, ou atualiza e para
de dizer que foi removido.

### 13. `.gitignore` com lixo

A última linha é `git remote add origin https://github.com/cadiguni/tic-tac-toe.git`
— um comando colado por engano. Inofensivo (ignora um arquivo com esse nome
absurdo), mas é sujeira.

### 14. `docker-compose.yml` sem `depends_on` no serviço `jogo`

O `DEPLOY.md` documenta a solução ("se subir antes do Mongo, rode
`docker compose restart jogo`") em vez de resolver. O `docker-compose.dev.yml`
tem o `depends_on`; o de produção não. Com o `/health` recém-adicionado dá para
usar `healthcheck` + `condition: service_healthy`.

### 15. Credenciais padrão no mongo-express

`admin`/`admin123` como default, com a porta 8081 publicada. Aceitável em
`localhost`, perigoso se esse compose for para um servidor exposto.

### 16. Sem lint nem formatter

Nenhum ESLint/Prettier. O código tem mistura de indentação (4 espaços no
`server.js`, 2 no cliente) e de estilo de aspas.

### 17. Sem shutdown gracioso

Não há handler de `SIGTERM`. O Docker manda SIGTERM, espera 10s e mata — conexões
de socket e a gravação da partida em curso são cortadas no meio.

### 18. Log sem estrutura

`console.log` com emoji em tudo. Em produção, sem timestamp e sem nível, não dá
para filtrar nem agregar. `pino` resolveria (e o `LOG_LEVEL` do `.env.example`
finalmente teria dono).

---

## Ideias de modos futuros

O `game/modos.js` foi escrito para receber variantes. Candidatos:

- **Por tempo** — a variante que também estava na mesa: cada marca vive N
  segundos e some sozinha. Exige timers por célula no servidor e um tick de
  broadcast; a vitória pode acontecer sem ninguém jogar.
- **Gravidade** — a marca cai para a linha mais baixa livre da coluna (Connect 4
  em 3×3).
- **Misère** — quem fizer três em linha **perde**.
- **Tabuleiro 4×4 / 5×5** — exige generalizar `COMBINACOES_VITORIA`, que hoje é
  uma lista fixa de 8 combinações para 3×3.
