const crypto = require('node:crypto');

/**
 * Hash de senha com scrypt (node:crypto) — sem dependência externa e sem
 * compilação nativa, o que mantém o Dockerfile alpine simples.
 *
 * Formato armazenado: scrypt$N$r$p$<salt base64>$<hash base64>
 * Guardar os parâmetros junto do hash permite aumentar o custo no futuro sem
 * invalidar as senhas já cadastradas.
 */

const PARAMETROS = { N: 16384, r: 8, p: 1 };
const TAMANHO_CHAVE = 64;
const TAMANHO_SALT = 16;

// 128 * N * r = 16 MiB para os parâmetros acima; o default do Node é 32 MiB,
// mas deixamos explícito para não quebrar se N aumentar.
const MAX_MEM = 64 * 1024 * 1024;

const MIN_SENHA = 8;
const MAX_SENHA = 128;

function derivar(senha, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(senha, salt, TAMANHO_CHAVE, { N, r, p, maxmem: MAX_MEM }, (err, chave) => {
      if (err) reject(err);
      else resolve(chave);
    });
  });
}

async function hashSenha(senha) {
  const salt = crypto.randomBytes(TAMANHO_SALT);
  const chave = await derivar(senha, salt, PARAMETROS);
  const { N, r, p } = PARAMETROS;

  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${chave.toString('base64')}`;
}

/**
 * Comparação em tempo constante. Nunca lança: hash malformado devolve false,
 * para que um registro corrompido no banco não vire erro 500 no login.
 */
async function verificarSenha(senha, armazenado) {
  if (typeof senha !== 'string' || typeof armazenado !== 'string') return false;

  const partes = armazenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, hashB64] = partes;
  const parametros = { N: Number(N), r: Number(r), p: Number(p) };

  if (!Number.isInteger(parametros.N) || !Number.isInteger(parametros.r) || !Number.isInteger(parametros.p)) {
    return false;
  }

  try {
    const esperado = Buffer.from(hashB64, 'base64');
    const chave = await derivar(senha, Buffer.from(saltB64, 'base64'), parametros);

    if (chave.length !== esperado.length) return false;
    return crypto.timingSafeEqual(chave, esperado);
  } catch {
    return false;
  }
}

/** Regras mínimas de senha. Devolve null quando está tudo certo. */
function validarSenha(senha) {
  if (typeof senha !== 'string') return 'Senha inválida.';
  if (senha.length < MIN_SENHA) return `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`;
  if (senha.length > MAX_SENHA) return `A senha pode ter no máximo ${MAX_SENHA} caracteres.`;
  return null;
}

module.exports = { hashSenha, verificarSenha, validarSenha, MIN_SENHA, MAX_SENHA };
