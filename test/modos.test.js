const test = require('node:test');
const assert = require('node:assert');

const {
  MODOS,
  normalizarModo,
  criarEstadoJogo,
  validarJogada,
  aplicarJogada,
  marcasExpirando,
  linhaVencedora,
  verificarEmpate
} = require('../game/modos');

/** Aplica uma sequência [pos, simbolo] sem passar pelas validações. */
function jogar(estado, lances) {
  return lances.map(([pos, simbolo]) => aplicarJogada(estado, simbolo, pos));
}

test('normalizarModo cai no clássico para entradas desconhecidas', () => {
  assert.strictEqual(normalizarModo('infinito'), 'infinito');
  assert.strictEqual(normalizarModo('classico'), 'classico');
  assert.strictEqual(normalizarModo('qualquer-coisa'), 'classico');
  assert.strictEqual(normalizarModo(undefined), 'classico');
  // Não pode herdar chaves de Object.prototype
  assert.strictEqual(normalizarModo('constructor'), 'classico');
  assert.strictEqual(normalizarModo('toString'), 'classico');
});

test('validarJogada rejeita jogada fora de turno, fora do tabuleiro e em casa ocupada', () => {
  const estado = criarEstadoJogo('classico');

  assert.strictEqual(validarJogada(estado, 'O', 0).erro, 'Não é sua vez!');
  assert.strictEqual(validarJogada(estado, 'X', 9).erro, 'Posição inválida!');
  assert.strictEqual(validarJogada(estado, 'X', -1).erro, 'Posição inválida!');
  assert.strictEqual(validarJogada(estado, 'X', NaN).erro, 'Posição inválida!');
  assert.ok(validarJogada(estado, 'X', 4).valida);

  aplicarJogada(estado, 'X', 4);
  assert.strictEqual(validarJogada(estado, 'O', 4).erro, 'Posição já ocupada!');

  estado.finalizada = true;
  assert.strictEqual(validarJogada(estado, 'O', 0).erro, 'Jogo já finalizado!');
});

test('clássico: tabuleiro cheio sem linha é empate', () => {
  const estado = criarEstadoJogo('classico');

  // X O X / X O O / O X X  -> sem vencedor
  jogar(estado, [
    [0, 'X'], [1, 'O'], [2, 'X'],
    [4, 'O'], [3, 'X'], [5, 'O'],
    [7, 'X'], [6, 'O'], [8, 'X']
  ]);

  assert.strictEqual(linhaVencedora(estado.tabuleiro), null);
  assert.strictEqual(verificarEmpate(estado), true);
});

test('clássico: marcas nunca somem', () => {
  const estado = criarEstadoJogo('classico');
  const resultados = jogar(estado, [[0, 'X'], [1, 'O'], [3, 'X'], [4, 'O'], [6, 'X'], [7, 'O'], [2, 'X'], [5, 'O']]);

  assert.ok(resultados.every(r => r.removida === null));
  assert.deepStrictEqual(marcasExpirando(estado), { X: null, O: null });
});

test('infinito: a 4ª marca apaga a mais antiga do próprio jogador', () => {
  const estado = criarEstadoJogo('infinito');

  jogar(estado, [[0, 'X'], [3, 'O'], [1, 'X'], [4, 'O'], [8, 'X'], [7, 'O']]);
  assert.deepStrictEqual(estado.tabuleiro, ['X', 'X', '', 'O', 'O', '', '', 'O', 'X']);

  const { removida } = aplicarJogada(estado, 'X', 2);
  assert.strictEqual(removida, 0, 'a marca mais antiga de X (pos 0) deveria sair');
  assert.strictEqual(estado.tabuleiro[0], '');
  assert.strictEqual(estado.tabuleiro[2], 'X');
  assert.deepStrictEqual(estado.ordemMarcas.X, [1, 8, 2]);
  assert.strictEqual(estado.ordemMarcas.X.length, MODOS.infinito.maxMarcas);
});

test('infinito: a remoção é do próprio jogador, nunca do adversário', () => {
  const estado = criarEstadoJogo('infinito');

  jogar(estado, [[0, 'X'], [1, 'O'], [3, 'X'], [4, 'O'], [6, 'X'], [7, 'O']]);
  const marcasDeO = [...estado.ordemMarcas.O];

  aplicarJogada(estado, 'X', 2);
  assert.deepStrictEqual(estado.ordemMarcas.O, marcasDeO, 'as marcas de O não podem ser afetadas');
});

test('infinito: marcasExpirando aponta a próxima a sumir de cada jogador', () => {
  const estado = criarEstadoJogo('infinito');

  jogar(estado, [[0, 'X'], [3, 'O'], [1, 'X']]);
  assert.deepStrictEqual(marcasExpirando(estado), { X: null, O: null }, 'com menos de 3 marcas nada expira');

  jogar(estado, [[4, 'O'], [8, 'X'], [7, 'O']]);
  assert.deepStrictEqual(marcasExpirando(estado), { X: 0, O: 3 });
});

test('infinito: vitória vale com as 3 marcas que sobraram depois da remoção', () => {
  const estado = criarEstadoJogo('infinito');

  // X monta uma linha 0-1-2 na mesma jogada em que perde a marca 6
  jogar(estado, [[0, 'X'], [3, 'O'], [1, 'X'], [4, 'O'], [6, 'X'], [8, 'O']]);
  assert.strictEqual(linhaVencedora(estado.tabuleiro), null);

  const { removida } = aplicarJogada(estado, 'X', 2);
  assert.strictEqual(removida, 0, 'pos 0 é a mais antiga e sai — a linha 0-1-2 NÃO se forma');
  assert.strictEqual(linhaVencedora(estado.tabuleiro), null);
});

test('infinito: nunca pode dar velha — o tabuleiro não passa de 6 marcas', () => {
  const estado = criarEstadoJogo('infinito');
  const simbolos = ['X', 'O'];

  // 40 lances alternados em posições livres quaisquer
  for (let turno = 0; turno < 40; turno++) {
    const simbolo = simbolos[turno % 2];
    const livre = estado.tabuleiro.findIndex(c => c === '');
    if (livre === -1) break;

    aplicarJogada(estado, simbolo, livre);

    const ocupadas = estado.tabuleiro.filter(c => c !== '').length;
    assert.ok(ocupadas <= 6, `tabuleiro com ${ocupadas} marcas — deveria ser no máximo 6`);
    assert.strictEqual(verificarEmpate(estado), false, 'empate é impossível no modo infinito');
  }
});

test('linhaVencedora ignora tabuleiro vazio e detecta as 8 combinações', () => {
  assert.strictEqual(linhaVencedora(Array(9).fill('')), null);

  const combinacoes = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const comb of combinacoes) {
    const tabuleiro = Array(9).fill('');
    comb.forEach(pos => { tabuleiro[pos] = 'O'; });
    assert.deepStrictEqual(linhaVencedora(tabuleiro), comb);
  }
});
