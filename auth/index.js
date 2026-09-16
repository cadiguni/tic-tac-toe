const Usuario = require('../models/Usuario');
const { lerToken, tokenDoHeader } = require('./sessao');

/**
 * Resolve o usuário a partir do header `Cookie`.
 *
 * Usado tanto pelas rotas HTTP quanto pelo handshake do Socket.IO — é o que
 * garante que a identidade dentro da sala seja a mesma do resto do site.
 * Devolve null para convidado; nunca lança.
 */
async function usuarioDoCookie(cookieHeader) {
  const sessao = lerToken(tokenDoHeader(cookieHeader));
  if (!sessao) return null;

  try {
    return await Usuario.findById(sessao.userId);
  } catch {
    return null;
  }
}

/** Middleware do Express: preenche `req.usuario` (ou null). */
async function carregarUsuario(req, res, next) {
  req.usuario = await usuarioDoCookie(req.headers.cookie);
  next();
}

module.exports = { usuarioDoCookie, carregarUsuario };
