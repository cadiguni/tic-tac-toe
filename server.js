const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { nanoid } = require('nanoid'); // Versão 3.x compatível com require

// Banco de dados
const connectDB = require('./db/db');
const Partida = require('./models/Partida');
connectDB();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

// Estado das salas
const salas = {};

// Rate limiting para mensagens de chat
const chatLimits = new Map();

// Validação anti-trapaça
function validarJogada(sala, jogador, pos) {
    // Verificar se é turno do jogador
    if (sala.turno !== jogador.simbolo) {
        return { valida: false, erro: 'Não é sua vez!' };
    }
    
    // Verificar se a posição é válida
    if (pos < 0 || pos > 8) {
        return { valida: false, erro: 'Posição inválida!' };
    }
    
    // Verificar se a célula está vazia
    if (sala.tabuleiro[pos] !== '') {
        return { valida: false, erro: 'Posição já ocupada!' };
    }
    
    // Verificar se o jogo ainda não terminou
    if (sala.finalizada) {
        return { valida: false, erro: 'Jogo já finalizado!' };
    }
    
    return { valida: true };
}

function verificarRateLimit(socketId, tipo = 'chat', limite = 5, janela = 60000) {
    const agora = Date.now();
    const chave = `${socketId}-${tipo}`;
    
    if (!chatLimits.has(chave)) {
        chatLimits.set(chave, []);
    }
    
    const tentativas = chatLimits.get(chave);
    
    // Remove tentativas antigas
    while (tentativas.length > 0 && tentativas[0] < agora - janela) {
        tentativas.shift();
    }
    
    if (tentativas.length >= limite) {
        return false;
    }
    
    tentativas.push(agora);
    return true;
}

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/home.html');
});

// Criar nova sala e redirecionar
app.get('/criarSala', (req, res) => {
    const salaId = nanoid(6);
    salas[salaId] = { jogadores: [], turno: 'X', tabuleiro: Array(9).fill('') };
    res.redirect(`/sala/${salaId}`);
});

// Entrar em sala
app.get('/sala/:id', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('entrarSala', ({ salaId, nome }) => {
        // Se o jogador não passou uma salaId (prompt vazio), cria uma nova
        if (!salaId || salaId.trim() === '') {
            salaId = nanoid(6);
            console.log(`Sala criada automaticamente: ${salaId}`);
        }

        // Cria a sala caso não exista
        if (!salas[salaId]) {
            salas[salaId] = { 
                jogadores: [], 
                turno: 'X', 
                tabuleiro: Array(9).fill(''),
                criadaEm: new Date(),
                totalJogadas: 0
            };
        }

        const sala = salas[salaId];

        // Verificar se é uma reconexão
        const jogadorExistente = sala.jogadores.find(j => j.nome === nome);
        
        if (jogadorExistente) {
            // Reconexão
            jogadorExistente.id = socket.id;
            jogadorExistente.online = true;
            delete jogadorExistente.desconectadoEm;
            socket.join(salaId);
            
            socket.emit('atribuirSimbolo', {
                simbolo: jogadorExistente.simbolo,
                comeca: sala.turno === jogadorExistente.simbolo
            });
            
            io.to(salaId).emit('mensagemChat', { 
                nome: 'Sistema', 
                texto: `${nome} reconectou como ${jogadorExistente.simbolo}` 
            });
            
            // Enviar estado atual do tabuleiro
            sala.tabuleiro.forEach((valor, pos) => {
                if (valor !== '') {
                    socket.emit('jogada', { pos, simbolo: valor });
                }
            });
            
        } else {
            // Nova conexão
            if (sala.jogadores.filter(j => j.online).length >= 2) {
                socket.emit('mensagem', 'Sala cheia!');
                return;
            }

            const simbolo = sala.jogadores.length === 0 ? 'X' : 'O';
            sala.jogadores.push({ 
                id: socket.id, 
                nome, 
                simbolo, 
                online: true,
                ultimaAtividade: new Date()
            });
            socket.join(salaId);

            socket.emit('atribuirSimbolo', {
                simbolo,
                comeca: sala.turno === simbolo
            });

            io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `${nome} entrou como ${simbolo}` });
            console.log(`Jogador ${nome} entrou na sala ${salaId} como ${simbolo}`);
        }

        // Enviar lista de jogadores atualizada
        io.to(salaId).emit('atualizarJogadores', sala.jogadores);
    });


    socket.on('escolherInicio', ({ salaId, simbolo }) => {
        const sala = salas[salaId];
        if (!sala) return;

        sala.turno = simbolo;

        io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `${simbolo} começa a partida` });

        sala.jogadores.forEach(jogador => {
            io.to(jogador.id).emit('atribuirSimbolo', {
                simbolo: jogador.simbolo,
                comeca: jogador.simbolo === simbolo
            });
        });
    });

    socket.on('jogada', ({ salaId, pos }) => {
        const sala = salas[salaId];
        if (!sala) return;
    
        const jogador = sala.jogadores.find(j => j.id === socket.id);
        if (!jogador) return;
        
        // Rate limiting para jogadas
        if (!verificarRateLimit(socket.id, 'jogada', 10, 10000)) {
            socket.emit('mensagem', 'Muitas jogadas muito rapidamente!');
            return;
        }
    
        // Validar jogada
        const validacao = validarJogada(sala, jogador, parseInt(pos));
        if (!validacao.valida) {
            socket.emit('mensagem', validacao.erro);
            return;
        }
    
        // 3️⃣ Aplica a jogada no tabuleiro do servidor
        sala.tabuleiro[pos] = jogador.simbolo;
        sala.totalJogadas = (sala.totalJogadas || 0) + 1;
        
        // Atualizar última atividade
        jogador.ultimaAtividade = new Date();
    
        // 4️⃣ Envia a jogada para todos na sala
        io.to(salaId).emit('jogada', { pos, simbolo: jogador.simbolo, nome: jogador.nome });
    
        // 5️⃣ Alterna turno
        sala.turno = jogador.simbolo === 'X' ? 'O' : 'X';
    
        // 6️⃣ Checa vitória no servidor
        const combinacoes = [
            [0,1,2], [3,4,5], [6,7,8],
            [0,3,6], [1,4,7], [2,5,8],
            [0,4,8], [2,4,6]
        ];
    
        const venceu = combinacoes.some(comb => {
            const [a, b, c] = comb;
            const valores = [sala.tabuleiro[a], sala.tabuleiro[b], sala.tabuleiro[c]];
            return valores[0] && valores.every(v => v === valores[0]);
        });
    
        if (venceu) {
            sala.finalizada = true;
            io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `🏆 ${jogador.nome} (${jogador.simbolo}) venceu!` });
            
            // Emitir evento de vitória para cada jogador
            sala.jogadores.forEach(j => {
                io.to(j.id).emit('vitoria', {
                    vencedor: jogador.nome,
                    simbolo: jogador.simbolo,
                    euVenci: j.id === jogador.id
                });
            });
        
            // 📌 Salvar no Mongo + atualizar ranking
            const partidaDuracao = sala.criadaEm ? Math.floor((new Date() - sala.criadaEm) / 1000) : 0;
            
            const partida = new Partida({
                salaId,
                jogadores: sala.jogadores.map(j => j.nome),
                vencedor: jogador.nome,
                dataPartida: new Date(),
                duracao: partidaDuracao,
                totalJogadas: sala.totalJogadas
            });
        
            partida.save().then(async () => {
                console.log('📌 Partida salva');
            
                // Atualiza ranking global
                const ranking = await Partida.aggregate([
                    { $group: { _id: "$vencedor", vitorias: { $sum: 1 } } },
                    { $sort: { vitorias: -1 } }
                ]);
            
                // Envia ranking atualizado para todos
                io.emit('rankingAtualizado', ranking);
            });
        
            setTimeout(() => {
                sala.tabuleiro = Array(9).fill('');
                sala.turno = 'X';
                sala.finalizada = false;
                sala.totalJogadas = 0;
                sala.criadaEm = new Date();
                io.to(salaId).emit('resetar');
            }, 3000);
        }
        else if (sala.tabuleiro.every(c => c !== '')) {
            sala.finalizada = true;
            io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: '🤝 Empate!' });
            
            // Emitir evento de empate
            io.to(salaId).emit('empate');
            
            // Salvar empate no banco
            const partidaDuracao = sala.criadaEm ? Math.floor((new Date() - sala.criadaEm) / 1000) : 0;
            
            const partida = new Partida({
                salaId,
                jogadores: sala.jogadores.map(j => j.nome),
                vencedor: 'Empate',
                dataPartida: new Date(),
                duracao: partidaDuracao,
                totalJogadas: sala.totalJogadas
            });
            
            partida.save();
            
            setTimeout(() => {
                sala.tabuleiro = Array(9).fill('');
                sala.turno = 'X';
                sala.finalizada = false;
                sala.totalJogadas = 0;
                sala.criadaEm = new Date();
                io.to(salaId).emit('resetar');
            }, 3000);
        }

    });


    socket.on('vitoria', ({ salaId, simbolo }) => {
        const sala = salas[salaId];
        if (!sala) return;

        const jogador = sala.jogadores.find(j => j.simbolo === simbolo);
        if (!jogador) return;

        io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `🏆 ${jogador.nome} (${simbolo}) venceu!` });

        setTimeout(() => {
            io.to(salaId).emit('resetar');
            sala.turno = 'X';
        }, 3000);
    });

    socket.on('mensagemChat', ({ salaId, nome, texto }) => {
        // Rate limiting para chat
        if (!verificarRateLimit(socket.id, 'chat', 10, 60000)) {
            socket.emit('mensagem', 'Muitas mensagens muito rapidamente!');
            return;
        }
        
        // Validar entrada
        if (!texto || texto.trim().length === 0) return;
        if (texto.length > 200) {
            socket.emit('mensagem', 'Mensagem muito longa!');
            return;
        }
        
        // Sanitizar texto básico
        const textoLimpo = texto.trim().substring(0, 200);
        
        io.to(salaId).emit('mensagemChat', { nome, texto: textoLimpo });
    });

    socket.on('reiniciar', (data) => {
        if (!data || !data.salaId) {
            console.error('Reiniciar recebido sem salaId');
            return;
        }

        const { salaId } = data;
        const sala = salas[salaId];

        if (!sala) {
            console.error(`Sala ${salaId} não encontrada para reinício`);
            return;
        }

        sala.tabuleiro = Array(9).fill('');
        sala.turno = 'X';
        io.to(salaId).emit('resetar');
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);

        for (const salaId in salas) {
            const sala = salas[salaId];
            const jogador = sala.jogadores.find(j => j.id === socket.id);

            if (jogador) {
                // Marcar como offline em vez de remover imediatamente
                jogador.online = false;
                jogador.desconectadoEm = new Date();
                
                io.to(salaId).emit('mensagemChat', { 
                    nome: 'Sistema', 
                    texto: `${jogador.nome} desconectou` 
                });
                
                // Atualizar lista de jogadores
                io.to(salaId).emit('atualizarJogadores', sala.jogadores);
                
                // Remover jogador após 30 segundos se não reconectar
                setTimeout(() => {
                    const index = sala.jogadores.findIndex(j => j.id === socket.id);
                    if (index !== -1 && !sala.jogadores[index].online) {
                        sala.jogadores.splice(index, 1);
                        io.to(salaId).emit('mensagemChat', { 
                            nome: 'Sistema', 
                            texto: `${jogador.nome} saiu da partida` 
                        });
                        
                        if (sala.jogadores.length === 0) {
                            delete salas[salaId];
                        } else {
                            io.to(salaId).emit('atualizarJogadores', sala.jogadores);
                        }
                    }
                }, 30000);
                
                break;
            }
        }
    });
});


// 📌 Rota REST para ver ranking global
app.get('/ranking', async (req, res) => {
  try {
    // Se for uma requisição AJAX (Accept: application/json), retorna JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      const ranking = await Partida.aggregate([
        { $group: { _id: "$vencedor", vitorias: { $sum: 1 } } },
        { $sort: { vitorias: -1 } }
      ]);
      res.json(ranking);
    } else {
      // Senão, serve a página HTML
      res.sendFile(__dirname + '/public/ranking.html');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao buscar ranking");
  }
});

// 📊 Rota para estatísticas globais
app.get('/estatisticas', async (req, res) => {
  try {
    const totalPartidas = await Partida.countDocuments();
    const partidasHoje = await Partida.countDocuments({
      dataPartida: { $gte: new Date().setHours(0,0,0,0) }
    });
    
    const duracaoMedia = await Partida.aggregate([
      { $group: { _id: null, media: { $avg: "$duracao" } } }
    ]);
    
    const jogadorMaisAtivo = await Partida.aggregate([
      { $unwind: "$jogadores" },
      { $group: { _id: "$jogadores", partidas: { $sum: 1 } } },
      { $sort: { partidas: -1 } },
      { $limit: 1 }
    ]);
    
    res.json({
      totalPartidas,
      partidasHoje,
      duracaoMediaSegundos: duracaoMedia[0]?.media || 0,
      jogadorMaisAtivo: jogadorMaisAtivo[0] || null,
      salasAtivas: Object.keys(salas).length
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao buscar estatísticas");
  }
});

// 🏠 Rota para criar sala nova
app.get('/nova-sala', (req, res) => {
    const salaId = nanoid(6);
    salas[salaId] = { 
        jogadores: [], 
        turno: 'X', 
        tabuleiro: Array(9).fill(''),
        criadaEm: new Date(),
        totalJogadas: 0
    };
    res.redirect(`/sala/${salaId}`);
});


server.listen(3000, () => {
    console.log('🎮 Servidor rodando em:');
    console.log('   Local:   http://localhost:3000');
    
    // Tentar mostrar IP local para facilitar acesso de outras máquinas
    const os = require('os');
    const interfaces = os.networkInterfaces();
    
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                console.log(`   Rede:    http://${interface.address}:3000`);
                break;
            }
        }
    }
    
    console.log('\n📋 Para criar nova sala: http://localhost:3000/nova-sala');
    console.log('📊 Estatísticas: http://localhost:3000/estatisticas');
    console.log('🏆 Ranking: http://localhost:3000/ranking');
});
