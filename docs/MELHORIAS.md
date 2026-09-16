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

- **`npm test` agora existe de verdade** — 37 testes com `node:test`
  (10 de regras de jogo, 10 de senha/sessão, 17 de integração de socket e
  roteamento), todos sem precisar de MongoDB. Antes o script era
  `echo "Error: no test specified" && exit 1`.
- Índices no `Partida` para `vencedorId`, `dataPartida` e `modo` — o ranking
  agregava com collection scan a cada fim de partida.
- `/estatisticas` passou a rodar as 5 queries em `Promise.all` em vez de em série.
- `GET /health` para healthcheck de container/orquestrador.
- `npm run dev` usa `node --watch`; `engines: node >=20` declarado.
- `__dirname + '/public/...'` trocado por `path.join` (concatenação de path
  quebra em ambiente misto).

### Autenticação (conta opcional)

O ranking era uma string digitada num `prompt()` — qualquer um entrava como
"Lucas" e as vitórias iam para a mesma linha. Agora existe conta de verdade, sem
transformar o login em pedágio para jogar. Detalhes em
[AUTENTICACAO.md](AUTENTICACAO.md).

- Convidado joga na hora pelo link; conta é opcional e dá acesso ao ranking.
- Senha com scrypt (`node:crypto`), sessão em cookie `httpOnly` assinado com HMAC.
- Identidade resolvida no handshake do Socket.IO, a partir do mesmo cookie das
  rotas HTTP — o nome mandado pelo cliente é ignorado quando há conta.
- Ranking passou a filtrar `vencedorId != null`. Convidados ficam de fora, e as
  partidas antigas saíram do ranking sozinhas: **nenhum dado foi apagado e não
  houve migração**.
- Rate limit de 10 tentativas por IP a cada 15 min no login e no cadastro.
- Convidado não pode usar o nome de uma conta; contas têm selo `✓` na sala e no chat.
- Os dois `prompt()` viraram uma tela de entrada de verdade (item 6 da lista
  antiga), que lembra o último nome de convidado usado.
- **Bug encontrado no caminho**: `public/ranking.html` fazia `fetch('/ranking')`
  sem `Accept: application/json`, então recebia HTML e caía sempre no
  "Erro ao carregar ranking" — a página nunca funcionou. Corrigido.
- **XSS restante**: o `ranking.html` ainda montava nomes com `innerHTML`. Era o
  mesmo problema já corrigido no `script.js`, mas nessa página tinha passado
  batido. Agora usa DOM.

### Automação de subida (back + front + banco)

`npm run up` sobe a stack inteira num comando: confere o Docker, gera o
`SESSION_SECRET`, sobe app e banco na ordem certa, espera o `/health` e imprime
o link da rede interna.

- `scripts/subir.js` e `scripts/parar.js` — em Node, não em `.sh`/`.bat`, para
  ter o mesmo comportamento no Windows e no Linux.
- **`docker-compose.yml` estava prestes a quebrar o login**: define
  `NODE_ENV=production`, e o `SESSION_SECRET` recém-tornado obrigatório não era
  passado para o container. Agora é exigido explicitamente pelo compose.
- **A checagem do `SESSION_SECRET` era preguiçosa** — só estourava no primeiro
  login, virando um 500 genérico. A documentação dizia que o servidor não subia
  sem ele, o que era falso. Agora valida no boot (item 14 antigo resolvido junto).
- `depends_on` com `condition: service_healthy` nos dois composes: acabou a
  instrução de "se subir antes do Mongo, reinicie" que o DEPLOY.md dava.
- Healthcheck do app via `/health` e do Mongo via `mongosh ping`.
- **MongoDB não é mais publicado para a rede**: passou de `0.0.0.0:27017` para
  `127.0.0.1:27017`. Antes, testar em rede interna deixava o banco aberto para
  todo mundo na mesma rede, sem autenticação.
- **mongo-express saiu do caminho padrão**: agora está atrás do profile `admin`
  (`npm run painel`) e também só em `127.0.0.1`. As credenciais default
  `admin`/`admin123` continuam ali, mas deixaram de ficar expostas por acidente
  (item 15 antigo mitigado).
- O script detecta o IP real da LAN abrindo um socket UDP e vendo a rota
  escolhida, em vez de chutar entre os adaptadores virtuais de Docker/WSL/Hyper-V.
- `deploy.sh` e `deploy.bat` viraram atalhos para o script único — os menus
  interativos antigos ficariam quebrados com o compose novo.

### Correção: a home nunca era servida

Reportado ao testar em rede interna: abrindo `http://<ip>:3000` aparecia a tela
de **jogo**, sem escolha de modo, com "Sala:" vazio — e dois jogadores que
entravam pelo mesmo link caíam em salas diferentes, ambos como X.

A causa estava no projeto desde antes desta rodada:

```js
app.use(express.static(PUBLIC_DIR));   // serve public/index.html em "/"
...
app.get('/', ...);                     // nunca era alcançado
```

O `express.static` serve `index.html` no diretório raiz por padrão, então `/`
entregava a tela de jogo e a rota da home virava código morto. O efeito em
cascata era o pior:

1. Sem `/sala/:id` na URL, o cliente ficava com `salaId` vazio.
2. O servidor, ao receber sala vazia, **inventava uma sala aleatória por
   jogador** — por isso ninguém se encontrava e os dois eram X.
3. O cliente continuava mandando `salaId: ''` nas jogadas, então o tabuleiro
   nem respondia.

Corrigido em três camadas:

- `express.static(PUBLIC_DIR, { index: false })` — a raiz volta para a home.
- O cliente redireciona para `/` quando a URL não é `/sala/:id`, em vez de
  entrar numa sala fantasma.
- O servidor **recusa** `entrarSala` sem sala, em vez de inventar uma.

Quatro testes de regressão cobrem isso agora, inclusive um que verifica que dois
jogadores na mesma sala recebem símbolos **diferentes**.

> Vale registrar como passou: a verificação anterior conferiu que `/` respondia
> `HTTP 200` com HTML, sem checar **qual** página voltava. Um 200 não prova que a
> página certa foi servida.

### Correção: chat abaixo da dobra no desktop

Reportado ao jogar: o tabuleiro ficava no meio da tela e era preciso rolar a
página para escrever no chat.

A barra lateral só tinha `grid-column: 2` e dependia de auto-posicionamento, o
que empilhava jogadores → chat → ranking → histórico em linhas sucessivas,
jogando o chat para fora da tela. Além disso `#modo-info` não tinha área
nenhuma, e o container estava limitado a 800px num monitor de 1920px.

- Áreas de grid explícitas: o chat agora ocupa três linhas **ao lado** do
  tabuleiro, e os jogadores ficam no topo, junto do status.
- `max-width` de 800px → 1200px no desktop.
- Medido em 1920×1040: o campo de escrever do chat fica em y≈864, dentro da
  primeira tela.
- **Bug pré-existente encontrado junto**: os `grid-area` estavam declarados
  globalmente, fora da media query. No layout de coluna única isso criava
  colunas implícitas e causava **rolagem horizontal no celular** (390px
  renderizava três colunas). Agora todas as áreas estão dentro do bloco de
  desktop.
- Removido `<div id="status">`, markup morto que nenhum código referenciava.

Verificado renderizando de verdade (Edge via playwright-core) em 1920×1040,
1280×800, 820×1180 e 390×844 — não só conferindo o CSS.

---

## 🔴 Prioridade alta

### 1. O estado só existe na memória de um processo

Reiniciar o servidor derruba todas as partidas. Rodar duas réplicas quebra o jogo
(cada uma enxerga metade das salas). O `docker-compose` de hoje só funciona com
`replicas: 1`.

**Caminho sugerido**: `@socket.io/redis-adapter` + guardar o estado das salas no
Redis. É o pré-requisito para qualquer escala horizontal.

### 2. Recuperação de senha não existe

Não há e-mail na conta: senha perdida é conta perdida, sem nenhum caminho de
volta. Também não dá para trocar a senha nem o nome de exibição.

**Caminho sugerido**: campo de e-mail opcional + token de reset com validade
curta. Exige decidir o envio (SMTP, Resend, etc.).

### 3. Sessão não é revogável individualmente

Como não há store no servidor, a única forma de invalidar um token antes dos 30
dias é trocar o `SESSION_SECRET` — o que derruba todas as sessões de todo mundo.
Não há "sair de todos os dispositivos".

**Caminho sugerido**: um campo `tokenVersion` no usuário, incluído na assinatura
e incrementado no "sair de todos". Resolve sem precisar de store.

### 4. Sem cabeçalhos de segurança nem rate limit geral no HTTP

`helmet` e `express-rate-limit` não estão instalados. O rate limit por IP cobre
só `/api/login` e `/api/registrar`. As rotas `/ranking`, `/estatisticas` e
`/nova-sala` são abertas — `/nova-sala` em loop enche a memória de salas (o
sweeper de 10 minutos ajuda, mas não impede o pico).

Sem `helmet` não há CSP, e o projeto tem `<script>` inline nas páginas HTML, o
que exigiria nonce ou mover os scripts para arquivos antes de ligar a CSP.

### 5. O `.env` só é lido no caminho Docker

O `docker compose` lê o `.env` sozinho para interpolar variáveis, então
`npm run up` funciona. Mas rodar `npm start` ou `npm run dev` **direto na
máquina** ignora o arquivo por completo — `dotenv` não é dependência e nada o
carrega. Quem for desenvolver fora do Docker precisa exportar as variáveis na
mão, sem nenhum aviso de que o `.env` está sendo ignorado.

`CHAT_RATE_LIMIT`, `GAME_RATE_LIMIT` e `LOG_LEVEL` continuam não sendo lidos em
lugar nenhum do código, nem no Docker.

**Caminho sugerido**: o Node 22 tem `--env-file-if-exists=.env` embutido, o que
resolve sem dependência nenhuma:

```json
"start": "node --env-file-if-exists=.env server.js",
"dev": "node --env-file-if-exists=.env --watch server.js"
```

Depois, usar as variáveis restantes ou tirar do `.env.example` o que é ficção.

### 6. `server.js` faz coisa demais

~420 linhas com rotas HTTP, handlers de socket, rate limit, persistência e
gerenciamento de salas. `game/modos.js` já tirou as regras de lá; o próximo
passo natural é separar `rooms/` (ciclo de vida das salas), `routes/` e
`sockets/`.

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

### 12. `railway.dockerfile` desatualizado

Usa `node:18` + `npm install --production`, enquanto o `Dockerfile` principal usa
`node:20` + `npm ci --omit=dev`. O Railway consegue usar o Dockerfile principal
direto, então este arquivo provavelmente deveria ser apagado. (O `DEPLOY.md`, que
afirmava falsamente que ele já tinha sido removido, foi reescrito.)

### 13. `.gitignore` com lixo

A última linha é `git remote add origin https://github.com/cadiguni/tic-tac-toe.git`
— um comando colado por engano. Inofensivo (ignora um arquivo com esse nome
absurdo), mas é sujeira.

### 14. Credenciais padrão no mongo-express

`admin`/`admin123` continuam como default. Hoje o serviço só sobe sob demanda
(`npm run painel`) e só escuta em `127.0.0.1`, então o risco caiu bastante — mas
se alguém publicar a porta 8081 num servidor, a senha padrão volta a ser um
problema. Defina `ME_EXPRESS_USER` e `ME_EXPRESS_PASSWORD` no `.env`.

### 15. Sem lint nem formatter

Nenhum ESLint/Prettier. O código tem mistura de indentação (4 espaços no
`server.js`, 2 no cliente) e de estilo de aspas.

### 16. Sem shutdown gracioso

Não há handler de `SIGTERM`. O Docker manda SIGTERM, espera 10s e mata — conexões
de socket e a gravação da partida em curso são cortadas no meio.

### 17. Log sem estrutura

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
