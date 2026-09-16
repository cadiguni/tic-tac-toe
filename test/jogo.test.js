const test = require('node:test');
const assert = require('node:assert');
const { io: criarCliente } = require('socket.io-client');

// ---------------------------------------------------------------------------
// Sobe o servidor real com MongoDB stubado: o objetivo aqui é o protocolo de
// socket (entrada na sala, turnos, modo infinito), não a persistência.
// ---------------------------------------------------------------------------

function stub(caminho, exports) {
  const resolvido = require.resolve(caminho);
  require.cache[resolvido] = { id: resolvido, filename: resolvido, loaded: true, exports };
}

const partidasSalvas = [];

stub('../db/db', async () => {});
stub('../models/Partida', {
  create: async (doc) => { partidasSalvas.push(doc); return doc; },
  aggregate: async () => [],
  countDocuments: async () => 0
});

process.env.PORT = '0';
const { server, io, salas } = require('../server');

const pronto = new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

async function baseUrl() {
  await pronto;
  return `http://127.0.0.1:${server.address().port}`;
}

/** Cliente conectado, com um buffer dos eventos recebidos. */
async function conectar() {
  const socket = criarCliente(await baseUrl(), { transports: ['websocket'], forceNew: true });
  const espera = new Map();

  const registrar = (evento) => {
    socket.on(evento, (payload) => {
      const fila = espera.get(evento) || [];
      fila.push(payload);
      espera.set(evento, fila);
    });
  };

  ['estadoSala', 'atribuirSimbolo', 'entradaRecusada', 'mensagem', 'vitoria', 'empate'].forEach(registrar);

  socket.proximo = (evento, filtro = () => true, timeout = 3000) => new Promise((resolve, reject) => {
    const fila = espera.get(evento) || [];
    const index = fila.findIndex(filtro);
    if (index !== -1) {
      resolve(fila.splice(index, 1)[0]);
      return;
    }

    const cronometro = setTimeout(() => {
      socket.off(evento, handler);
      reject(new Error(`timeout esperando "${evento}"`));
    }, timeout);

    function handler(payload) {
      if (!filtro(payload)) return;
      clearTimeout(cronometro);
      socket.off(evento, handler);
      // Remove do buffer para não ser reentregue
      const buffer = espera.get(evento) || [];
      const i = buffer.indexOf(payload);
      if (i !== -1) buffer.splice(i, 1);
      resolve(payload);
    }

    socket.on(evento, handler);
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  return socket;
}

async function entrar(socket, salaId, nome, modo) {
  socket.emit('entrarSala', { salaId, nome, modo });
  return socket.proximo('atribuirSimbolo');
}

/** Joga e devolve o estadoSala correspondente àquela jogada. */
async function jogarEsperando(socket, salaId, pos) {
  const estado = socket.proximo('estadoSala', e => e.ultimaJogada && e.ultimaJogada.pos === pos);
  socket.emit('jogada', { salaId, pos });
  return estado;
}

test.after(() => {
  io.close();
  server.close();
});

test('dois jogadores entram e recebem X e O', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  const simboloA = await entrar(a, 'sala-basica', 'Ana');
  const simboloB = await entrar(b, 'sala-basica', 'Bruno');

  assert.strictEqual(simboloA.simbolo, 'X');
  assert.strictEqual(simboloB.simbolo, 'O');

  const estado = await b.proximo('estadoSala', e => e.jogadores.length === 2);
  assert.strictEqual(estado.modo, 'classico', 'sem modo informado, a sala é clássica');
  assert.strictEqual(estado.turno, 'X');
});

test('um terceiro jogador é recusado com a sala cheia', async (t) => {
  const a = await conectar();
  const b = await conectar();
  const c = await conectar();
  t.after(() => { a.close(); b.close(); c.close(); });

  await entrar(a, 'sala-cheia', 'Ana');
  await entrar(b, 'sala-cheia', 'Bruno');

  c.emit('entrarSala', { salaId: 'sala-cheia', nome: 'Carla' });
  assert.match(await c.proximo('entradaRecusada'), /cheia/i);
});

test('não dá para assumir o assento de um jogador que está online', async (t) => {
  const a = await conectar();
  const impostor = await conectar();
  t.after(() => { a.close(); impostor.close(); });

  await entrar(a, 'sala-impostor', 'Ana');

  impostor.emit('entrarSala', { salaId: 'sala-impostor', nome: 'Ana' });
  const recusa = await impostor.proximo('entradaRecusada');
  assert.match(recusa, /Já existe um "Ana"/);

  assert.strictEqual(salas['sala-impostor'].jogadores.length, 1);
});

test('jogar fora do turno é rejeitado pelo servidor', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  await entrar(a, 'sala-turno', 'Ana');
  await entrar(b, 'sala-turno', 'Bruno');

  b.emit('jogada', { salaId: 'sala-turno', pos: 0 }); // O tentando jogar primeiro
  assert.strictEqual(await b.proximo('mensagem'), 'Não é sua vez!');
  assert.strictEqual(salas['sala-turno'].jogo.tabuleiro[0], '');
});

test('infinito: a 4ª marca faz a mais antiga sumir e o estado avisa qual expira', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  await entrar(a, 'sala-inf', 'Ana', 'infinito');
  await entrar(b, 'sala-inf', 'Bruno', 'infinito');

  const inicial = await b.proximo('estadoSala', e => e.jogadores.length === 2);
  assert.strictEqual(inicial.modo, 'infinito');
  assert.strictEqual(inicial.modoNome, 'Infinito');

  // Ana (X) ocupa 0, 1, 8 sem fechar linha; Bruno (O) ocupa 3, 4 e 7.
  await jogarEsperando(a, 'sala-inf', 0);
  await jogarEsperando(b, 'sala-inf', 3);
  await jogarEsperando(a, 'sala-inf', 1);
  await jogarEsperando(b, 'sala-inf', 4);
  await jogarEsperando(a, 'sala-inf', 8);
  const estadoAntes = await jogarEsperando(b, 'sala-inf', 7);

  assert.deepStrictEqual(estadoAntes.expirando, { X: 0, O: 3 }, 'ambos com 3 marcas já expiram');
  assert.strictEqual(estadoAntes.removida, null, 'nada some antes da 4ª marca');

  // 4ª marca de Ana: a de posição 0 deve sair.
  const estadoDepois = await jogarEsperando(a, 'sala-inf', 2);
  assert.strictEqual(estadoDepois.removida, 0);
  assert.strictEqual(estadoDepois.tabuleiro[0], '');
  assert.strictEqual(estadoDepois.tabuleiro[2], 'X');
  assert.strictEqual(estadoDepois.expirando.X, 1, 'a próxima a sumir passa a ser a marca 1');
  assert.strictEqual(estadoDepois.linha, null, 'a linha 0-1-2 não se forma, pois 0 saiu');
});

test('infinito: partida termina em vitória e é registrada com o modo', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  await entrar(a, 'sala-vitoria', 'Ana', 'infinito');
  await entrar(b, 'sala-vitoria', 'Bruno', 'infinito');

  // Ana fecha a coluna 0-3-6 com as 3 primeiras marcas.
  await jogarEsperando(a, 'sala-vitoria', 0);
  await jogarEsperando(b, 'sala-vitoria', 1);
  await jogarEsperando(a, 'sala-vitoria', 3);
  await jogarEsperando(b, 'sala-vitoria', 2);

  const estadoFinal = a.proximo('estadoSala', e => e.linha);
  const vitoriaA = a.proximo('vitoria');
  const vitoriaB = b.proximo('vitoria');
  a.emit('jogada', { salaId: 'sala-vitoria', pos: 6 });

  assert.deepStrictEqual((await estadoFinal).linha, [0, 3, 6]);

  const resultadoA = await vitoriaA;
  const resultadoB = await vitoriaB;
  assert.strictEqual(resultadoA.euVenci, true);
  assert.strictEqual(resultadoA.oponente, 'Bruno');
  assert.strictEqual(resultadoB.euVenci, false);
  assert.strictEqual(resultadoB.vencedor, 'Ana');

  const registro = partidasSalvas.find(p => p.salaId === 'sala-vitoria');
  assert.ok(registro, 'a partida deveria ter sido persistida');
  assert.strictEqual(registro.modo, 'infinito');
  assert.strictEqual(registro.vencedor, 'Ana');
});

test('escolherInicio só funciona antes da primeira jogada', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  await entrar(a, 'sala-inicio', 'Ana');
  await entrar(b, 'sala-inicio', 'Bruno');

  // Antes de jogar: permitido
  const trocou = a.proximo('estadoSala', e => e.turno === 'O');
  a.emit('escolherInicio', { salaId: 'sala-inicio', simbolo: 'O' });
  assert.strictEqual((await trocou).turno, 'O');

  await jogarEsperando(b, 'sala-inicio', 4);

  // Depois da primeira jogada: bloqueado
  a.emit('escolherInicio', { salaId: 'sala-inicio', simbolo: 'X' });
  assert.strictEqual(await a.proximo('mensagem'), 'A partida já começou!');
});

test('o chat usa o nome do assento no servidor, não o que o cliente enviar', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); });

  await entrar(a, 'sala-chat', 'Ana');
  await entrar(b, 'sala-chat', 'Bruno');

  const recebida = new Promise(resolve => {
    b.on('mensagemChat', (msg) => { if (msg.nome !== 'Sistema') resolve(msg); });
  });

  a.emit('mensagemChat', { salaId: 'sala-chat', nome: 'Bruno', texto: 'oi' });

  const msg = await recebida;
  assert.strictEqual(msg.nome, 'Ana', 'o nome forjado no payload deve ser ignorado');
  assert.strictEqual(msg.texto, 'oi');
});
