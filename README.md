# Tic-Tac-Toe Online

Multiplayer tic-tac-toe with Node.js, Express, Socket.IO and MongoDB.

## Requirements

- Docker Desktop (Windows/Mac) or Docker Engine + Compose plugin (Linux)

## Run with Docker

### Full stack (recommended)

```bash
docker compose up -d --build
```

Services:
- App: http://localhost:3000
- Mongo Express: http://localhost:8081

### App only (external MongoDB)

Set your Mongo URI first:

```bash
# Linux/macOS
export MONGODB_URI="mongodb://localhost:27017/jogo-da-velha"

# Windows (PowerShell)
$env:MONGODB_URI="mongodb://localhost:27017/jogo-da-velha"
```

Then start only the app service:

```bash
docker compose up -d --build jogo
```

### Development mode

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## Run helper scripts

- Windows: `deploy.bat`
- Linux/macOS: `./deploy.sh`

## Stop

```bash
docker compose down
docker compose -f docker-compose.dev.yml down
```
