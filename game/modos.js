/**
 * Regras de jogo por modo.
 *
 * Este módulo é puro: não conhece Express, Socket.IO nem MongoDB. Recebe e
 * devolve estado, o que o torna fácil de testar isoladamente.
 */

const COMBINACOES_VITORIA = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

const MODOS = {
  classico: {
    id: 'classico',
    nome: 'Clássico',
    descricao: 'Regras tradicionais: as marcas ficam no tabuleiro e a partida pode terminar em velha.',
    maxMarcas: null,
    permiteEmpate: true
  },
  infinito: {
    id: 'infinito',
    nome: 'Infinito',
    descricao: 'Cada jogador mantém no máximo 3 marcas. Ao colocar a 4ª, a mais antiga dele some — nunca dá velha.',
    maxMarcas: 3,
    permiteEmpate: false
  }
};

const MODO_PADRAO = 'classico';

function normalizarModo(modo) {
  return Object.prototype.hasOwnProperty.call(MODOS, modo) ? modo : MODO_PADRAO;
}

function criarEstadoJogo(modo = MODO_PADRAO) {
  return {
    modo: normalizarModo(modo),
    tabuleiro: Array(9).fill(''),
    turno: 'X',
    finalizada: false,
    totalJogadas: 0,
    // Posições de cada símbolo na ordem em que foram jogadas (índice 0 = mais antiga)
    ordemMarcas: { X: [], O: [] }
  };
}

function regras(estado) {
  return MODOS[estado.modo];
}

function validarJogada(estado, simbolo, pos) {
  if (estado.finalizada) return { valida: false, erro: 'Jogo já finalizado!' };
  if (estado.turno !== simbolo) return { valida: false, erro: 'Não é sua vez!' };
  if (!Number.isInteger(pos) || pos < 0 || pos > 8) return { valida: false, erro: 'Posição inválida!' };
  if (estado.tabuleiro[pos] !== '') return { valida: false, erro: 'Posição já ocupada!' };
  return { valida: true };
}

/**
 * Aplica a jogada, alterna o turno e — nos modos com limite de marcas — apaga a
 * marca mais antiga do próprio jogador quando ele ultrapassa o limite.
 *
 * A remoção acontece ANTES da checagem de vitória: no modo Infinito você só
 * vence com as 3 marcas que continuam no tabuleiro depois da jogada.
 *
 * @returns {{ removida: number|null }} posição que saiu do tabuleiro
 */
function aplicarJogada(estado, simbolo, pos) {
  estado.tabuleiro[pos] = simbolo;
  estado.totalJogadas += 1;

  const ordem = estado.ordemMarcas[simbolo];
  ordem.push(pos);

  let removida = null;
  const { maxMarcas } = regras(estado);
  if (maxMarcas && ordem.length > maxMarcas) {
    removida = ordem.shift();
    estado.tabuleiro[removida] = '';
  }

  estado.turno = simbolo === 'X' ? 'O' : 'X';
  return { removida };
}

/**
 * Posição que vai sumir na próxima jogada de cada símbolo (null se nenhuma).
 * O cliente usa isso para destacar a marca prestes a desaparecer.
 */
function marcasExpirando(estado) {
  const { maxMarcas } = regras(estado);
  const expirando = { X: null, O: null };
  if (!maxMarcas) return expirando;

  for (const simbolo of ['X', 'O']) {
    const ordem = estado.ordemMarcas[simbolo];
    if (ordem.length >= maxMarcas) expirando[simbolo] = ordem[0];
  }
  return expirando;
}

/** Combinação vencedora presente no tabuleiro, ou null. */
function linhaVencedora(tabuleiro) {
  return COMBINACOES_VITORIA.find(([a, b, c]) => {
    const valor = tabuleiro[a];
    return valor !== '' && valor === tabuleiro[b] && valor === tabuleiro[c];
  }) || null;
}

/**
 * No modo Infinito o tabuleiro nunca passa de 6 marcas (3 + 3), então nunca
 * enche e `permiteEmpate: false` torna a checagem desnecessária.
 */
function verificarEmpate(estado) {
  return regras(estado).permiteEmpate && estado.tabuleiro.every(c => c !== '');
}

module.exports = {
  MODOS,
  MODO_PADRAO,
  COMBINACOES_VITORIA,
  normalizarModo,
  criarEstadoJogo,
  regras,
  validarJogada,
  aplicarJogada,
  marcasExpirando,
  linhaVencedora,
  verificarEmpate
};
