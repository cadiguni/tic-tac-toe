const path = require('path');
const http = require('http');
const express = require('express');
const socketIO = require('socket.io');
const { nanoid } = require('nanoid'); // 3.x — última linha compatível com require()

// Banco de dados
const connectDB = require('./db/db');
const Partida = require('./models/Partida');
const Usuario = require('./models/Usuario');

// Autenticação (conta opcional — convidado continua jogando sem cadastro)
const rotasAuth = require('./auth/rotas');
const { usuarioDoCookie, carregarUsuario } = require('./auth');
const { verificarConfiguracao } = require('./auth/sessao');

// Falha cedo e com mensagem clara, em vez de deixar o primeiro login virar 500
verificarConfiguracao();

// Regras de jogo (modo clássico e modo infinito)
const {
    MODOS,
    normalizarModo,
    criarEstadoJogo,
    validarJogada,
    aplicarJogada,
    marcasExpirando,
    linhaVencedora,
    verificarEmpate
} = require('./game/modos');

connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Configurações
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MS_ATE_REMOVER_JOGADOR = 30000;   // tolerância para reconexão
const MS_ATE_REINICIAR = 3000;          // pausa entre o fim da partida e o novo tabuleiro
const MS_SALA_VAZIA = 10 * 60000;       // sala sem jogadores é descartada depois disso
const MAX_NOME = 20;
const MAX_MENSAGEM = 200;

// Necessário para que o rate limit por IP enxergue o IP real atrás de proxy
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

app.use(express.json({ limit: '10kb' }));

// `index: false` é essencial: por padrão o express.static serve
// public/index.html na raiz, o que sequestrava "/" e entregava a tela de JOGO
// no lugar da home — sem seleção de modo e sem sala definida.
app.use(express.static(PUBLIC_DIR, { index: false }));

// Registro, login, logout e "quem sou eu"
app.use('/api', carregarUsuario, rotasAuth);

/** salaId -> { jogadores: [...], criadaEm: Date, jogo: EstadoJogo } */
const salas = {};

// Rate limiting por socket: chave `${socketId}-${tipo}` -> timestamps
const limitesPorSocket = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verificarRateLimit(socketId, tipo, limite, janela) {
    const agora = Date.now();
    const chave = `${socketId}-${tipo}`;

    if (!limitesPorSocket.has(chave)) {
        limitesPorSocket.set(chave, []);
    }

    const tentativas = limitesPorSocket.get(chave);
    while (tentativas.length > 0 && tentativas[0] < agora - janela) {
        tentativas.shift();
    }

    if (tentativas.length >= limite) return false;

    tentativas.push(agora);
    return true;
}

function limparLimites(socketId) {
    for (const chave of limitesPorSocket.keys()) {
        if (chave.startsWith(`${socketId}-`)) limitesPorSocket.delete(chave);
    }
}

function sanitizarNome(nome) {
    if (typeof nome !== 'string') return null;
    const limpo = nome.trim().replace(/\s+/g, ' ').slice(0, MAX_NOME);
    return limpo.length > 0 ? limpo : null;
}

function criarSala(modo) {
    return {
        jogadores: [],
        criadaEm: new Date(),
        jogo: criarEstadoJogo(modo)
    };
}

/**
 * Snapshot completo que o cliente usa para redesenhar a tela. Enviar o estado
 * inteiro (em vez de só o delta da jogada) mantém reconexão, modo infinito e
 * reinício consistentes com uma única fonte de verdade.
 */
function estadoPublico(sala, extras = {}) {
    const { jogo } = sala;
    return {
        modo: jogo.modo,
        modoNome: MODOS[jogo.modo].nome,
        modoDescricao: MODOS[jogo.modo].descricao,
        tabuleiro: jogo.tabuleiro,
        turno: jogo.turno,
        finalizada: jogo.finalizada,
        totalJogadas: jogo.totalJogadas,
        expirando: marcasExpirando(jogo),
        jogadores: sala.jogadores.map(j => ({
            nome: j.nome,
            simbolo: j.simbolo,
            online: j.online,
            conta: Boolean(j.contaId) // convidado aparece com selo diferente
        })),
        ...extras
    };
}

function emitirEstado(salaId, extras) {
    const sala = salas[salaId];
    if (sala) io.to(salaId).emit('estadoSala', estadoPublico(sala, extras));
}

function mensagemSistema(salaId, texto) {
    io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto });
}

/**
 * Só partidas vencidas por uma conta entram no ranking. Convidados gravam
 * `vencedorId: null` e ficam de fora, assim como as partidas anteriores à
 * existência do login — por isso não há script de migração.
 */
function calcularRanking(modo) {
    const filtro = { vencedorId: { $ne: null } };
    if (modo) filtro.modo = modo;

    return Partida.aggregate([
        { $match: filtro },
        { $group: { _id: '$vencedorId', vitorias: { $sum: 1 } } },
        { $sort: { vitorias: -1 } },
        { $limit: 50 },
        { $lookup: { from: 'usuarios', localField: '_id', foreignField: '_id', as: 'conta' } },
        { $unwind: '$conta' },
        { $project: { _id: '$conta.nomeExibicao', usuario: '$conta.usuario', vitorias: 1 } }
    ]);
}

/** @param vencedor jogador da sala que venceu, ou null em caso de empate. */
async function registrarPartida(salaId, sala, vencedor) {
    try {
        await Partida.create({
            salaId,
            modo: sala.jogo.modo,
            jogadores: sala.jogadores.map(j => j.nome),
            vencedor: vencedor ? vencedor.nome : 'Empate',
            vencedorId: vencedor && vencedor.contaId ? vencedor.contaId : null,
            jogadoresIds: sala.jogadores.filter(j => j.contaId).map(j => j.contaId),
            dataPartida: new Date(),
            duracao: Math.floor((Date.now() - sala.criadaEm.getTime()) / 1000),
            totalJogadas: sala.jogo.totalJogadas
        });

        io.emit('rankingAtualizado', await calcularRanking());
    } catch (err) {
        console.error('Erro ao salvar partida:', err.message);
    }
}

function agendarReinicio(salaId) {
    setTimeout(() => {
        const sala = salas[salaId];
        if (!sala) return;

        sala.jogo = criarEstadoJogo(sala.jogo.modo);
        sala.criadaEm = new Date();
        emitirEstado(salaId, { reiniciada: true });
    }, MS_ATE_REINICIAR);
}

// ---------------------------------------------------------------------------
// Rotas HTTP
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'home.html'));
});

// Cria uma sala nova já no modo pedido e redireciona para ela
app.get('/nova-sala', (req, res) => {
    const modo = normalizarModo(req.query.modo);
    const salaId = nanoid(6);
    salas[salaId] = criarSala(modo);
    res.redirect(`/sala/${salaId}?modo=${modo}`);
});

// Alias legado
app.get('/criarSala', (req, res) => {
    res.redirect(`/nova-sala?modo=${normalizarModo(req.query.modo)}`);
});

app.get('/sala/:id', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.get('/modos', (req, res) => {
    res.json(Object.values(MODOS));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', salasAtivas: Object.keys(salas).length, uptime: process.uptime() });
});

// Ranking global: JSON para AJAX, HTML para navegação direta
app.get('/ranking', async (req, res) => {
    try {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            const modo = req.query.modo ? normalizarModo(req.query.modo) : null;
            res.json(await calcularRanking(modo));
        } else {
            res.sendFile(path.join(PUBLIC_DIR, 'ranking.html'));
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar ranking');
    }
});

app.get('/estatisticas', async (req, res) => {
    try {
        const [totalPartidas, partidasHoje, duracaoMedia, jogadorMaisAtivo, porModo] = await Promise.all([
            Partida.countDocuments(),
            Partida.countDocuments({ dataPartida: { $gte: new Date().setHours(0, 0, 0, 0) } }),
            Partida.aggregate([{ $group: { _id: null, media: { $avg: '$duracao' } } }]),
            Partida.aggregate([
                { $unwind: '$jogadores' },
                { $group: { _id: '$jogadores', partidas: { $sum: 1 } } },
                { $sort: { partidas: -1 } },
                { $limit: 1 }
            ]),
            Partida.aggregate([{ $group: { _id: '$modo', partidas: { $sum: 1 } } }])
        ]);

        res.json({
            totalPartidas,
            partidasHoje,
            duracaoMediaSegundos: duracaoMedia[0]?.media || 0,
            jogadorMaisAtivo: jogadorMaisAtivo[0] || null,
            partidasPorModo: porModo,
            salasAtivas: Object.keys(salas).length
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Erro ao buscar estatísticas');
    }
});

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

// A identidade vem do mesmo cookie usado pelas rotas HTTP, lido no handshake.
// `socket.data.conta` fica null para convidado.
io.use(async (socket, next) => {
    socket.data.conta = await usuarioDoCookie(socket.handshake.headers.cookie);
    next();
});

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('entrarSala', async ({ salaId, nome, modo }) => {
        const conta = socket.data.conta;
        let nomeLimpo;
        let contaId = null;

        if (conta) {
            // Logado: o nome vem da conta, não do que o cliente mandar.
            nomeLimpo = conta.nomeExibicao;
            contaId = conta._id.toString();
        } else {
            nomeLimpo = sanitizarNome(nome);
            if (!nomeLimpo) {
                socket.emit('entradaRecusada', 'Nome inválido.');
                return;
            }

            // Convidado não pode usar o nome de uma conta registrada — senão
            // daria para se passar por quem está no ranking.
            try {
                if (await Usuario.exists({ usuario: nomeLimpo.toLowerCase() })) {
                    socket.emit('entradaRecusada', 'Esse nome pertence a uma conta. Faça login ou escolha outro.');
                    return;
                }
            } catch (err) {
                console.error('Erro ao checar nome de convidado:', err.message);
            }
        }

        // Inventar uma sala aleatória aqui era pior do que recusar: cada
        // jogador caía numa sala diferente, achando que estava na mesma.
        if (!salaId || String(salaId).trim() === '') {
            socket.emit('entradaRecusada', 'Sala não informada. Volte ao início e crie ou escolha uma sala.');
            return;
        }
        salaId = String(salaId).trim().slice(0, 32);

        // O modo só vale na criação da sala: quem entra depois joga o modo dela.
        if (!salas[salaId]) {
            salas[salaId] = criarSala(modo);
        }

        const sala = salas[salaId];

        // Conta reconecta pelo id; convidado, pelo nome.
        const assento = contaId
            ? sala.jogadores.find(j => j.contaId === contaId)
            : sala.jogadores.find(j => !j.contaId && j.nome === nomeLimpo);

        if (assento) {
            // Só é reconexão se o assento estiver livre; senão é alguém tentando
            // assumir o lugar de um jogador que está online.
            if (assento.online) {
                socket.emit('entradaRecusada', `Já existe um "${nomeLimpo}" nesta sala. Escolha outro nome.`);
                return;
            }

            clearTimeout(assento.timerRemocao);
            assento.timerRemocao = null;
            assento.id = socket.id;
            assento.online = true;
            delete assento.desconectadoEm;
            socket.join(salaId);

            socket.emit('atribuirSimbolo', { simbolo: assento.simbolo, salaId, conta: Boolean(contaId), nome: nomeLimpo });
            mensagemSistema(salaId, `${nomeLimpo} reconectou como ${assento.simbolo}`);
        } else {
            if (sala.jogadores.length >= 2) {
                socket.emit('entradaRecusada', 'Sala cheia!');
                return;
            }

            // Escolhe o símbolo livre, e não pela quantidade de jogadores — se o X
            // saiu, o próximo a entrar deve receber X de volta.
            const usados = new Set(sala.jogadores.map(j => j.simbolo));
            const simbolo = usados.has('X') ? 'O' : 'X';

            sala.jogadores.push({
                id: socket.id,
                nome: nomeLimpo,
                contaId,
                simbolo,
                online: true,
                timerRemocao: null,
                ultimaAtividade: new Date()
            });
            socket.join(salaId);

            socket.emit('atribuirSimbolo', { simbolo, salaId, conta: Boolean(contaId), nome: nomeLimpo });
            mensagemSistema(salaId, `${nomeLimpo} entrou como ${simbolo}`);
            console.log(`Jogador ${nomeLimpo} entrou na sala ${salaId} como ${simbolo} (modo ${sala.jogo.modo})`);
        }

        emitirEstado(salaId);
    });

    socket.on('escolherInicio', ({ salaId, simbolo }) => {
        const sala = salas[salaId];
        if (!sala) return;

        // Só quem está na sala decide, e só antes da primeira jogada.
        if (!sala.jogadores.some(j => j.id === socket.id)) return;
        if (simbolo !== 'X' && simbolo !== 'O') return;
        if (sala.jogo.totalJogadas > 0) {
            socket.emit('mensagem', 'A partida já começou!');
            return;
        }

        sala.jogo.turno = simbolo;
        mensagemSistema(salaId, `${simbolo} começa a partida`);
        emitirEstado(salaId);
    });

    socket.on('jogada', ({ salaId, pos }) => {
        const sala = salas[salaId];
        if (!sala) return;

        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (!jogador) return;

        if (!verificarRateLimit(socket.id, 'jogada', 10, 10000)) {
            socket.emit('mensagem', 'Muitas jogadas muito rapidamente!');
            return;
        }

        const posicao = parseInt(pos, 10);
        const validacao = validarJogada(sala.jogo, jogador.simbolo, posicao);
        if (!validacao.valida) {
            socket.emit('mensagem', validacao.erro);
            return;
        }

        const { removida } = aplicarJogada(sala.jogo, jogador.simbolo, posicao);
        jogador.ultimaAtividade = new Date();

        const linha = linhaVencedora(sala.jogo.tabuleiro);
        const empatou = !linha && verificarEmpate(sala.jogo);

        if (linha || empatou) sala.jogo.finalizada = true;

        emitirEstado(salaId, {
            ultimaJogada: { pos: posicao, simbolo: jogador.simbolo, nome: jogador.nome },
            removida,
            linha
        });

        if (linha) {
            mensagemSistema(salaId, `🏆 ${jogador.nome} (${jogador.simbolo}) venceu!`);

            sala.jogadores.forEach(j => {
                io.to(j.id).emit('vitoria', {
                    vencedor: jogador.nome,
                    simbolo: jogador.simbolo,
                    euVenci: j.id === jogador.id,
                    oponente: sala.jogadores.find(outro => outro.id !== j.id)?.nome || 'Oponente',
                    linha
                });
            });

            registrarPartida(salaId, sala, jogador);
            agendarReinicio(salaId);
        } else if (empatou) {
            mensagemSistema(salaId, '🤝 Empate!');

            sala.jogadores.forEach(j => {
                io.to(j.id).emit('empate', {
                    oponente: sala.jogadores.find(outro => outro.id !== j.id)?.nome || 'Oponente'
                });
            });

            registrarPartida(salaId, sala, null);
            agendarReinicio(salaId);
        }
    });

    socket.on('mensagemChat', ({ salaId, texto }) => {
        const sala = salas[salaId];
        if (!sala) return;

        // O nome vem do assento no servidor, não do payload do cliente.
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (!jogador) return;

        if (!verificarRateLimit(socket.id, 'chat', 10, 60000)) {
            socket.emit('mensagem', 'Muitas mensagens muito rapidamente!');
            return;
        }

        if (typeof texto !== 'string' || texto.trim().length === 0) return;
        if (texto.length > MAX_MENSAGEM) {
            socket.emit('mensagem', 'Mensagem muito longa!');
            return;
        }

        io.to(salaId).emit('mensagemChat', {
            nome: jogador.nome,
            conta: Boolean(jogador.contaId),
            texto: texto.trim().slice(0, MAX_MENSAGEM)
        });
    });

    socket.on('reiniciar', (data) => {
        const salaId = data && data.salaId;
        const sala = salas[salaId];
        if (!sala) return;

        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (!jogador) return;

        sala.jogo = criarEstadoJogo(sala.jogo.modo);
        sala.criadaEm = new Date();
        mensagemSistema(salaId, `${jogador.nome} reiniciou a partida`);
        emitirEstado(salaId, { reiniciada: true });
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        limparLimites(socket.id);

        for (const salaId of Object.keys(salas)) {
            const sala = salas[salaId];
            const jogador = sala.jogadores.find(j => j.id === socket.id);
            if (!jogador) continue;

            jogador.online = false;
            jogador.desconectadoEm = new Date();

            mensagemSistema(salaId, `${jogador.nome} desconectou`);
            emitirEstado(salaId);

            // Guarda o assento por um tempo para permitir reconexão.
            jogador.timerRemocao = setTimeout(() => {
                const salaAtual = salas[salaId];
                if (!salaAtual) return;

                const index = salaAtual.jogadores.indexOf(jogador);
                if (index === -1 || jogador.online) return;

                salaAtual.jogadores.splice(index, 1);
                mensagemSistema(salaId, `${jogador.nome} saiu da partida`);

                if (salaAtual.jogadores.length === 0) {
                    delete salas[salaId];
                } else {
                    emitirEstado(salaId);
                }
            }, MS_ATE_REMOVER_JOGADOR);

            break;
        }
    });
});

// Salas criadas por link mas nunca usadas ficariam na memória para sempre.
setInterval(() => {
    const agora = Date.now();
    for (const [salaId, sala] of Object.entries(salas)) {
        if (sala.jogadores.length === 0 && agora - sala.criadaEm.getTime() > MS_SALA_VAZIA) {
            delete salas[salaId];
        }
    }
}, 60000).unref();

server.listen(PORT, () => {
    console.log('🎮 Servidor rodando em:');
    console.log(`   Local:   http://localhost:${PORT}`);

    if (NODE_ENV === 'development') {
        const os = require('os');
        const interfaces = os.networkInterfaces();

        for (const nomeInterface of Object.keys(interfaces)) {
            for (const iface of interfaces[nomeInterface]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    console.log(`   Rede:    http://${iface.address}:${PORT}`);
                    break;
                }
            }
        }
    }

    console.log(`\n📋 Sala clássica: http://localhost:${PORT}/nova-sala?modo=classico`);
    console.log(`♾️  Sala infinita: http://localhost:${PORT}/nova-sala?modo=infinito`);
    console.log(`📊 Estatísticas:  http://localhost:${PORT}/estatisticas`);
    console.log(`🏆 Ranking:       http://localhost:${PORT}/ranking`);
    console.log(`🌍 Ambiente: ${NODE_ENV}`);
});

// Exportado para os testes de integração (ver test/jogo.test.js)
module.exports = { app, server, io, salas };
