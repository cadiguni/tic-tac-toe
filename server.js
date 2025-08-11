const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

// Estado das salas:
// { salaId: { jogadores: [{id, nome, simbolo}], turno: 'X' } }
const salas = {};

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    socket.on('entrarSala', ({ salaId, nome }) => {
        if (!salas[salaId]) {
            salas[salaId] = { jogadores: [], turno: 'X' };
        }

        const sala = salas[salaId];

        if (sala.jogadores.length >= 2) {
            socket.emit('mensagem', 'Sala cheia!');
            return;
        }

        // Define símbolo automaticamente
        const simbolo = sala.jogadores.length === 0 ? 'X' : 'O';

        sala.jogadores.push({ id: socket.id, nome, simbolo });
        socket.join(salaId);

        socket.emit('atribuirSimbolo', {
            simbolo,
            comeca: sala.turno === simbolo
        });

        io.to(salaId).emit(
            'mensagemChat',
            { nome: 'Sistema', texto: `${nome} entrou como ${simbolo}` }
        );

        console.log(`Jogador ${nome} entrou na sala ${salaId} como ${simbolo}`);
    });

    socket.on('escolherInicio', ({ salaId, simbolo }) => {
        const sala = salas[salaId];
        if (!sala) return;

        sala.turno = simbolo;

        io.to(salaId).emit('mensagemChat', {
            nome: 'Sistema',
            texto: `${simbolo} começa a partida`
        });

        // Atualiza todos sobre quem começa
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

        // Validação de turno
        if (sala.turno !== jogador.simbolo) {
            socket.emit('mensagem', 'Não é sua vez!');
            return;
        }

        // Transmite a jogada
        socket.to(salaId).emit('jogada', { pos, simbolo: jogador.simbolo, nome: jogador.nome });

        // Alterna turno
        sala.turno = jogador.simbolo === 'X' ? 'O' : 'X';
    });

    socket.on('vitoria', ({ salaId, simbolo }) => {
        const sala = salas[salaId];
        if (!sala) return;

        const jogador = sala.jogadores.find(j => j.simbolo === simbolo);
        if (!jogador) return;

        io.to(salaId).emit('mensagemChat', {
            nome: 'Sistema',
            texto: `🏆 ${jogador.nome} (${simbolo}) venceu!`
        });

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
        const sala = salas.get(salaId); // Buscar a sala certa
      
        if (!sala) {
            console.error(`Sala ${salaId} não encontrada para reinício`);
            return;
        }
      
        // Reseta o turno para começar sempre com X
        sala.turno = 'X';
        sala.tabuleiro = Array(9).fill('');
        
        io.to(salaId).emit('resetar');
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);

        // Remove jogador da sala
        for (const salaId in salas) {
            const sala = salas[salaId];
            const index = sala.jogadores.findIndex(j => j.id === socket.id);

            if (index !== -1) {
                const [removido] = sala.jogadores.splice(index, 1);

                io.to(salaId).emit('mensagemChat', {
                    nome: 'Sistema',
                    texto: `${removido.nome} saiu da partida`
                });

                // Remove sala se estiver vazia
                if (sala.jogadores.length === 0) {
                    delete salas[salaId];
                }
                break;
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
