const socket = io();
const celulas = document.querySelectorAll('.celula');
const btnComecaX = document.getElementById('comecaX');
const btnComecaO = document.getElementById('comecaO');
let simboloEscolhido = false;

btnComecaX.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', 'X');
    simboloEscolhido = true;
    desabilitarBotoesInicio();
  }
});

btnComecaO.addEventListener('click', () => {
  if (!simboloEscolhido) {
    socket.emit('escolherInicio', 'O');
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

const nome = prompt("Digite seu nome:");
socket.emit('definirNome', nome);

const mensagens = document.getElementById('mensagens');
const input = document.getElementById('mensagemInput');
const btnEnviar = document.getElementById('enviarMensagem');

// Envia mensagem ao servidor
btnEnviar.addEventListener('click', () => {
  const texto = input.value.trim();
  if (texto !== '') {
    socket.emit('mensagemChat', { nome, texto });
    input.value = '';
  }
});

input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault(); // Impede quebra de linha
    btnEnviar.click();  // Aciona o botão de envio
  }
});


// Mostra mensagem recebida
socket.on('mensagemChat', ({ nome, texto }) => {
  const p = document.createElement('p');
  p.innerHTML = `<strong>${nome}:</strong> ${texto}`;
  mensagens.appendChild(p);
  mensagens.scrollTop = mensagens.scrollHeight; // auto scroll
});


function checarVitoria() {
  const combinacoes = [
    [0,1,2], [3,4,5], [6,7,8],
    [0,3,6], [1,4,7], [2,5,8],
    [0,4,8], [2,4,6]
  ];
  return combinacoes.some(comb => {
    const [a, b, c] = comb;
    const valores = [celulas[a].textContent, celulas[b].textContent, celulas[c].textContent];
    return valores[0] && valores.every(v => v === valores[0]);
  });
}

function resetarTabuleiro() {
  celulas.forEach(c => c.textContent = '');
  minhaVez = (meuSimbolo === 'X');
  simboloEscolhido = false;
  btnComecaX.disabled = false;
  btnComecaO.disabled = false;
  document.getElementById('controle-inicio').style.opacity = '1';
}

celulas.forEach(celula => {
  celula.addEventListener('click', () => {
    if (!minhaVez || celula.textContent !== '') return;

    celula.textContent = meuSimbolo;
    socket.emit('jogada', { pos: celula.dataset.pos, simbolo: meuSimbolo, nome });

    if (checarVitoria()) {
      alert(`Você venceu!`);
      socket.emit('vitoria', meuSimbolo);
      minhaVez = false;
    } else {
      minhaVez = false;
    }
  });
});

socket.on('atribuirSimbolo', ({ simbolo, comeca }) => {
  meuSimbolo = simbolo;
  minhaVez = comeca;
  alert(`Você é ${simbolo}. ${comeca ? 'Você começa!' : 'Aguarde sua vez.'}`);
});


console.log('Simbolo atribuído:', meuSimbolo, 'Minha vez?', minhaVez);

socket.on('jogada', data => {
  const celula = document.querySelector(`.celula[data-pos='${data.pos}']`);
  if (celula.textContent === '') {
    celula.textContent = data.simbolo;
    alert(`${data.nome} jogou na posição ${data.pos}`);
    if (checarVitoria()) {
      alert(`${data.nome} venceu!`);
      minhaVez = false;
    } else {
      minhaVez = true;
    }
  }
});



socket.on('resetar', () => {
  resetarTabuleiro();
});

// 🔄 Clique no botão reiniciar
document.getElementById('reiniciar').addEventListener('click', () => {
  socket.emit('reiniciar', { salaId });
});
