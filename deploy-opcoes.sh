#!/bin/bash

# 🎯 Script de Deploy com Opções (Linux/Mac)
# Escolha como você quer fazer o deploy

echo "🎮 Deploy do Jogo da Velha - Escolha uma opção:"
echo
echo "1. 🚀 Deploy Completo (Jogo + MongoDB + Interface)"
echo "2. 🎯 Apenas o Jogo (MongoDB externo)"
echo "3. 🔧 Desenvolvimento (dados temporários)"
echo "4. ❌ Parar todos os serviços"
echo

read -p "Digite sua opção (1-4): " opcao

case $opcao in
    1)
        echo "🚀 Fazendo deploy completo..."
        docker-compose -f docker-compose.yml up --build -d
        ;;
    2)
        echo "🎯 Fazendo deploy apenas do jogo..."
        echo "⚠️  Certifique-se que o MongoDB está rodando!"
        echo "   MongoDB local: mongodb://localhost:27017/jogo-da-velha"
        echo "   MongoDB Atlas: Configure MONGODB_URI no .env"
        docker-compose -f docker-compose.app-only.yml up --build -d
        ;;
    3)
        echo "🔧 Iniciando ambiente de desenvolvimento..."
        docker-compose -f docker-compose.dev.yml up --build -d
        ;;
    4)
        echo "⏹️  Parando todos os serviços..."
        docker-compose -f docker-compose.yml down 2>/dev/null
        docker-compose -f docker-compose.app-only.yml down 2>/dev/null
        docker-compose -f docker-compose.dev.yml down 2>/dev/null
        echo "✅ Serviços parados!"
        exit 0
        ;;
    *)
        echo "❌ Opção inválida!"
        exit 1
        ;;
esac

echo
echo "✅ Deploy realizado com sucesso!"
echo
echo "🌐 Aplicação: http://localhost:3000"
if [ "$opcao" = "1" ]; then
    echo "🗄️ MongoDB Admin: http://localhost:8081 (admin/admin123)"
fi
echo
echo "📊 Comandos úteis:"
echo "   Ver logs:     docker-compose logs -f"
echo "   Parar:        docker-compose down"
echo "   Status:       docker-compose ps"