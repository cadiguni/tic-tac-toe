# Deploy

## Subir tudo (back + front + banco)

```bash
npm run up
```

Um comando. Ele faz tudo:

1. Confere se o Docker existe **e está rodando**.
2. Cria o `.env` e gera um `SESSION_SECRET` aleatório, se ainda não houver.
3. Sobe a aplicação e o MongoDB, esperando o banco ficar saudável antes do app.
4. Espera o `/health` responder.
5. Imprime o link para mandar para a rede interna.

> Front e back são o mesmo processo: o Express serve `public/` e o Socket.IO na
> mesma porta. Não existe build de front nem container separado para ele.

Saída:

```
✓ .env já tem SESSION_SECRET — mantido como está.

Esperando a aplicação responder.
✓ No ar!

  Neste computador   http://localhost:3000
  Na rede interna    http://192.168.22.223:3000  ← mande este link
```

### Outros comandos

```bash
npm run up:dev          # sobe em modo desenvolvimento (reload ao salvar)
npm run logs            # acompanha os logs
npm run painel          # mongo-express em http://localhost:8081
npm run down            # para tudo, preservando o banco
npm run down -- --tudo  # para tudo e APAGA contas e partidas
```

`deploy.sh` e `deploy.bat` continuam funcionando — hoje são só atalhos para
`npm run up`.

---

## Testar na rede interna

O link com o IP da máquina é o que o `npm run up` já imprime. Mande esse para os
outros computadores.

O script descobre o IP certo abrindo um socket UDP "para fora" e vendo qual rota
o sistema escolhe — assim ele não confunde o IP real com os adaptadores virtuais
do Docker, do WSL e do Hyper-V, que aparecem misturados em `ipconfig`.

### Se o outro computador não abrir

**Quase sempre é o firewall do Windows.** Libere a porta uma vez, num PowerShell
**como administrador**:

```powershell
New-NetFirewallRule -DisplayName "Jogo da Velha" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

Depois disso, confira:

- Os dois computadores estão na **mesma rede**? Wi-Fi de visitante costuma
  isolar os dispositivos entre si.
- O link está em `http://` e não `https://`? Na rede local não há certificado.
- `npm run logs` mostra o servidor recebendo a conexão?

### Por que o login funciona em HTTP na rede local

`COOKIE_SECURE` vem `false` por padrão, então o cookie de sessão é aceito sem
HTTPS. **Ao publicar com HTTPS, mude para `true`** — ver abaixo.

### O que fica exposto

| Serviço | Porta | Alcance |
|---|---|---|
| Aplicação | 3000 | **toda a rede** — é o objetivo |
| MongoDB | 27017 | só `127.0.0.1`, a rede não enxerga |
| mongo-express | 8081 | só `127.0.0.1`, e só se rodar `npm run painel` |

O banco fica acessível para você (Compass, por exemplo) sem ficar aberto para
quem estiver na mesma rede.

---

## Publicar na internet

### Antes de qualquer host: uma restrição

**O jogo precisa rodar em uma instância só.** As salas vivem na memória do
processo (ver [CLAUDE.md](CLAUDE.md)), então duas réplicas enxergariam metade
das partidas cada uma e os jogadores de uma mesma sala poderiam cair em
processos diferentes.

Então, em qualquer host: **desligue o autoscaling e deixe `replicas: 1`**.
Para escalar de verdade, antes é preciso resolver o item 1 de
[docs/MELHORIAS.md](docs/MELHORIAS.md) (adapter de Redis).

### Variáveis obrigatórias em produção

```bash
NODE_ENV=production
MONGODB_URI=<a sua string de conexão>
SESSION_SECRET=<openssl rand -hex 32>   # sem isso o servidor não sobe
COOKIE_SECURE=true                      # porque terá HTTPS
TRUST_PROXY=true                        # porque estará atrás de um proxy
```

`COOKIE_SECURE` e `TRUST_PROXY` são os dois que costumam ser esquecidos:
sem o primeiro o cookie viaja sem proteção; sem o segundo, o rate limit de login
enxerga o IP do proxy e limita todos os usuários como se fossem um só.

### Opções

| Host | Bom para | Atenção |
|---|---|---|
| **VPS + este mesmo compose** | continuidade: é literalmente o que já roda aqui | você cuida do servidor e do HTTPS |
| **Railway** | subir rápido, sem administrar máquina | confira o plano; o gratuito mudou |
| **Fly.io** | Docker nativo, WebSocket sem configuração | banco precisa ser externo (Atlas) |
| **Render** | simples | o plano gratuito hiberna e derruba as partidas em aberto |

Para o banco em qualquer um deles, o **MongoDB Atlas** tem um tier gratuito
(M0) que sobra para este projeto.

**Recomendação**: como a stack em Docker Compose já está pronta e testada, um
VPS barato (Hetzner, DigitalOcean) com este mesmo `docker-compose.yml` mais um
Caddy na frente para HTTPS automático é o caminho de menor surpresa. Railway é a
opção de menor trabalho se você não quiser administrar máquina nenhuma.

Nada disso está configurado ainda — quando você escolher o host, dá para montar
o arquivo de deploy específico.

### Nota sobre `railway.dockerfile`

O arquivo existe no repositório e está desatualizado: usa `node:18` e
`npm install --production`, enquanto o `Dockerfile` principal usa `node:20` e
`npm ci --omit=dev`. O Railway consegue usar o `Dockerfile` principal
diretamente. Ou apague o `railway.dockerfile`, ou atualize-o — hoje ele só
confunde.

---

## Solução de problemas

**"O Docker está instalado mas não está rodando"**
Abra o Docker Desktop e espere o ícone ficar verde.

**"defina SESSION_SECRET no .env"**
Você rodou `docker compose up` direto. Use `npm run up`, que gera o segredo.

**"Os containers subiram, mas a aplicação não respondeu no /health"**

```bash
docker compose logs jogo
```

Quase sempre é o MongoDB. O compose já espera o banco ficar saudável antes de
subir o app, mas se a `MONGODB_URI` apontar para fora e estiver errada, o
`db/db.js` encerra o processo.

**Quero começar do zero**

```bash
npm run down -- --tudo
npm run up
```
