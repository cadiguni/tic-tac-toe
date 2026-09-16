const test = require('node:test');
const assert = require('node:assert');

const { hashSenha, verificarSenha, validarSenha } = require('../auth/senha');
const { criarToken, lerToken, lerCookies, tokenDoHeader, NOME_COOKIE } = require('../auth/sessao');

// O módulo de sessão exige SESSION_SECRET em produção; nos testes usamos um fixo
// para que os tokens sejam estáveis entre chamadas.
process.env.SESSION_SECRET = 'segredo-de-teste-nao-usar-em-producao';

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------

test('hashSenha gera hash verificável e diferente a cada chamada', async () => {
  const hashA = await hashSenha('senha-secreta-123');
  const hashB = await hashSenha('senha-secreta-123');

  assert.notStrictEqual(hashA, hashB, 'o salt deve tornar cada hash único');
  assert.match(hashA, /^scrypt\$16384\$8\$1\$/);
  assert.ok(!hashA.includes('senha-secreta-123'), 'a senha não pode aparecer no hash');

  assert.strictEqual(await verificarSenha('senha-secreta-123', hashA), true);
  assert.strictEqual(await verificarSenha('senha-secreta-123', hashB), true);
});

test('verificarSenha recusa senha errada, inclusive por um caractere', async () => {
  const hash = await hashSenha('senha-secreta-123');

  assert.strictEqual(await verificarSenha('senha-secreta-124', hash), false);
  assert.strictEqual(await verificarSenha('Senha-secreta-123', hash), false);
  assert.strictEqual(await verificarSenha('', hash), false);
  assert.strictEqual(await verificarSenha('senha-secreta-123 ', hash), false);
});

test('verificarSenha devolve false (sem lançar) para hash corrompido', async () => {
  for (const ruim of ['', 'nao-e-um-hash', 'scrypt$x$y$z$a$b', 'bcrypt$16384$8$1$AA==$BB==', null, undefined, 42]) {
    assert.strictEqual(await verificarSenha('qualquer', ruim), false, `falhou para: ${ruim}`);
  }
});

test('validarSenha exige tamanho mínimo e máximo', () => {
  assert.match(validarSenha('curta'), /pelo menos 8/);
  assert.match(validarSenha('a'.repeat(129)), /no máximo 128/);
  assert.strictEqual(validarSenha('oitochar'), null);
  assert.strictEqual(validarSenha('a'.repeat(128)), null);
  assert.ok(validarSenha(12345678), 'número não é senha válida');
});

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

test('token válido volta com o mesmo userId', () => {
  const token = criarToken('507f1f77bcf86cd799439011');
  const sessao = lerToken(token);

  assert.ok(sessao);
  assert.strictEqual(sessao.userId, '507f1f77bcf86cd799439011');
  assert.ok(sessao.expiraEm > Date.now());
});

test('token adulterado é rejeitado', () => {
  const token = criarToken('507f1f77bcf86cd799439011');
  const [userId, expira, assinatura] = token.split('.');

  // Trocar o usuário mantendo a assinatura original
  assert.strictEqual(lerToken(`507f1f77bcf86cd799439099.${expira}.${assinatura}`), null);

  // Esticar a validade mantendo a assinatura original
  assert.strictEqual(lerToken(`${userId}.${Number(expira) + 999999}.${assinatura}`), null);

  // Assinatura trocada
  assert.strictEqual(lerToken(`${userId}.${expira}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`), null);
});

test('token expirado é rejeitado', () => {
  // criarToken aceita o "agora" para permitir simular o passado
  const doPassado = criarToken('507f1f77bcf86cd799439011', Date.now() - 40 * 24 * 60 * 60 * 1000);
  assert.strictEqual(lerToken(doPassado), null);
});

test('lerToken nunca lança para entrada malformada', () => {
  for (const ruim of ['', 'a', 'a.b', 'a.b.c.d', null, undefined, 42, {}]) {
    assert.strictEqual(lerToken(ruim), null, `falhou para: ${JSON.stringify(ruim)}`);
  }
});

test('lerCookies entende o header e ignora lixo', () => {
  assert.deepStrictEqual(lerCookies('a=1; b=2'), { a: '1', b: '2' });
  assert.deepStrictEqual(lerCookies('  espaco = valor  '), { espaco: 'valor' });
  assert.deepStrictEqual(lerCookies('sem-igual; a=1'), { a: '1' });
  assert.deepStrictEqual(lerCookies(''), {});
  assert.deepStrictEqual(lerCookies(undefined), {});
  assert.deepStrictEqual(lerCookies('x=a%20b'), { x: 'a b' });
});

test('tokenDoHeader extrai o cookie de sessão entre outros', () => {
  const token = criarToken('507f1f77bcf86cd799439011');
  const header = `outro=1; ${NOME_COOKIE}=${token}; mais=2`;

  assert.strictEqual(tokenDoHeader(header), token);
  assert.strictEqual(tokenDoHeader('outro=1'), null);
  assert.strictEqual(tokenDoHeader(undefined), null);
});
