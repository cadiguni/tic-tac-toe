#!/usr/bin/env node
/**
 * Derruba a stack.
 *
 *   npm run down           para os containers, mantendo o banco
 *   npm run down -- --tudo para e APAGA o volume do MongoDB
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const APAGAR_DADOS = process.argv.includes('--tudo');

const cor = (c, t) => `\x1b[${c}m${t}\x1b[0m`;

function baixar(arquivo) {
  const args = ['compose', '-f', arquivo, 'down'];
  if (APAGAR_DADOS) args.push('--volumes');

  // remove-orphans limpa containers de uma versão anterior do compose
  args.push('--remove-orphans');

  spawnSync('docker', args, { cwd: RAIZ, stdio: 'inherit', shell: false });
}

if (APAGAR_DADOS) {
  console.log(cor(33, '\n⚠ Removendo também os volumes: contas e partidas serão APAGADAS.\n'));
}

// Derruba as duas stacks: é comum ter subido a de dev e esquecido dela
baixar('docker-compose.yml');
baixar('docker-compose.dev.yml');

console.log(cor(32, '\n✓ Tudo parado.\n'));
