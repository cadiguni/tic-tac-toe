# Tic-Tac-Toe Online

Jogo da velha multiplayer em tempo real, com Node.js, Express, Socket.IO e MongoDB.

## Modos de jogo

- **🎯 Clássico** — regras tradicionais; o tabuleiro cheio sem linha é velha.
- **♾️ Infinito** — cada jogador mantém no máximo 3 marcas. Ao colocar a 4ª, a
  mais antiga dele some, então **nunca dá velha**. A marca prestes a desaparecer
  fica piscando.

O modo é escolhido na tela inicial, ao criar a sala. Detalhes das regras e da
estratégia em [docs/MODOS-DE-JOGO.md](docs/MODOS-DE-JOGO.md).

## Rodar local

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # com reload automático
npm test           # 18 testes, não precisa de MongoDB
```

Precisa de um MongoDB acessível. Por padrão usa
`mongodb://localhost:27017/jogo-da-velha`; para outro endereço, defina
`MONGODB_URI`.

## Rodar com Docker

### Stack completa (recomendado)

```bash
docker compose up -d --build
```

- App: http://localhost:3000
- Mongo Express: http://localhost:8081

### Só a aplicação (MongoDB externo)

```bash
# Linux/macOS
export MONGODB_URI="mongodb://localhost:27017/jogo-da-velha"

# Windows (PowerShell)
$env:MONGODB_URI="mongodb://localhost:27017/jogo-da-velha"

docker compose up -d --build jogo
```

### Desenvolvimento

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

### Parar

```bash
docker compose down
docker compose -f docker-compose.dev.yml down
```

Scripts auxiliares: `deploy.bat` (Windows) e `./deploy.sh` (Linux/macOS).
Guia completo em [DEPLOY.md](DEPLOY.md).

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

## Documentação

- [docs/MODOS-DE-JOGO.md](docs/MODOS-DE-JOGO.md) — regras, estratégia e implementação dos modos
- [docs/MELHORIAS.md](docs/MELHORIAS.md) — bugs conhecidos, dívidas técnicas e roadmap
- [CLAUDE.md](CLAUDE.md) — arquitetura e convenções do código
- [DEPLOY.md](DEPLOY.md) — deploy com Docker
