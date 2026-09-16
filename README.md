# Tic-Tac-Toe Online

Jogo da velha multiplayer em tempo real, com Node.js, Express, Socket.IO e MongoDB.

## Modos de jogo

- **🎯 Clássico** — regras tradicionais; o tabuleiro cheio sem linha é velha.
- **♾️ Infinito** — cada jogador mantém no máximo 3 marcas. Ao colocar a 4ª, a
  mais antiga dele some, então **nunca dá velha**. A marca prestes a desaparecer
  fica piscando.

O modo é escolhido na tela inicial, ao criar a sala. Detalhes das regras e da
estratégia em [docs/MODOS-DE-JOGO.md](docs/MODOS-DE-JOGO.md).

## Conta é opcional

Quem recebe o link da sala **joga na hora, como convidado** — sem cadastro, sem
tela de login no meio do caminho.

Criar uma conta (usuário e senha) serve para uma coisa: **entrar no ranking**.
Vitórias de convidado não são contabilizadas, e convidados não podem usar o nome
de uma conta registrada. Detalhes em [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md).

## Rodar local

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # com reload automático
npm test           # 37 testes, não precisa de MongoDB
```

Precisa de um MongoDB acessível (o `npm run up` acima já cuida disso). Por
padrão usa `mongodb://localhost:27017/jogo-da-velha`; para outro endereço,
defina `MONGODB_URI`.

Em produção, `SESSION_SECRET` é obrigatório — sem ele o servidor não sobe:

```bash
SESSION_SECRET=$(openssl rand -hex 32)
```

## Subir tudo com um comando

```bash
npm run up
```

Confere o Docker, gera o `SESSION_SECRET`, sobe a aplicação e o MongoDB, espera
o `/health` responder e imprime o link para a rede interna:

```
✓ No ar!

  Neste computador   http://localhost:3000
  Na rede interna    http://192.168.22.223:3000  ← mande este link
```

```bash
npm run up:dev          # modo desenvolvimento, com reload
npm run logs            # acompanha os logs
npm run painel          # mongo-express em http://localhost:8081
npm run down            # para tudo, preservando o banco
npm run down -- --tudo  # para tudo e apaga contas e partidas
```

Front e back são o mesmo processo — o Express serve `public/` e o Socket.IO na
mesma porta. Detalhes, rede interna e publicação em [DEPLOY.md](DEPLOY.md).

## Rotas

| Rota | O que faz |
|---|---|
| `/` | tela inicial, com a escolha do modo |
| `/nova-sala?modo=classico\|infinito` | cria uma sala e redireciona para ela |
| `/sala/:id` | entra numa sala |
| `/ranking` | página do ranking (ou JSON, com `Accept: application/json`) |
| `/estatisticas` | estatísticas globais em JSON |
| `/modos` | modos disponíveis em JSON |
| `/health` | healthcheck |
| `POST /api/registrar` | cria conta e já autentica |
| `POST /api/login` | autentica |
| `POST /api/logout` | encerra a sessão |
| `GET /api/eu` | conta autenticada, ou `null` |

## Documentação

- [docs/MODOS-DE-JOGO.md](docs/MODOS-DE-JOGO.md) — regras, estratégia e implementação dos modos
- [docs/AUTENTICACAO.md](docs/AUTENTICACAO.md) — contas, sessão e o que fica fora do ranking
- [docs/MELHORIAS.md](docs/MELHORIAS.md) — bugs conhecidos, dívidas técnicas e roadmap
- [CLAUDE.md](CLAUDE.md) — arquitetura e convenções do código
- [DEPLOY.md](DEPLOY.md) — deploy com Docker
