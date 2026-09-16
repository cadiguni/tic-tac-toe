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

// Contas falsas em memória: nome em minúsculas -> conta
const contas = new Map();

function criarConta(nomeExibicao, id) {
  const conta = {
    _id: id,
    nomeExibicao,
    usuario: nomeExibicao.toLowerCase(),
    paraCliente: () => ({ id, usuario: nomeExibicao.toLowerCase(), nomeExibicao })
  };
  contas.set(conta.usuario, conta);
  return conta;
}

stub('../db/db', async () => {});
stub('../models/Partida', {
  create: async (doc) => { partidasSalvas.push(doc); return doc; },
  aggregate: async () => [],
  countDocuments: async () => 0
});

const UsuarioStub = {
  MIN_USUARIO: 3,
  MAX_USUARIO: 20,
  FORMATO_USUARIO: /^[a-zA-Z0-9._-]+$/,
  exists: async (filtro) => (contas.has(filtro.usuario) ? { _id: 'existe' } : null),
  findById: async (id) => [...contas.values()].find(c => c._id === String(id)) || null,
  findOne: async (filtro) => contas.get(filtro.usuario) || null
};
stub('../models/Usuario', UsuarioStub);

process.env.SESSION_SECRET = 'segredo-de-teste-integracao';
process.env.PORT = '0';

const { criarToken, NOME_COOKIE } = require('../auth/sessao');
const { server, io, salas } = require('../server');

const pronto = new Promise(resolve => {
  if (server.listening) return resolve();
  server.once('listening', resolve);
});

async function baseUrl() {
  await pronto;
  return `http://127.0.0.1:${server.address().port}`;
}

/**
 * Cliente conectado, com um buffer dos eventos recebidos.
 * Passando `conta`, o handshake leva o cookie de sessão daquela conta.
 */
async function conectar(conta = null) {
  const opcoes = { transports: ['websocket'], forceNew: true };

  if (conta) {
    opcoes.extraHeaders = { Cookie: `${NOME_COOKIE}=${criarToken(conta._id)}` };
  }

  const socket = criarCliente(await baseUrl(), opcoes);
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

// ---------------------------------------------------------------------------
// Identidade: conta x convidado
// ---------------------------------------------------------------------------

test('conta logada joga com o nome da conta, ignorando o nome enviado', async (t) => {
  const conta = criarConta('Lucas', 'id-lucas');
  const a = await conectar(conta);
  t.after(() => { a.close(); contas.clear(); });

  a.emit('entrarSala', { salaId: 'sala-conta', nome: 'OutroNomeQualquer' });
  const atribuicao = await a.proximo('atribuirSimbolo');

  assert.strictEqual(atribuicao.nome, 'Lucas', 'o nome deve vir da conta, não do payload');
  assert.strictEqual(atribuicao.conta, true);

  const estado = await a.proximo('estadoSala');
  assert.strictEqual(estado.jogadores[0].nome, 'Lucas');
  assert.strictEqual(estado.jogadores[0].conta, true, 'deve aparecer com selo de conta');
});

test('convidado entra sem cadastro e é marcado como convidado', async (t) => {
  const a = await conectar();
  t.after(() => { a.close(); contas.clear(); });

  a.emit('entrarSala', { salaId: 'sala-convidado', nome: 'Visitante' });
  const atribuicao = await a.proximo('atribuirSimbolo');

  assert.strictEqual(atribuicao.conta, false);

  const estado = await a.proximo('estadoSala');
  assert.strictEqual(estado.jogadores[0].nome, 'Visitante');
  assert.strictEqual(estado.jogadores[0].conta, false);
});

test('convidado não pode usar o nome de uma conta registrada', async (t) => {
  criarConta('Lucas', 'id-lucas');
  const impostor = await conectar();
  t.after(() => { impostor.close(); contas.clear(); });

  // Inclusive variando maiúsculas/minúsculas
  impostor.emit('entrarSala', { salaId: 'sala-nome-tomado', nome: 'lucas' });
  assert.match(await impostor.proximo('entradaRecusada'), /pertence a uma conta/i);

  assert.strictEqual(salas['sala-nome-tomado'], undefined, 'nem deveria criar assento');
});

test('cookie de sessão inválido cai para convidado em vez de dar erro', async (t) => {
  const socket = criarCliente(await baseUrl(), {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: { Cookie: `${NOME_COOKIE}=token.totalmente.invalido` }
  });
  await new Promise(r => socket.once('connect', r));
  t.after(() => { socket.close(); contas.clear(); });

  const atribuicao = new Promise(r => socket.once('atribuirSimbolo', r));
  socket.emit('entrarSala', { salaId: 'sala-cookie-ruim', nome: 'Fulano' });

  assert.strictEqual((await atribuicao).conta, false);
});

test('vitória de conta grava vencedorId; de convidado grava null', async (t) => {
  const conta = criarConta('Lucas', 'id-lucas');
  const logado = await conectar(conta);
  const convidado = await conectar();
  t.after(() => { logado.close(); convidado.close(); contas.clear(); });

  logado.emit('entrarSala', { salaId: 'sala-rank', nome: 'ignorado' });
  await logado.proximo('atribuirSimbolo');
  convidado.emit('entrarSala', { salaId: 'sala-rank', nome: 'Visitante' });
  await convidado.proximo('atribuirSimbolo');

  const jogar = async (quem, pos) => {
    const p = quem.proximo('estadoSala', e => e.ultimaJogada && e.ultimaJogada.pos === pos);
    quem.emit('jogada', { salaId: 'sala-rank', pos });
    return p;
  };

  // Lucas (X) fecha 0-3-6
  await jogar(logado, 0);
  await jogar(convidado, 1);
  await jogar(logado, 3);
  await jogar(convidado, 2);

  const fim = logado.proximo('vitoria');
  logado.emit('jogada', { salaId: 'sala-rank', pos: 6 });
  await fim;

  const registro = partidasSalvas.find(p => p.salaId === 'sala-rank');
  assert.ok(registro);
  assert.strictEqual(registro.vencedor, 'Lucas');
  assert.strictEqual(registro.vencedorId, 'id-lucas', 'vitória de conta entra no ranking');
  assert.deepStrictEqual(registro.jogadoresIds, ['id-lucas'], 'só a conta tem id');
});

// ---------------------------------------------------------------------------
// Roteamento das páginas
//
// Regressão: o express.static servia public/index.html na raiz, então "/"
// entregava a tela de JOGO em vez da home — sem seleção de modo e sem sala.
// ---------------------------------------------------------------------------

test('"/" serve a home, com a seleção de modo — não a tela de jogo', async () => {
  const html = await (await fetch(`${await baseUrl()}/`)).text();

  assert.match(html, /Criar Nova Sala/, 'a home precisa ter o botão de criar sala');
  assert.match(html, /name="modo" value="classico"/, 'a home precisa ter a escolha de modo');
  assert.match(html, /name="modo" value="infinito"/);
  assert.ok(!html.includes('class="tabuleiro"'), '"/" não pode entregar o tabuleiro');
});

test('"/sala/:id" serve a tela de jogo', async () => {
  const html = await (await fetch(`${await baseUrl()}/sala/abc123`)).text();

  assert.match(html, /class="tabuleiro"/);
  assert.match(html, /id="entrada-overlay"/, 'a tela de entrada precisa vir junto');
});

test('entrarSala sem sala é recusado, em vez de criar uma sala fantasma', async (t) => {
  const a = await conectar();
  t.after(() => { a.close(); contas.clear(); });

  const antes = Object.keys(salas).length;

  a.emit('entrarSala', { nome: 'Ana' });
  assert.match(await a.proximo('entradaRecusada'), /Sala não informada/);

  a.emit('entrarSala', { salaId: '   ', nome: 'Ana' });
  assert.match(await a.proximo('entradaRecusada'), /Sala não informada/);

  assert.strictEqual(Object.keys(salas).length, antes, 'nenhuma sala pode ter sido criada');
});

test('dois jogadores na MESMA sala recebem símbolos diferentes', async (t) => {
  const a = await conectar();
  const b = await conectar();
  t.after(() => { a.close(); b.close(); contas.clear(); });

  const simboloA = (await entrar(a, 'mesma-sala', 'Ana')).simbolo;
  const simboloB = (await entrar(b, 'mesma-sala', 'Bruno')).simbolo;

  assert.notStrictEqual(simboloA, simboloB, 'os dois não podem ser X');
  assert.deepStrictEqual([simboloA, simboloB].sort(), ['O', 'X']);

  const estado = await b.proximo('estadoSala', e => e.jogadores.length === 2);
  assert.strictEqual(estado.jogadores.length, 2, 'precisam estar na mesma sala');
});
