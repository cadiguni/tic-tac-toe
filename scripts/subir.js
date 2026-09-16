#!/usr/bin/env node
/**
 * Sobe a stack inteira (app + MongoDB) com um comando só.
 *
 *   npm run up          produção local / rede interna
 *   npm run up:dev      desenvolvimento, com reload ao salvar
 *
 * Escrito em Node em vez de .sh/.bat porque o projeto já exige Node e assim o
 * comportamento é idêntico no Windows, Linux e macOS.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dgram = require('node:dgram');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ARQUIVO_ENV = path.join(RAIZ, '.env');

const DEV = process.argv.includes('--dev');
const COMPOSE = DEV ? 'docker-compose.dev.yml' : 'docker-compose.yml';

const cor = (codigo, texto) => `\x1b[${codigo}m${texto}\x1b[0m`;
const verde = (t) => cor(32, t);
const amarelo = (t) => cor(33, t);
const vermelho = (t) => cor(31, t);
const negrito = (t) => cor(1, t);

function executar(comando, args, opcoes = {}) {
  return spawnSync(comando, args, { cwd: RAIZ, encoding: 'utf8', shell: false, ...opcoes });
}

function abortar(mensagem, dica) {
  console.error(`\n${vermelho('✖')} ${mensagem}`);
  if (dica) console.error(`  ${dica}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Pré-requisitos
// ---------------------------------------------------------------------------

function verificarDocker() {
  if (executar('docker', ['--version']).status !== 0) {
    abortar('Docker não encontrado.', 'Instale o Docker Desktop (ou Docker Engine) e abra o programa antes de rodar de novo.');
  }

  if (executar('docker', ['compose', 'version']).status !== 0) {
    abortar('O plugin "docker compose" não está disponível.', 'Atualize o Docker Desktop — a versão antiga "docker-compose" não serve.');
  }

  // Docker instalado mas daemon parado é o erro mais comum no Windows
  if (executar('docker', ['info']).status !== 0) {
    abortar('O Docker está instalado mas não está rodando.', 'Abra o Docker Desktop e espere ficar verde.');
  }
}

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------

/**
 * Garante um SESSION_SECRET real no .env. Sem ele o compose de produção nem
 * inicia — e um segredo novo a cada boot derrubaria todos os logins.
 */
function garantirEnv() {
  let conteudo = fs.existsSync(ARQUIVO_ENV) ? fs.readFileSync(ARQUIVO_ENV, 'utf8') : '';

  // Considera só linhas não comentadas e com valor de verdade
  const temSegredo = conteudo
    .split('\n')
    .some(linha => /^\s*SESSION_SECRET\s*=\s*\S/.test(linha) && !linha.trim().startsWith('#'));

  if (temSegredo) {
    console.log(`${verde('✓')} .env já tem SESSION_SECRET — mantido como está.`);
    return;
  }

  const segredo = crypto.randomBytes(32).toString('hex');

  if (conteudo && !conteudo.endsWith('\n')) conteudo += '\n';
  if (!conteudo) {
    conteudo = '# Gerado automaticamente por "npm run up"\n';
  }
  conteudo += `\n# Gerado automaticamente em ${new Date().toISOString()}\nSESSION_SECRET=${segredo}\n`;

  fs.writeFileSync(ARQUIVO_ENV, conteudo, 'utf8');
  console.log(`${verde('✓')} SESSION_SECRET gerado e salvo no .env (o arquivo é ignorado pelo git).`);
}

// ---------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------

/**
 * IP que a máquina realmente usa para sair na rede.
 *
 * `os.networkInterfaces()` lista também adaptadores virtuais (Docker, WSL,
 * Hyper-V), e adivinhar qual é o bom dá errado. Abrir um socket UDP "para fora"
 * faz o sistema operacional escolher a rota — nenhum pacote é enviado.
 */
function ipPrincipal() {
  return new Promise((resolve) => {
    let socket;

    try {
      socket = dgram.createSocket('udp4');
    } catch {
      resolve(null);
      return;
    }

    // `connect` é assíncrono: o socket precisa ser fechado em TODOS os caminhos,
    // senão o handle aberto impede o processo de encerrar.
    let limite;
    const encerrar = (valor) => {
      clearTimeout(limite);
      try { socket.close(); } catch { /* já fechado */ }
      resolve(valor);
    };

    limite = setTimeout(() => encerrar(null), 1000);
    socket.on('error', () => encerrar(null));

    socket.connect(53, '8.8.8.8', () => {
      let endereco = null;
      try {
        endereco = socket.address().address;
      } catch { /* segue null */ }

      encerrar(endereco && endereco !== '0.0.0.0' ? endereco : null);
    });
  });
}

function outrosIps(principal) {
  const encontrados = [];

  for (const enderecos of Object.values(os.networkInterfaces())) {
    for (const iface of enderecos || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== principal) {
        encontrados.push(iface.address);
      }
    }
  }

  return encontrados;
}

// ---------------------------------------------------------------------------
// Subir
// ---------------------------------------------------------------------------

function porta() {
  const conteudo = fs.existsSync(ARQUIVO_ENV) ? fs.readFileSync(ARQUIVO_ENV, 'utf8') : '';
  const achou = conteudo.match(/^\s*PORT\s*=\s*(\d+)/m);
  return achou ? achou[1] : '3000';
}

async function esperarSaude(url, tentativas = 40) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (resposta.ok) return await resposta.json();
    } catch {
      // ainda subindo
    }

    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 1500));
  }

  return null;
}

async function principal() {
  console.log(negrito(`\n🎮 Subindo o Jogo da Velha ${DEV ? '(desenvolvimento)' : '(produção local)'}\n`));

  verificarDocker();
  garantirEnv();

  console.log(`\n${negrito('Construindo e subindo os containers...')}\n`);

  const subida = executar('docker', ['compose', '-f', COMPOSE, 'up', '-d', '--build'], { stdio: 'inherit' });
  if (subida.status !== 0) {
    abortar('docker compose falhou.', `Veja o log completo com: docker compose -f ${COMPOSE} logs`);
  }

  const p = porta();
  process.stdout.write(`\n${negrito('Esperando a aplicação responder')}`);

  const saude = await esperarSaude(`http://127.0.0.1:${p}/health`);
  console.log('');

  if (!saude) {
    abortar(
      'Os containers subiram, mas a aplicação não respondeu no /health.',
      `Veja o que aconteceu com: docker compose -f ${COMPOSE} logs jogo`
    );
  }

  const ip = await ipPrincipal();

  console.log(`\n${verde('✓ No ar!')}\n`);
  console.log(`  ${negrito('Neste computador')}   http://localhost:${p}`);

  if (ip) {
    console.log(`  ${negrito('Na rede interna')}    ${verde(`http://${ip}:${p}`)}  ${amarelo('← mande este link')}`);
  }

  const alternativos = outrosIps(ip);
  if (alternativos.length) {
    console.log(`\n  Outros endereços desta máquina (provavelmente adaptadores virtuais`);
    console.log(`  do Docker/WSL — use só se o de cima não funcionar):`);
    alternativos.forEach(a => console.log(`    http://${a}:${p}`));
  }

  if (process.platform === 'win32') {
    console.log(`\n${amarelo('⚠ Windows:')} se outro computador não conseguir abrir, é o firewall.`);
    console.log(`  Libere a porta uma vez, em um PowerShell ${negrito('como administrador')}:`);
    console.log(`    New-NetFirewallRule -DisplayName "Jogo da Velha" -Direction Inbound -LocalPort ${p} -Protocol TCP -Action Allow`);
  }

  console.log(`\n${negrito('Comandos úteis')}`);
  console.log(`  npm run logs      acompanhar os logs`);
  console.log(`  npm run down      derrubar tudo`);
  console.log(`  npm run painel    abrir o mongo-express em http://localhost:8081`);
  console.log('');
}

principal().catch(err => abortar(err.message));
