# Deploy Guide

This project is prepared to run on any machine with Docker + Compose.

## Files and why they exist

- `Dockerfile`: production image for the Node.js app.
- `docker-compose.yml`: full stack (app + MongoDB + mongo-express).
- `docker-compose.dev.yml`: development stack with source bind mount.
- `deploy.bat`: interactive deploy helper for Windows.
- `deploy.sh`: interactive deploy helper for Linux/macOS.

Removed legacy duplicates:
- `railway.dockerfile`
- `docker-compose.app-only.yml`
- `deploy-opcoes.bat`
- `deploy-opcoes.sh`

## 1. Full stack

```bash
docker compose up -d --build
```

App: http://localhost:3000  
Mongo Express: http://localhost:8081

## 2. App only (external Mongo)

Set `MONGODB_URI` and run only the app:

```bash
docker compose up -d --build jogo
```

Examples:
- Local Mongo on host (PowerShell): `$env:MONGODB_URI="mongodb://host.docker.internal:27017/jogo-da-velha"`
- Mongo Atlas: `mongodb+srv://...`

## 3. Development

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

## 4. Stop everything

```bash
docker compose down
docker compose -f docker-compose.dev.yml down
```

## Notes

- If the app starts before Mongo in full stack mode, restart once: `docker compose restart jogo`.
- Port mapping defaults to `3000:3000` and can be changed with `PORT` env var.
