#!/usr/bin/env bash
set -euo pipefail

echo "Tic-Tac-Toe deployment"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Engine/Desktop and try again."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found."
  exit 1
fi

echo
cat <<'MENU'
Choose an option:
1. Full stack (app + MongoDB + mongo-express)
2. App only (external MongoDB via MONGODB_URI)
3. Development (with bind mount)
4. Stop everything
MENU

read -r -p "Option (1-4): " option

case "$option" in
  1)
    echo "Starting full stack..."
    docker compose up -d --build
    ;;
  2)
    if [ -z "${MONGODB_URI:-}" ]; then
      echo "MONGODB_URI is not set."
      echo "Example: export MONGODB_URI=mongodb://localhost:27017/jogo-da-velha"
      exit 1
    fi
    echo "Starting app only..."
    docker compose up -d --build jogo
    ;;
  3)
    echo "Starting development environment..."
    docker compose -f docker-compose.dev.yml up -d --build
    ;;
  4)
    echo "Stopping full stack..."
    docker compose down || true
    echo "Stopping development stack..."
    docker compose -f docker-compose.dev.yml down || true
    echo "Done."
    exit 0
    ;;
  *)
    echo "Invalid option."
    exit 1
    ;;
esac

echo
echo "App: http://localhost:3000"
if [ "$option" = "1" ]; then
  echo "Mongo Express: http://localhost:8081"
fi

echo
echo "Useful commands:"
echo "docker compose ps"
echo "docker compose logs -f"
echo "docker compose down"
