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

let simboloEscolhido = false;
let meuSimbolo = null;
let minhaVez = false;
let turnoAtual = 'X';
let reconectando = false;

// Pega ID da sala da URL ou solicita ao jogador
let salaId = window.location.pathname.split('/').pop();
if (!salaId || salaId === '' || salaId === 'index.html') {
  salaId = prompt("Digite o nome da sala (deixe vazio para criar nova):");
  if (!salaId) salaId = ''; // Será criada automaticamente
}

// Atualiza interface com ID da sala
function atualizarSalaInfo() {
  salaIdEl.textContent = `Sala: ${salaId}`;
  const currentUrl = window.location.origin + '/sala/' + salaId;
  window.history.replaceState({}, '', '/sala/' + salaId);
}

// Copiar link da sala
copiarLinkBtn.addEventListener('click', async () => {
  const link = window.location.origin + '/sala/' + salaId;
  try {
    await navigator.clipboard.writeText(link);
    mostrarToast('Link copiado!', 'success');
  } catch (err) {
    // Fallback para navegadores antigos
    const textarea = document.createElement('textarea');
    textarea.value = link;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    mostrarToast('Link copiado!', 'success');
  }
});

// Sistema de notificações toast
function mostrarToast(mensagem, tipo = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.textContent = mensagem;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 3000);
}

// Atualizar status de conexão
function atualizarConexaoStatus(online) {
  if (online) {
    conexaoStatusEl.textContent = '🟢 Online';
    conexaoStatusEl.className = 'online';
  } else {
    conexaoStatusEl.textContent = '🔴 Desconectado';
    conexaoStatusEl.className = 'offline';
  }
}

// Reconexão automática
socket.on('connect', () => {
  atualizarConexaoStatus(true);
  if (reconectando) {
    mostrarToast('Reconectado!', 'success');
    // Reentrar na sala após reconexão
    if (salaId && nome) {
      socket.emit('entrarSala', { salaId, nome });
    }
  }
  reconectando = false;
});

socket.on('disconnect', () => {
  atualizarConexaoStatus(false);
  reconectando = true;
  mostrarToast('Conexão perdida. Tentando reconectar...', 'error');
});

const nome = prompt("Digite seu nome:");
if (!nome || nome.trim() === '') {
  alert('Nome é obrigatório!');
  location.reload();
}

// Atualizar status do turno
function atualizarTurnoStatus(turno, ehMinhaVez) {
  turnoAtual = turno;
  minhaVez = ehMinhaVez;
  
  if (ehMinhaVez) {
    turnoAtualEl.textContent = `🎯 Sua vez (${meuSimbolo})`;
    turnoAtualEl.className = 'minha-vez';
  } else {
    turnoAtualEl.textContent = `⏳ Turno do ${turno}`;
    turnoAtualEl.className = '';
  }
}

// Atualizar lista de jogadores
function atualizarListaJogadores(jogadores) {
  listaJogadoresEl.innerHTML = '';
  jogadores.forEach(jogador => {
    const div = document.createElement('div');
    div.className = `jogador-item jogador-${jogador.simbolo.toLowerCase()}`;
    div.innerHTML = `
      <span>${jogador.nome} (${jogador.simbolo})</span>
      <span class="jogador-status">${jogador.online ? '🟢 Online' : '🔴 Offline'}</span>
    `;
    listaJogadoresEl.appendChild(div);
  });
}

// Sons do jogo (usando Web Audio API)
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

function somJogada() {
  tocarSom(800, 0.1);
}

function somVitoria() {
  tocarSom(523, 0.2); // C
  setTimeout(() => tocarSom(659, 0.2), 100); // E
  setTimeout(() => tocarSom(784, 0.4), 200); // G
}

function somDerrota() {
  tocarSom(200, 0.5, 'sawtooth');
}

atualizarSalaInfo();
socket.emit('entrarSala', { salaId, nome });

// Botões para definir quem começa
btnComecaX.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', { salaId, simbolo: 'X' });
    simboloEscolhido = true;
    desabilitarBotoesInicio();
    mostrarToast('X foi escolhido para começar!', 'info');
  }
});

btnComecaO.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', { salaId, simbolo: 'O' });
    simboloEscolhido = true;
    desabilitarBotoesInicio();
    mostrarToast('O foi escolhido para começar!', 'info');
  }
});

function desabilitarBotoesInicio() {
  btnComecaX.disabled = true;
  btnComecaO.disabled = true;
  btnComecaX.style.opacity = '0.5';
  btnComecaO.style.opacity = '0.5';
}

const mensagens = document.getElementById('mensagens');
const input = document.getElementById('mensagemInput');
const btnEnviar = document.getElementById('enviarMensagem');

// Enviar mensagem
btnEnviar.addEventListener('click', enviarMensagem);

function enviarMensagem() {
  const texto = input.value.trim();
  if (texto !== '') {
    socket.emit('mensagemChat', { salaId, nome, texto });
    input.value = '';
  }
}

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    enviarMensagem();
  }
});

// Recebe mensagens do chat
socket.on('mensagemChat', ({ nome: remetente, texto }) => {
  const p = document.createElement('p');
  const isSystem = remetente === 'Sistema';
  const isMe = remetente === nome;
  
  if (isSystem) {
    p.innerHTML = `<em style="color: #ffd700;">🤖 ${texto}</em>`;
  } else if (isMe) {
    p.innerHTML = `<strong style="color: #4ecdc4;">Você:</strong> ${texto}`;
  } else {
    p.innerHTML = `<strong style="color: #ff6b6b;">${remetente}:</strong> ${texto}`;
  }
  
  mensagens.appendChild(p);
  mensagens.scrollTop = mensagens.scrollHeight;
});

const rankingLista = document.getElementById('ranking');

// Atualiza ranking ao vivo quando servidor mandar
socket.on('rankingAtualizado', (ranking) => {
  atualizarRanking(ranking);
});

// Função para atualizar ranking na tela
function atualizarRanking(ranking) {
  rankingLista.innerHTML = '';
  if (ranking.length === 0) {
    rankingLista.innerHTML = '<li style="text-align: center; opacity: 0.7;">Nenhuma partida ainda</li>';
    return;
  }
  
  ranking.forEach((item, index) => {
    const li = document.createElement('li');
    const posicao = index + 1;
    let emoji = '';
    
    if (posicao === 1) emoji = '🥇';
    else if (posicao === 2) emoji = '🥈';
    else if (posicao === 3) emoji = '🥉';
    else emoji = `${posicao}º`;
    
    li.innerHTML = `
      <span>${emoji} ${item._id}</span>
      <span>${item.vitorias} vitória${item.vitorias !== 1 ? 's' : ''}</span>
    `;
    rankingLista.appendChild(li);
  });
}

// Histórico de partidas
let historicoPartidas = JSON.parse(localStorage.getItem('historicoPartidas') || '[]');

function adicionarAoHistorico(resultado, oponente, meuSimboloPartida) {
  const partida = {
    data: new Date().toLocaleString('pt-BR'),
    resultado,
    oponente,
    meuSimbolo: meuSimboloPartida,
    timestamp: Date.now()
  };
  
  historicoPartidas.unshift(partida);
  historicoPartidas = historicoPartidas.slice(0, 20); // Manter apenas últimas 20 partidas
  localStorage.setItem('historicoPartidas', JSON.stringify(historicoPartidas));
  atualizarHistorico();
}

function atualizarHistorico() {
  historicoListaEl.innerHTML = '';
  
  if (historicoPartidas.length === 0) {
    historicoListaEl.innerHTML = '<div style="text-align: center; opacity: 0.7; padding: 20px;">Nenhuma partida no histórico</div>';
    return;
  }
  
  historicoPartidas.forEach(partida => {
    const div = document.createElement('div');
    div.className = `historico-item ${partida.resultado}`;
    
    let emoji = '';
    let texto = '';
    if (partida.resultado === 'vitoria') {
      emoji = '🏆';
      texto = `Vitória vs ${partida.oponente}`;
    } else if (partida.resultado === 'derrota') {
      emoji = '😔';
      texto = `Derrota vs ${partida.oponente}`;
    } else {
      emoji = '🤝';
      texto = `Empate vs ${partida.oponente}`;
    }
    
    div.innerHTML = `
      <div>${emoji} ${texto}</div>
      <div style="font-size: 0.8em; opacity: 0.7;">${partida.data} • ${partida.meuSimbolo}</div>
    `;
    
    historicoListaEl.appendChild(div);
  });
}

// Inicializar histórico
atualizarHistorico();

// Carrega ranking inicial ao entrar
fetch('/ranking')
  .then(res => res.json())
  .then(data => atualizarRanking(data))
  .catch(err => console.error('Erro ao carregar ranking inicial:', err));


// Clique em célula envia intenção de jogada
celulas.forEach(celula => {
  celula.addEventListener('click', () => {
    if (!minhaVez) {
      mostrarToast('Não é sua vez!', 'error');
      return;
    }
    
    if (celula.textContent !== '') {
      mostrarToast('Posição já ocupada!', 'error');
      return;
    }
    
    // Animação de clique
    celula.classList.add('animate');
    setTimeout(() => celula.classList.remove('animate'), 300);
    
    socket.emit('jogada', { salaId, pos: celula.dataset.pos });
  });
});

// Atualiza célula quando servidor envia jogada válida
socket.on('jogada', data => {
  const celula = document.querySelector(`.celula[data-pos='${data.pos}']`);
  
  // Animação de entrada
  celula.style.transform = 'scale(0)';
  celula.textContent = data.simbolo === 'X' ? '❌' : '⭕';
  
  // Animate in
  setTimeout(() => {
    celula.style.transform = 'scale(1)';
    celula.style.transition = 'transform 0.3s ease';
  }, 50);
  
  // Tocar som
  somJogada();
  
  // Atualizar turno
  const novoTurno = data.simbolo === 'X' ? 'O' : 'X';
  atualizarTurnoStatus(novoTurno, novoTurno === meuSimbolo);
});

// Recebe o símbolo e define quem começa
socket.on('atribuirSimbolo', ({ simbolo, comeca }) => {
  meuSimbolo = simbolo;
  minhaVez = comeca;
  
  meuSimboloEl.textContent = `Você é: ${simbolo === 'X' ? '❌' : '⭕'} ${simbolo}`;
  atualizarTurnoStatus(comeca ? simbolo : (simbolo === 'X' ? 'O' : 'X'), comeca);
  
  if (comeca) {
    mostrarToast(`Você é ${simbolo} e começa!`, 'success');
  } else {
    mostrarToast(`Você é ${simbolo}. Aguarde sua vez.`, 'info');
  }
});

// Evento de vitória
socket.on('vitoria', ({ vencedor, simbolo }) => {
  const euVenci = vencedor === nome;
  
  if (euVenci) {
    mostrarToast('🏆 Você venceu!', 'success');
    somVitoria();
    // Adicionar ao histórico
    const oponente = 'Jogador'; // Precisaremos pegar o nome do oponente do servidor
    adicionarAoHistorico('vitoria', oponente, meuSimbolo);
  } else {
    mostrarToast('😔 Você perdeu!', 'error');
    somDerrota();
    adicionarAoHistorico('derrota', vencedor, meuSimbolo);
  }
});

// Evento de empate
socket.on('empate', () => {
  mostrarToast('🤝 Empate!', 'info');
  const oponente = 'Jogador';
  adicionarAoHistorico('empate', oponente, meuSimbolo);
});

// Atualizar lista de jogadores
socket.on('atualizarJogadores', (jogadores) => {
  atualizarListaJogadores(jogadores);
});

// Reiniciar tabuleiro
function resetarTabuleiro() {
  celulas.forEach(c => {
    c.textContent = '';
    c.style.transform = '';
    c.style.transition = '';
  });
  
  minhaVez = (meuSimbolo === 'X');
  simboloEscolhido = false;
  atualizarTurnoStatus('X', meuSimbolo === 'X');

  btnComecaX.disabled = false;
  btnComecaO.disabled = false;
  btnComecaX.style.opacity = '1';
  btnComecaO.style.opacity = '1';
  
  mostrarToast('Jogo reiniciado!', 'info');
}

socket.on('resetar', () => {
  resetarTabuleiro();
});

// Botão reiniciar
document.getElementById('reiniciar').addEventListener('click', () => {
  socket.emit('reiniciar', { salaId });
});
