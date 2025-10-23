# 📖 Guia de Deploy em VM

## 🎯 Opções de Deploy

### 1. 🐳 Docker (Recomendado)
```bash
# Clonar o repositório
git clone <seu-repo>
cd tic-tac-toe

# Rodar o script de deploy
chmod +x deploy.sh
./deploy.sh
```

### 2. 🌩️ VPS/Cloud Servers

#### Digital Ocean ($5/mês)
1. Criar Droplet Ubuntu 22.04
2. Conectar via SSH
3. Rodar o script de deploy
4. Configurar domínio (opcional)

#### AWS EC2 (Tier gratuito)
1. Criar instância t2.micro Ubuntu
2. Configurar Security Groups (portas 22, 3000)
3. Conectar via SSH
4. Rodar o script de deploy

#### Vultr ($2.50/mês)
1. Criar server Ubuntu
2. Conectar via SSH
3. Rodar o script de deploy

### 3. 🆓 Serviços Gratuitos

#### Railway.app
```bash
npm install -g @railway/cli
railway login
railway deploy
```

#### Render.com
1. Conectar repositório GitHub
2. Configurar build command: `npm install`
3. Configurar start command: `node server.js`
4. Adicionar MongoDB Atlas gratuito

#### Heroku
```bash
heroku create seu-jogo-da-velha
heroku addons:create mongolab:sandbox
git push heroku main
```

## ⚙️ Configuração de Rede

### Firewall (iptables/ufw)
```bash
# Liberar porta 3000
sudo ufw allow 3000
sudo ufw enable
```

### Nginx (Proxy reverso - opcional)
```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 Monitoramento

### PM2 (Process Manager)
```bash
npm install -g pm2
pm2 start server.js --name "jogo-da-velha"
pm2 startup
pm2 save
```

### Logs
```bash
# Docker
docker-compose logs -f

# PM2
pm2 logs jogo-da-velha

# Sistema
journalctl -u docker -f
```

## 🛡️ Segurança

### SSL/HTTPS (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d seu-dominio.com
```

### Environment Variables
```bash
# .env
NODE_ENV=production
MONGODB_URI=mongodb://localhost:27017/jogo-da-velha
PORT=3000
SESSION_SECRET=seu-secret-super-secreto
```

## 📊 Backup

### MongoDB
```bash
# Backup
mongodump --db jogo-da-velha --out backup/

# Restore
mongorestore backup/
```

### Docker Volumes
```bash
# Backup
docker run --rm -v tic-tac-toe_mongo_data:/data -v $(pwd):/backup alpine tar czf /backup/mongo-backup.tar.gz /data

# Restore
docker run --rm -v tic-tac-toe_mongo_data:/data -v $(pwd):/backup alpine tar xzf /backup/mongo-backup.tar.gz -C /
```

## 🚀 Deploy Rápido (5 minutos)

```bash
# 1. Criar VM Ubuntu 22.04
# 2. Conectar via SSH
# 3. Rodar comandos:

sudo apt update && sudo apt install -y git
git clone https://github.com/cadiguni/tic-tac-toe.git
cd tic-tac-toe
chmod +x deploy.sh
./deploy.sh

# 4. Acessar: http://SEU-IP:3000
```

## 💡 Dicas

- **Domínio gratuito:** freenom.com, no-ip.com
- **SSL gratuito:** Let's Encrypt, Cloudflare
- **Monitoramento:** UptimeRobot, Pingdom
- **Backup:** Configurar backup automático diário
- **Updates:** `git pull && docker-compose up --build -d`