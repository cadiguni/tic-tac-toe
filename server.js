const express = require('express');
const http = require('http');
const socket = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socket(server);

app.use(express.static('public'));

let jogadores = [];

io.on('connection', (socket) => {
    console.log('Novo jogador conectado:', socket.id);

    if (jogadores.length >= 2) {
        socket.emit('mensagem', 'Jogo cheio!');
        socket.disconnect();
        return;
    }

    const simbolo = jogadores.length === 0 ? 'X' : 'O';
    jogadores.push({ id: socket.id, simbolo });
    socket.emit('atribuirSimbolo', simbolo);

    socket.on('jogada', (data) => {
        socket.broadcast.emit('jogada', data);
    });

    // 🆕 Listener para vitória
    socket.on('vitoria', (simbolo) => {
        io.emit('mensagem', `Jogador ${simbolo} venceu!`);

        setTimeout(() => {
            io.emit('resetar');
        }, 3000);
    });

    socket.on('disconnect', () => {
        console.log('Jogador desconectado:', socket.id);
        jogadores = jogadores.filter(j => j.id !== socket.id);
        
    });

    socket.on('reiniciar', () => {
        io.emit('resetar');
    });
    

});

server.listen(3000, () => {
    console.log('Servidor rodando em http://localhost:3000');
});
