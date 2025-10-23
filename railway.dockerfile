# 🌐 Deploy para Railway (Gratuito)
# railway.app - Plataforma gratuita para hospedar aplicações

# Instalar Railway CLI:
# npm install -g @railway/cli

# Login no Railway:
# railway login

# Deploy:
# railway deploy

# Variáveis de ambiente necessárias no Railway:
# MONGODB_URI=mongodb+srv://seu-cluster.mongodb.net/jogo-da-velha
# NODE_ENV=production
# PORT=3000

FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE $PORT

CMD ["node", "server.js"]