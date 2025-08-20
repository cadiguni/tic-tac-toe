const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const { nanoid } = require('nanoid'); // Versão 3.x compatível com require

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

// Estado das salas
const salas = {};

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
            salas[salaId] = { jogadores: [], turno: 'X', tabuleiro: Array(9).fill('') };
        }

        const sala = salas[salaId];

        if (sala.jogadores.length >= 2) {
            socket.emit('mensagem', 'Sala cheia!');
            return;
        }

        const simbolo = sala.jogadores.length === 0 ? 'X' : 'O';
        sala.jogadores.push({ id: socket.id, nome, simbolo });
        socket.join(salaId);

        socket.emit('atribuirSimbolo', {
            simbolo,
            comeca: sala.turno === simbolo
        });

        io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `${nome} entrou como ${simbolo}` });
        console.log(`Jogador ${nome} entrou na sala ${salaId} como ${simbolo}`);
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
    
        // 1️⃣ Verifica se é turno do jogador
        if (sala.turno !== jogador.simbolo) {
            socket.emit('mensagem', 'Não é sua vez!');
            return;
        }
    
        // 2️⃣ Verifica se a célula está vazia
        if (sala.tabuleiro[pos] !== '') {
            socket.emit('mensagem', 'Célula ocupada!');
            return;
        }
    
        // 3️⃣ Aplica a jogada no tabuleiro do servidor
        sala.tabuleiro[pos] = jogador.simbolo;
    
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
            io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `🏆 ${jogador.nome} (${jogador.simbolo}) venceu!` });
            setTimeout(() => {
                sala.tabuleiro = Array(9).fill('');
                sala.turno = 'X';
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
        io.to(salaId).emit('mensagemChat', { nome, texto });
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
            const index = sala.jogadores.findIndex(j => j.id === socket.id);

            if (index !== -1) {
                const [removido] = sala.jogadores.splice(index, 1);
                io.to(salaId).emit('mensagemChat', { nome: 'Sistema', texto: `${removido.nome} saiu da partida` });

                if (sala.jogadores.length === 0) delete salas[salaId];
                break;
            }
        }
    });
});

server.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));
