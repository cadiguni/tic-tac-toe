@echo off
setlocal

echo Tic-Tac-Toe deployment

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker not found. Install Docker Desktop and try again.
  exit /b 1
)

docker compose version >nul 2>nul
if errorlevel 1 (
  echo Docker Compose plugin not found. Update Docker Desktop.
  exit /b 1
)

echo.
echo Choose an option:
echo 1. Full stack ^(app + MongoDB + mongo-express^)
echo 2. App only ^(external MongoDB via MONGODB_URI^)
echo 3. Development ^(with bind mount^)
echo 4. Stop everything
set /p OPTION=Option (1-4): 

if "%OPTION%"=="1" goto full
if "%OPTION%"=="2" goto apponly
if "%OPTION%"=="3" goto dev
if "%OPTION%"=="4" goto stop

echo Invalid option.
exit /b 1

:full
echo Starting full stack...
docker compose up -d --build
if errorlevel 1 exit /b 1

goto success

:apponly
if "%MONGODB_URI%"=="" (
  echo MONGODB_URI is not set.
  echo Example: set MONGODB_URI=mongodb://host.docker.internal:27017/jogo-da-velha
  exit /b 1
)

echo Starting app only...
docker compose up -d --build jogo
if errorlevel 1 exit /b 1

goto success

:dev
echo Starting development environment...
docker compose -f docker-compose.dev.yml up -d --build
if errorlevel 1 exit /b 1

goto success

:stop
echo Stopping full stack...
docker compose down

echo Stopping development stack...
docker compose -f docker-compose.dev.yml down

echo Done.
exit /b 0

:success
echo.
echo App: http://localhost:3000
if "%OPTION%"=="1" echo Mongo Express: http://localhost:8081

echo.
echo Useful commands:
echo docker compose ps
echo docker compose logs -f
echo docker compose down

endlocal
