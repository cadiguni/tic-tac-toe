const express = require('express');

const Usuario = require('../models/Usuario');
const { MIN_USUARIO, MAX_USUARIO, FORMATO_USUARIO } = Usuario;
const { hashSenha, verificarSenha, validarSenha } = require('./senha');
const { definirCookie, limparCookie } = require('./sessao');

const router = express.Router();

// Hash descartável usado para gastar o mesmo tempo quando o usuário não existe,
// de modo que o tempo de resposta não revele quais contas existem.
const HASH_FALSO = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(88);

// ---------------------------------------------------------------------------
// Rate limit por IP (proteção contra força bruta no login)
// ---------------------------------------------------------------------------

const tentativasPorIp = new Map();
const JANELA_MS = 15 * 60 * 1000;
const MAX_TENTATIVAS = 10;

function limitarPorIp(req, res, next) {
    const ip = req.ip || req.socket.remoteAddress || 'desconhecido';
    const agora = Date.now();

    const tentativas = (tentativasPorIp.get(ip) || []).filter(t => t > agora - JANELA_MS);

    if (tentativas.length >= MAX_TENTATIVAS) {
        return res.status(429).json({ erro: 'Muitas tentativas. Tente de novo em alguns minutos.' });
    }

    tentativas.push(agora);
    tentativasPorIp.set(ip, tentativas);
    next();
}

// Evita que o Map cresça para sempre com IPs que pararam de tentar
setInterval(() => {
    const limite = Date.now() - JANELA_MS;
    for (const [ip, tentativas] of tentativasPorIp) {
        const recentes = tentativas.filter(t => t > limite);
        if (recentes.length === 0) tentativasPorIp.delete(ip);
        else tentativasPorIp.set(ip, recentes);
    }
}, JANELA_MS).unref();

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

function validarUsuario(usuario) {
    if (typeof usuario !== 'string') return 'Usuário inválido.';

    const limpo = usuario.trim();
    if (limpo.length < MIN_USUARIO) return `O usuário precisa ter pelo menos ${MIN_USUARIO} caracteres.`;
    if (limpo.length > MAX_USUARIO) return `O usuário pode ter no máximo ${MAX_USUARIO} caracteres.`;
    if (!FORMATO_USUARIO.test(limpo)) return 'Use apenas letras, números, ponto, hífen e underscore.';

    return null;
}

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

router.post('/registrar', limitarPorIp, async (req, res) => {
    const { usuario, senha } = req.body || {};

    const erroUsuario = validarUsuario(usuario);
    if (erroUsuario) return res.status(400).json({ erro: erroUsuario });

    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    const nomeExibicao = usuario.trim();
    const chave = nomeExibicao.toLowerCase();

    try {
        if (await Usuario.exists({ usuario: chave })) {
            return res.status(409).json({ erro: 'Esse usuário já existe.' });
        }

        const novo = await Usuario.create({
            usuario: chave,
            nomeExibicao,
            senhaHash: await hashSenha(senha)
        });

        definirCookie(res, novo._id.toString());
        res.status(201).json({ usuario: novo.paraCliente() });
    } catch (err) {
        // Índice único pode estourar numa corrida entre dois cadastros iguais
        if (err.code === 11000) {
            return res.status(409).json({ erro: 'Esse usuário já existe.' });
        }

        console.error('Erro ao registrar:', err.message);
        res.status(500).json({ erro: 'Não foi possível criar a conta.' });
    }
});

router.post('/login', limitarPorIp, async (req, res) => {
    const { usuario, senha } = req.body || {};

    if (typeof usuario !== 'string' || typeof senha !== 'string') {
        return res.status(400).json({ erro: 'Informe usuário e senha.' });
    }

    try {
        const conta = await Usuario.findOne({ usuario: usuario.trim().toLowerCase() });

        // Mesma mensagem e mesmo custo de CPU nos dois casos: não revela se a
        // conta existe.
        const confere = await verificarSenha(senha, conta ? conta.senhaHash : HASH_FALSO);

        if (!conta || !confere) {
            return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
        }

        conta.ultimoAcesso = new Date();
        await conta.save();

        definirCookie(res, conta._id.toString());
        res.json({ usuario: conta.paraCliente() });
    } catch (err) {
        console.error('Erro no login:', err.message);
        res.status(500).json({ erro: 'Não foi possível entrar.' });
    }
});

router.post('/logout', (req, res) => {
    limparCookie(res);
    res.json({ ok: true });
});

router.get('/eu', (req, res) => {
    res.json({ usuario: req.usuario ? req.usuario.paraCliente() : null });
});

module.exports = router;
