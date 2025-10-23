#!/bin/bash

# 🚀 Script de Deploy Automático para VPS
# Use este script para fazer deploy em qualquer servidor Linux

echo "🎮 Iniciando deploy do Jogo da Velha..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log colorido
log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] $1${NC}"
}

# Verificar se Docker está instalado
if ! command -v docker &> /dev/null; then
    error "Docker não encontrado!"
    echo "Instalando Docker..."
    
    # Instalar Docker (Ubuntu/Debian)
    sudo apt-get update
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Adicionar usuário ao grupo docker
    sudo usermod -aG docker $USER
    
    log "Docker instalado! Faça logout e login novamente, depois execute este script."
    exit 1
fi

# Verificar se Docker Compose está instalado
if ! command -v docker-compose &> /dev/null; then
    warn "Docker Compose não encontrado, instalando..."
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
fi

# Parar containers existentes
log "Parando containers existentes..."
docker-compose down 2>/dev/null || true

# Construir e iniciar
log "Construindo aplicação..."
docker-compose build

log "Iniciando serviços..."
docker-compose up -d

# Aguardar inicialização
log "Aguardando inicialização..."
sleep 10

# Verificar se está rodando
if docker-compose ps | grep -q "Up"; then
    log "✅ Deploy realizado com sucesso!"
    echo
    echo "🌐 Aplicação disponível em:"
    echo "   Local:     http://localhost:3000"
    echo "   Rede:      http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo "🗄️ MongoDB Admin: http://localhost:8081 (admin/admin123)"
    echo
    echo "📊 Comandos úteis:"
    echo "   Ver logs:     docker-compose logs -f"
    echo "   Parar:        docker-compose down"
    echo "   Reiniciar:    docker-compose restart"
    echo "   Status:       docker-compose ps"
else
    error "❌ Falha no deploy!"
    echo "Ver logs: docker-compose logs"
fi