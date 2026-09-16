const socket = io();

const celulas = document.querySelectorAll('.celula');
const btnComecaX = document.getElementById('comecaX');
const btnComecaO = document.getElementById('comecaO');
const meuSimboloEl = document.getElementById('meu-simbolo');
const conexaoStatusEl = document.getElementById('conexao-status');
const turnoAtualEl = document.getElementById('turno-atual');
const salaIdEl = document.getElementById('sala-id');
const copiarLinkBtn = document.getElementById('copiar-link');
const listaJogadoresEl = document.getElementById('lista-jogadores');
const historicoListaEl = document.getElementById('historico-lista');
const modoBadgeEl = document.getElementById('modo-badge');
const modoDicaEl = document.getElementById('modo-dica');
const rankingLista = document.getElementById('ranking');
const mensagens = document.getElementById('mensagens');
const input = document.getElementById('mensagemInput');
const btnEnviar = document.getElementById('enviarMensagem');

const SIMBOLOS = { X: '❌', O: '⭕' };

let meuSimbolo = null;
let minhaVez = false;
let estadoAtual = null;
let reconectando = false;
let entrou = false;

// Identidade em uso: nome + se veio de uma conta (true) ou de convidado (false)
let nome = null;
let souConta = false;

// Modo pedido na URL — só tem efeito se a sala ainda não existir no servidor.
const modoSolicitado = new URLSearchParams(window.location.search).get('modo');

// A tela de jogo só faz sentido dentro de /sala/:id. Fora disso não há sala
// para entrar — mandar para a home é melhor do que ficar numa sala fantasma.
const partesDoCaminho = window.location.pathname.split('/').filter(Boolean);
const salaId = partesDoCaminho[0] === 'sala' ? partesDoCaminho[1] : null;

if (!salaId) {
  window.location.replace('/');
}

function atualizarSalaInfo() {
  salaIdEl.textContent = `Sala: ${salaId}`;
}

// ---------------------------------------------------------------------------
// UI auxiliar
// ---------------------------------------------------------------------------

function mostrarToast(mensagem, tipo = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = mensagem;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function atualizarConexaoStatus(online) {
  conexaoStatusEl.textContent = online ? '🟢 Online' : '🔴 Desconectado';
  conexaoStatusEl.className = online ? 'online' : 'offline';
}

// Sons do jogo (Web Audio API)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function tocarSom(frequencia, duracao, tipo = 'sine') {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.setValueAtTime(frequencia, audioContext.currentTime);
  oscillator.type = tipo;

  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
  gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duracao);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duracao);
}

const somJogada = () => tocarSom(800, 0.1);
const somSumico = () => tocarSom(300, 0.18, 'triangle');
const somDerrota = () => tocarSom(200, 0.5, 'sawtooth');

function somVitoria() {
  tocarSom(523, 0.2);
  setTimeout(() => tocarSom(659, 0.2), 100);
  setTimeout(() => tocarSom(784, 0.4), 200);
}

// ---------------------------------------------------------------------------
// Renderização a partir do estado enviado pelo servidor
// ---------------------------------------------------------------------------

function renderizarTabuleiro(estado) {
  const expirando = estado.expirando || { X: null, O: null };
  const linha = estado.linha || [];

  celulas.forEach(celula => {
    const pos = Number(celula.dataset.pos);
    const valor = estado.tabuleiro[pos];

    celula.textContent = SIMBOLOS[valor] || '';
    celula.classList.toggle('vencedora', linha.includes(pos));

    // Marca que vai sumir na próxima jogada do dono (só no modo infinito)
    const vaiSumir = pos === expirando.X || pos === expirando.O;
    celula.classList.toggle('expirando', vaiSumir);
    celula.title = vaiSumir ? 'Esta marca some na próxima jogada deste jogador' : '';
  });

  if (estado.removida !== null && estado.removida !== undefined) {
    const celulaRemovida = document.querySelector(`.celula[data-pos='${estado.removida}']`);
    if (celulaRemovida) {
      celulaRemovida.classList.add('sumindo');
      setTimeout(() => celulaRemovida.classList.remove('sumindo'), 500);
    }
  }

  if (estado.ultimaJogada) {
    const celulaJogada = document.querySelector(`.celula[data-pos='${estado.ultimaJogada.pos}']`);
    if (celulaJogada) {
      celulaJogada.classList.add('animate');
      setTimeout(() => celulaJogada.classList.remove('animate'), 300);
    }
  }
}

function renderizarTurno(estado) {
  minhaVez = !estado.finalizada && estado.turno === meuSimbolo;

  if (estado.finalizada) {
    turnoAtualEl.textContent = '⏸️ Partida encerrada';
    turnoAtualEl.className = '';
  } else if (minhaVez) {
    turnoAtualEl.textContent = `🎯 Sua vez (${meuSimbolo})`;
    turnoAtualEl.className = 'minha-vez';
  } else {
    turnoAtualEl.textContent = `⏳ Turno do ${estado.turno}`;
    turnoAtualEl.className = '';
  }

  // Escolher quem começa só faz sentido antes da primeira jogada.
  const podeEscolher = estado.totalJogadas === 0 && !estado.finalizada;
  [btnComecaX, btnComecaO].forEach(btn => {
    btn.disabled = !podeEscolher;
    btn.style.opacity = podeEscolher ? '1' : '0.5';
  });
}

function renderizarJogadores(jogadores) {
  listaJogadoresEl.replaceChildren();

  jogadores.forEach(jogador => {
    const div = document.createElement('div');
    div.className = `jogador-item jogador-${jogador.simbolo.toLowerCase()}`;

    // textContent (e não innerHTML) — o nome é digitado pelo jogador.
    const identificacao = document.createElement('span');
    identificacao.textContent = `${jogador.nome} (${jogador.simbolo}) `;

    // Distingue conta verificada de convidado: sem isso, um convidado poderia
    // se passar por quem está no ranking.
    const selo = document.createElement('span');
    selo.className = jogador.conta ? 'selo selo-conta' : 'selo selo-convidado';
    selo.textContent = jogador.conta ? '✓ conta' : 'convidado';
    selo.title = jogador.conta
      ? 'Conta registrada — as vitórias contam no ranking'
      : 'Convidado — as vitórias não contam no ranking';
    identificacao.appendChild(selo);

    const status = document.createElement('span');
    status.className = 'jogador-status';
    status.textContent = jogador.online ? '🟢 Online' : '🔴 Offline';

    div.append(identificacao, status);
    listaJogadoresEl.appendChild(div);
  });
}

function renderizarModo(estado) {
  if (!modoBadgeEl) return;

  modoBadgeEl.textContent = estado.modo === 'infinito' ? '♾️ Infinito' : '🎯 Clássico';
  modoBadgeEl.className = `modo-badge modo-${estado.modo}`;

  if (modoDicaEl) modoDicaEl.textContent = estado.modoDescricao || '';
  document.body.dataset.modo = estado.modo;
}

socket.on('estadoSala', (estado) => {
  const primeiroRender = estadoAtual === null;
  const modoMudou = !estadoAtual || estadoAtual.modo !== estado.modo;

  estadoAtual = estado;

  renderizarTabuleiro(estado);
  renderizarTurno(estado);
  renderizarJogadores(estado.jogadores);
  if (modoMudou) renderizarModo(estado);

  // Efeitos sonoros só para eventos novos, não para o snapshot de reconexão.
  if (!primeiroRender && estado.ultimaJogada) {
    somJogada();
    if (estado.removida !== null && estado.removida !== undefined) {
      setTimeout(somSumico, 120);
    }
  }

  if (estado.reiniciada) mostrarToast('Jogo reiniciado!', 'info');
});

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

function entrarNaSala() {
  if (!nome) return; // ainda na tela de entrada
  socket.emit('entrarSala', { salaId, nome, modo: modoSolicitado });
}

// Reconexão deliberada para trocar de sessão — não é queda de conexão.
let trocandoSessao = false;

socket.on('connect', () => {
  atualizarConexaoStatus(true);
  if (reconectando) mostrarToast('Reconectado!', 'success');
  reconectando = false;
  trocandoSessao = false;
  entrarNaSala();
});

socket.on('disconnect', () => {
  atualizarConexaoStatus(false);
  if (trocandoSessao) return;

  reconectando = true;
  mostrarToast('Conexão perdida. Tentando reconectar...', 'error');
});

socket.on('atribuirSimbolo', ({ simbolo, nome: nomeConfirmado, conta }) => {
  meuSimbolo = simbolo;
  entrou = true;

  // O servidor é quem decide o nome final (conta logada ignora o que foi digitado).
  if (nomeConfirmado) nome = nomeConfirmado;
  souConta = Boolean(conta);

  meuSimboloEl.textContent = `Você é: ${SIMBOLOS[simbolo]} ${simbolo}`;
  fecharEntrada();
  if (estadoAtual) renderizarTurno(estadoAtual);
});

socket.on('entradaRecusada', (motivo) => {
  nome = null;
  entrou = false;
  abrirEntrada(motivo);
});

socket.on('mensagem', (texto) => mostrarToast(texto, 'error'));

atualizarSalaInfo();

// ---------------------------------------------------------------------------
// Tela de entrada (conta ou convidado)
// ---------------------------------------------------------------------------

const overlayEl = document.getElementById('entrada-overlay');
const blocoLogado = document.getElementById('entrada-logado');
const blocoConvidado = document.getElementById('entrada-convidado');
const entradaNomeConta = document.getElementById('entrada-nome-conta');
const entradaNome = document.getElementById('entrada-nome');
const entradaErro = document.getElementById('entrada-erro');

document.getElementById('entrada-sala').textContent = `Sala: ${salaId}`;

function abrirEntrada(erro) {
  overlayEl.hidden = false;
  document.body.classList.add('com-overlay');

  if (erro) {
    entradaErro.textContent = erro;
    entradaErro.hidden = false;
  } else {
    entradaErro.hidden = true;
  }
}

function fecharEntrada() {
  overlayEl.hidden = true;
  document.body.classList.remove('com-overlay');
}

/** Mostra o bloco de conta logada ou o de convidado. */
function aplicarSessao(usuario) {
  blocoLogado.hidden = !usuario;
  blocoConvidado.hidden = Boolean(usuario);

  if (usuario) {
    entradaNomeConta.textContent = usuario.nomeExibicao;
  } else {
    // Conveniência: lembra o último nome de convidado usado neste navegador
    entradaNome.value = localStorage.getItem('ultimoNomeConvidado') || '';
  }
}

/**
 * A identidade do socket é resolvida no handshake, a partir do cookie. Como o
 * login/logout pode ter acabado de acontecer nesta mesma tela, reconectamos
 * antes de entrar para que o servidor releia o cookie atual.
 */
function jogarComo(nomeEscolhido) {
  nome = nomeEscolhido;
  trocandoSessao = true;
  socket.disconnect();
  socket.connect();
}

document.getElementById('entrada-jogar-conta').addEventListener('click', () => {
  jogarComo(entradaNomeConta.textContent);
});

document.getElementById('entrada-jogar-convidado').addEventListener('click', () => {
  const escolhido = entradaNome.value.trim();

  if (!escolhido) {
    entradaErro.textContent = 'Digite um nome para jogar.';
    entradaErro.hidden = false;
    return;
  }

  localStorage.setItem('ultimoNomeConvidado', escolhido);
  jogarComo(escolhido);
});

entradaNome.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('entrada-jogar-convidado').click();
});

document.getElementById('entrada-sair').addEventListener('click', async () => {
  await Auth.logout();
  aplicarSessao(null);
});

// Login/cadastro dentro da própria tela de entrada: autenticar já entra na sala.
Auth.montarFormulario(document.getElementById('entrada-auth'), (usuario) => {
  aplicarSessao(usuario);
  jogarComo(usuario.nomeExibicao);
});

Auth.sessao().then(usuario => {
  aplicarSessao(usuario);
  abrirEntrada();
});

// ---------------------------------------------------------------------------
// Ações do jogador
// ---------------------------------------------------------------------------

celulas.forEach(celula => {
  celula.addEventListener('click', () => {
    if (!entrou) return;

    if (!minhaVez) {
      mostrarToast('Não é sua vez!', 'error');
      return;
    }

    if (celula.textContent !== '') {
      mostrarToast('Posição já ocupada!', 'error');
      return;
    }

    socket.emit('jogada', { salaId, pos: celula.dataset.pos });
  });
});

btnComecaX.addEventListener('click', () => socket.emit('escolherInicio', { salaId, simbolo: 'X' }));
btnComecaO.addEventListener('click', () => socket.emit('escolherInicio', { salaId, simbolo: 'O' }));

document.getElementById('reiniciar').addEventListener('click', () => {
  socket.emit('reiniciar', { salaId });
});

copiarLinkBtn.addEventListener('click', async () => {
  const link = `${window.location.origin}/sala/${salaId}`;

  try {
    await navigator.clipboard.writeText(link);
    mostrarToast(`Link copiado: ${link}`, 'success');
  } catch (err) {
    // Fallback para navegadores sem Clipboard API (ou contexto não seguro)
    const textarea = document.createElement('textarea');
    textarea.value = link;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    mostrarToast(`Link copiado: ${link}`, 'success');
  }
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

function enviarMensagem() {
  const texto = input.value.trim();
  if (texto === '') return;

  socket.emit('mensagemChat', { salaId, texto });
  input.value = '';
}

btnEnviar.addEventListener('click', enviarMensagem);

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    enviarMensagem();
  }
});

socket.on('mensagemChat', ({ nome: remetente, texto, conta }) => {
  const p = document.createElement('p');
  const rotulo = document.createElement('strong');

  if (remetente === 'Sistema') {
    const em = document.createElement('em');
    em.style.color = '#ffd700';
    em.textContent = `🤖 ${texto}`;
    p.appendChild(em);
  } else {
    const souEu = remetente === nome;
    rotulo.style.color = souEu ? '#4ecdc4' : '#ff6b6b';
    rotulo.textContent = souEu ? 'Você:' : `${remetente}${conta ? ' ✓' : ''}:`;
    rotulo.title = conta ? 'Conta registrada' : 'Convidado';
    p.append(rotulo, ` ${texto}`);
  }

  mensagens.appendChild(p);
  mensagens.scrollTop = mensagens.scrollHeight;
});

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

function atualizarRanking(ranking) {
  rankingLista.replaceChildren();

  if (ranking.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'text-align: center; opacity: 0.7;';
    li.textContent = 'Nenhuma partida ainda';
    rankingLista.appendChild(li);
    return;
  }

  const medalhas = ['🥇', '🥈', '🥉'];

  ranking.forEach((item, index) => {
    const li = document.createElement('li');

    const jogador = document.createElement('span');
    jogador.textContent = `${medalhas[index] || `${index + 1}º`} ${item._id}`;

    const vitorias = document.createElement('span');
    vitorias.textContent = `${item.vitorias} vitória${item.vitorias !== 1 ? 's' : ''}`;

    li.append(jogador, vitorias);
    rankingLista.appendChild(li);
  });
}

socket.on('rankingAtualizado', atualizarRanking);

fetch('/ranking', { headers: { Accept: 'application/json' } })
  .then(res => res.json())
  .then(atualizarRanking)
  .catch(err => console.error('Erro ao carregar ranking inicial:', err));

// ---------------------------------------------------------------------------
// Histórico local (localStorage)
// ---------------------------------------------------------------------------

let historicoPartidas = JSON.parse(localStorage.getItem('historicoPartidas') || '[]');

function adicionarAoHistorico(resultado, oponente, modo) {
  historicoPartidas.unshift({
    data: new Date().toLocaleString('pt-BR'),
    resultado,
    oponente,
    modo,
    meuSimbolo,
    timestamp: Date.now()
  });

  historicoPartidas = historicoPartidas.slice(0, 20);
  localStorage.setItem('historicoPartidas', JSON.stringify(historicoPartidas));
  atualizarHistorico();
}

function atualizarHistorico() {
  historicoListaEl.replaceChildren();

  if (historicoPartidas.length === 0) {
    const vazio = document.createElement('div');
    vazio.style.cssText = 'text-align: center; opacity: 0.7; padding: 20px;';
    vazio.textContent = 'Nenhuma partida no histórico';
    historicoListaEl.appendChild(vazio);
    return;
  }

  const rotulos = {
    vitoria: ['🏆', 'Vitória'],
    derrota: ['😔', 'Derrota'],
    empate: ['🤝', 'Empate']
  };

  historicoPartidas.forEach(partida => {
    const div = document.createElement('div');
    div.className = `historico-item ${partida.resultado}`;

    const [emoji, rotulo] = rotulos[partida.resultado] || ['🎮', partida.resultado];

    const linhaResultado = document.createElement('div');
    linhaResultado.textContent = `${emoji} ${rotulo} vs ${partida.oponente}`;

    const linhaDetalhes = document.createElement('div');
    linhaDetalhes.style.cssText = 'font-size: 0.8em; opacity: 0.7;';
    const nomeModo = partida.modo === 'infinito' ? 'Infinito' : 'Clássico';
    linhaDetalhes.textContent = `${partida.data} • ${partida.meuSimbolo} • ${nomeModo}`;

    div.append(linhaResultado, linhaDetalhes);
    historicoListaEl.appendChild(div);
  });
}

atualizarHistorico();

// ---------------------------------------------------------------------------
// Fim de partida
// ---------------------------------------------------------------------------

socket.on('vitoria', ({ vencedor, euVenci, oponente }) => {
  const modo = estadoAtual ? estadoAtual.modo : 'classico';

  if (euVenci) {
    mostrarToast('🏆 Você venceu!', 'success');
    somVitoria();
    adicionarAoHistorico('vitoria', oponente, modo);

    // Momento certo para explicar por que a vitória não apareceu no ranking
    if (!souConta) {
      setTimeout(() => mostrarToast('Jogando como convidado — crie uma conta para contar no ranking.', 'info'), 3200);
    }
  } else {
    mostrarToast('😔 Você perdeu!', 'error');
    somDerrota();
    adicionarAoHistorico('derrota', vencedor, modo);
  }
});

socket.on('empate', ({ oponente }) => {
  mostrarToast('🤝 Empate!', 'info');
  adicionarAoHistorico('empate', oponente, estadoAtual ? estadoAtual.modo : 'classico');
});
