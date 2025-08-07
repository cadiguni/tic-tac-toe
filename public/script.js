const socket = io();
const celulas = document.querySelectorAll('.celula');
let meuSimbolo = null;
let minhaVez = false;

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
}

celulas.forEach(celula => {
  celula.addEventListener('click', () => {
    if (!minhaVez || celula.textContent !== '') return;

    celula.textContent = meuSimbolo;
    socket.emit('jogada', { pos: celula.dataset.pos, simbolo: meuSimbolo });

    if (checarVitoria()) {
      alert(`Você venceu!`);
      socket.emit('vitoria', meuSimbolo);
      minhaVez = false;
    } else {
      minhaVez = false;
    }
  });
});

socket.on('atribuirSimbolo', simbolo => {
  meuSimbolo = simbolo;
  minhaVez = simbolo === 'X';
  alert(`Você é ${simbolo}`);
});

socket.on('jogada', data => {
  const celula = document.querySelector(`.celula[data-pos='${data.pos}']`);
  if (celula.textContent === '') {
    celula.textContent = data.simbolo;
    if (checarVitoria()) {
      alert(`${data.simbolo} venceu!`);
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
  socket.emit('reiniciar');
});
