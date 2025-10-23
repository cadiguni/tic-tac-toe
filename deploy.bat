@echo off
REM 🚀 Script de Deploy para Windows
REM Execute este arquivo para fazer deploy com Docker no Windows

echo 🎮 Iniciando deploy do Jogo da Velha...

REM Verificar se Docker está instalado
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker não encontrado!
    echo Instale o Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

REM Verificar se Docker Compose está disponível
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Compose não encontrado!
    echo O Docker Compose vem incluído no Docker Desktop
    pause
    exit /b 1
)

echo ✅ Docker encontrado!

REM Parar containers existentes
echo 📦 Parando containers existentes...
docker-compose down 2>nul

REM Construir e iniciar
echo 🔨 Construindo aplicação...
docker-compose build

echo 🚀 Iniciando serviços...
docker-compose up -d

REM Aguardar inicialização
echo ⏳ Aguardando inicialização...
timeout /t 10 /nobreak >nul

REM Verificar se está rodando
docker-compose ps | findstr "Up" >nul
if errorlevel 1 (
    echo ❌ Falha no deploy!
    echo Ver logs: docker-compose logs
    pause
    exit /b 1
)

echo ✅ Deploy realizado com sucesso!
echo.
echo 🌐 Aplicação disponível em:
echo    Local:     http://localhost:3000
echo    Rede:      http://%COMPUTERNAME%:3000
echo.
echo 🗄️ MongoDB Admin: http://localhost:8081 (admin/admin123)
echo.
echo 📊 Comandos úteis:
echo    Ver logs:     docker-compose logs -f
echo    Parar:        docker-compose down
echo    Reiniciar:    docker-compose restart
echo    Status:       docker-compose ps
echo.
pause