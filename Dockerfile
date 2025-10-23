# 🐳 Deploy com Docker
# Este arquivo permite rodar o jogo em qualquer VM facilmente

# Dockerfile para containerizar a aplicação
FROM node:18-alpine

# Criar diretório de trabalho
WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install --production

# Copiar código da aplicação
COPY . .

# Expor porta
EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production
ENV MONGODB_URI=mongodb://mongo:27017/jogo-da-velha

# Comando para iniciar
CMD ["node", "server.js"]