const socket = io();
const celulas = document.querySelectorAll('.celula');
const btnComecaX = document.getElementById('comecaX');
const btnComecaO = document.getElementById('comecaO');
let simboloEscolhido = false;

// Pega ID da sala da URL ou solicita ao jogador
let salaId = window.location.pathname.split('/').pop();
if (!salaId || salaId === '' || salaId === 'index.html') {
  salaId = prompt("Digite o nome da sala:");
}

const nome = prompt("Digite seu nome:");
socket.emit('entrarSala', { salaId, nome });

// Botões para definir quem começa
btnComecaX.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', { salaId, simbolo: 'X' });
    simboloEscolhido = true;
    desabilitarBotoesInicio();
  }
});

btnComecaO.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', { salaId, simbolo: 'O' });
    simboloEscolhido = true;
    desabilitarBotoesInicio();
  }
});

function desabilitarBotoesInicio() {
  btnComecaX.disabled = true;
  btnComecaO.disabled = true;
  document.getElementById('controle-inicio').style.opacity = '0.5';
}

let meuSimbolo = null;
let minhaVez = false;

const mensagens = document.getElementById('mensagens');
const input = document.getElementById('mensagemInput');
const btnEnviar = document.getElementById('enviarMensagem');

// Enviar mensagem
btnEnviar.addEventListener('click', () => {
  const texto = input.value.trim();
  if (texto !== '') {
    socket.emit('mensagemChat', { salaId, nome, texto });
    input.value = '';
  }
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnEnviar.click();
  }
});

// Recebe mensagens do chat
socket.on('mensagemChat', ({ nome, texto }) => {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${nome}:</strong> ${texto}`;
  mensagens.appendChild(p);
  mensagens.scrollTop = mensagens.scrollHeight;
});

// Clique em célula envia intenção de jogada
celulas.forEach(celula => {
  celula.addEventListener('click', () => {
    socket.emit('jogada', { salaId, pos: celula.dataset.pos });
  });
});

// Atualiza célula quando servidor envia jogada válida
socket.on('jogada', data => {
  const celula = document.querySelector(`.celula[data-pos='${data.pos}']`);
  celula.textContent = data.simbolo;
  if (data.nome !== nome) alert(`${data.nome} jogou na posição ${data.pos}`);
});

// Recebe o símbolo e define quem começa
socket.on('atribuirSimbolo', ({ simbolo, comeca }) => {
  meuSimbolo = simbolo;
  minhaVez = comeca;
  alert(`Você é ${simbolo}. ${comeca ? 'Você começa!' : 'Aguarde sua vez.'}`);
});

// Reiniciar tabuleiro
function resetarTabuleiro() {
  celulas.forEach(c => c.textContent = '');
  minhaVez = (meuSimbolo === 'X');
  simboloEscolhido = false;
  btnComecaX.disabled = false;
  btnComecaO.disabled = false;
  document.getElementById('controle-inicio').style.opacity = '1';
}

socket.on('resetar', () => {
  resetarTabuleiro();
});

// Botão reiniciar
document.getElementById('reiniciar').addEventListener('click', () => {
  socket.emit('reiniciar', { salaId });
});
