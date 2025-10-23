@echo off
REM 🎯 Script de Deploy com Opções
REM Escolha como você quer fazer o deploy

echo 🎮 Deploy do Jogo da Velha - Escolha uma opcao:
echo.
echo 1. 🚀 Deploy Completo (Jogo + MongoDB + Interface)
echo 2. 🎯 Apenas o Jogo (MongoDB externo)
echo 3. 🔧 Desenvolvimento (dados temporarios)
echo 4. ❌ Parar todos os servicos
echo.
set /p opcao="Digite sua opcao (1-4): "

if "%opcao%"=="1" goto completo
if "%opcao%"=="2" goto app-only
if "%opcao%"=="3" goto dev
if "%opcao%"=="4" goto stop
goto invalid

:completo
echo 🚀 Fazendo deploy completo...
docker-compose -f docker-compose.yml up --build -d
goto success

:app-only
echo 🎯 Fazendo deploy apenas do jogo...
echo ⚠️  Certifique-se que o MongoDB esta rodando!
echo    MongoDB local: mongodb://localhost:27017/jogo-da-velha
echo    MongoDB Atlas: Configure MONGODB_URI no .env
docker-compose -f docker-compose.app-only.yml up --build -d
goto success

:dev
echo 🔧 Iniciando ambiente de desenvolvimento...
docker-compose -f docker-compose.dev.yml up --build -d
goto success

:stop
echo ⏹️  Parando todos os servicos...
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.app-only.yml down
docker-compose -f docker-compose.dev.yml down
echo ✅ Servicos parados!
goto end

:success
echo.
echo ✅ Deploy realizado com sucesso!
echo.
echo 🌐 Aplicacao: http://localhost:3000
if "%opcao%"=="1" (
    echo 🗄️  MongoDB Admin: http://localhost:8081 ^(admin/admin123^)
)
echo.
echo 📊 Comandos uteis:
echo    Ver logs:     docker-compose logs -f
echo    Parar:        docker-compose down
echo    Status:       docker-compose ps
goto end

:invalid
echo ❌ Opcao invalida!
goto end

:end
echo.
pause