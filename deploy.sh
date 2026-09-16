#!/usr/bin/env bash
# Mantido por compatibilidade. A automação de verdade está em scripts/subir.js,
# que também gera o SESSION_SECRET exigido pelo docker-compose.yml.
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/subir.js "$@"
