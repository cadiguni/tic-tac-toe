@echo off
REM Mantido por compatibilidade. A automacao de verdade esta em scripts/subir.js,
REM que tambem gera o SESSION_SECRET exigido pelo docker-compose.yml.
cd /d "%~dp0"
node scripts\subir.js %*
