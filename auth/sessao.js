const crypto = require('node:crypto');

/**
 * Sessão sem estado: um cookie assinado com HMAC-SHA256.
 *
 * Formato do token: <userId>.<expiraEm>.<assinatura base64url>
 *
 * Não há store de sessão no servidor — o que significa que logout é feito
 * apagando o cookie no cliente e que revogar uma sessão específica antes do
 * vencimento exige trocar o SESSION_SECRET (derruba todo mundo). É um
 * compromisso consciente para um jogo; ver docs/MELHORIAS.md.
 */

const NOME_COOKIE = 'velha_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

let segredoEmMemoria = null;

/**
 * Em produção o SESSION_SECRET é obrigatório: sem ele, um segredo gerado a cada
 * boot invalidaria todas as sessões a cada deploy/restart.
 */
function obterSegredo() {
  const doAmbiente = process.env.SESSION_SECRET;

  if (doAmbiente && doAmbiente.trim() !== '' && doAmbiente !== 'your-super-secret-key-here') {
    return doAmbiente;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SESSION_SECRET não configurado. Defina a variável de ambiente antes de subir em produção ' +
      '(ex.: SESSION_SECRET=$(openssl rand -hex 32)).'
    );
  }

  if (!segredoEmMemoria) {
    segredoEmMemoria = crypto.randomBytes(32).toString('hex');
    console.warn('⚠️  SESSION_SECRET não definido — usando um segredo temporário. As sessões caem a cada restart.');
  }

  return segredoEmMemoria;
}

/**
 * Valida a configuração no boot. Sem isso o erro só apareceria na primeira
 * tentativa de login, virando um 500 genérico difícil de diagnosticar.
 */
function verificarConfiguracao() {
  obterSegredo();
}

function assinar(payload) {
  return crypto.createHmac('sha256', obterSegredo()).update(payload).digest('base64url');
}

function criarToken(userId, agora = Date.now()) {
  const expiraEm = agora + DURACAO_MS;
  const payload = `${userId}.${expiraEm}`;
  return `${payload}.${assinar(payload)}`;
}

/**
 * Devolve { userId, expiraEm } ou null. Token adulterado, expirado ou com
 * formato errado sempre vira null — nunca lança.
 */
function lerToken(token) {
  if (typeof token !== 'string') return null;

  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [userId, expiraEmTexto, assinatura] = partes;
  const expiraEm = Number(expiraEmTexto);
  if (!Number.isFinite(expiraEm) || expiraEm <= Date.now()) return null;

  const esperada = Buffer.from(assinar(`${userId}.${expiraEmTexto}`));
  const recebida = Buffer.from(assinatura);

  if (esperada.length !== recebida.length) return null;
  if (!crypto.timingSafeEqual(esperada, recebida)) return null;

  return { userId, expiraEm };
}

/** Parser de cookie — evita a dependência do cookie-parser. */
function lerCookies(header) {
  const cookies = {};
  if (typeof header !== 'string') return cookies;

  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) continue;

    const chave = parte.slice(0, separador).trim();
    if (!chave) continue;

    try {
      cookies[chave] = decodeURIComponent(parte.slice(separador + 1).trim());
    } catch {
      cookies[chave] = parte.slice(separador + 1).trim();
    }
  }

  return cookies;
}

function tokenDoHeader(cookieHeader) {
  return lerCookies(cookieHeader)[NOME_COOKIE] || null;
}

/**
 * `Secure` fica atrás de COOKIE_SECURE em vez de ligar sozinho em produção:
 * este projeto também roda em rede local sobre HTTP puro, onde `Secure`
 * impediria o login sem nenhuma pista do motivo.
 */
function opcoesCookie() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: DURACAO_MS,
    path: '/'
  };
}

function definirCookie(res, userId) {
  res.cookie(NOME_COOKIE, criarToken(userId), opcoesCookie());
}

function limparCookie(res) {
  res.clearCookie(NOME_COOKIE, { ...opcoesCookie(), maxAge: undefined });
}

module.exports = {
  NOME_COOKIE,
  DURACAO_MS,
  verificarConfiguracao,
  criarToken,
  lerToken,
  lerCookies,
  tokenDoHeader,
  definirCookie,
  limparCookie
};
