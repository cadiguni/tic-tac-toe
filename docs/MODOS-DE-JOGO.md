# Modos de jogo

O modo é escolhido **na criação da sala** e vale para todas as partidas dela.
Quem entra depois joga o modo da sala, independente do que pedir na URL.

| | Clássico | Infinito |
|---|---|---|
| Marcas por jogador | ilimitadas | máximo 3 |
| Marcas no tabuleiro | até 9 | até 6 |
| Pode dar velha | sim | **não** |
| Duração típica | 5 a 9 jogadas | indefinida |

---

## Clássico

Regras de sempre. X e O alternam, ganha quem fizer três em linha, e o tabuleiro
cheio sem linha é empate.

## Infinito

Cada jogador mantém no máximo **3 marcas** no tabuleiro.

Ao colocar a 4ª, a marca **mais antiga dele** desaparece — nunca a do
adversário. Como cada jogador sempre tem no máximo 3 marcas, o tabuleiro nunca
passa de 6 das 9 casas: **sempre há jogada disponível e empate é impossível**.

### A ordem importa

A remoção acontece **antes** da checagem de vitória. Na prática: você só vence
com as 3 marcas que continuam no tabuleiro depois da sua jogada.

Isso cria a armadilha central do modo. No exemplo abaixo X tem marcas em 0, 1 e
6, e joga em 2 tentando fechar a linha de cima:

```
     antes                    depois de X jogar em 2

  X │ X │ .                     . │ X │ X
 ───┼───┼───                   ───┼───┼───
  . │ O │ O        ──▶          . │ O │ O
 ───┼───┼───                   ───┼───┼───
  X │ . │ .                     X │ . │ .

 X tem 0, 1, 6                 a marca 0 era a mais antiga e saiu.
 (0 é a mais antiga)           X passa a ter 1, 6, 2 — a linha 0-1-2
                               NÃO se forma. Não é vitória.
```

Para fechar 0-1-2, X precisaria que a marca de posição 0 **não** fosse a mais
antiga — ou seja, teria que ter jogado nessa ordem.

### O que a tela mostra

A marca que vai sumir na próxima jogada do dono fica com **borda dourada e
piscando**. Vale para os dois jogadores: é informação pública, dá para planejar
em cima da marca que o adversário está prestes a perder.

Quando a marca sai, ela gira e encolhe com um som grave.

### Estratégia

- Suas 3 marcas são um recurso rotativo, não um patrimônio. Pense em "qual das
  minhas marcas eu topo perder", não em "onde eu jogo".
- Bloquear o adversário é temporário: o bloqueio some quando for a vez daquela
  marca.
- Se a sua marca mais antiga está numa posição crítica (o centro, por exemplo),
  às vezes vale jogar uma marca "inútil" só para empurrar o rodízio.

---

## Como usar

**Pela home**: escolha o cartão do modo antes de clicar em "Criar Nova Sala" ou
"Entrar em Sala".

**Direto pela URL**:

```
/nova-sala?modo=infinito     cria uma sala nova no modo infinito
/nova-sala?modo=classico     cria uma sala nova no modo clássico
/sala/minha-sala?modo=infinito   entra; o modo só é aplicado se a sala não existir
```

Um modo desconhecido cai no clássico em vez de dar erro.

**Ranking por modo**:

```
GET /ranking?modo=infinito    (com header Accept: application/json)
```

`GET /modos` lista os modos disponíveis com nome e descrição.

---

## Implementação

Tudo que é regra está em [`game/modos.js`](../game/modos.js), um módulo puro —
sem Express, Socket.IO ou Mongoose. É o que permite testar as regras sem subir
nada (`test/modos.test.js`).

O modo entra no estado da sala em `criarEstadoJogo(modo)`:

```js
{
  modo: 'infinito',
  tabuleiro: ['X', '', 'O', ...],
  turno: 'X',
  finalizada: false,
  totalJogadas: 7,
  ordemMarcas: { X: [1, 8, 2], O: [3, 4, 7] }   // ordem de colocação
}
```

`ordemMarcas` é o coração do modo: uma fila por símbolo. `aplicarJogada` dá
`push` na posição nova e, se a fila passar de `maxMarcas`, dá `shift` e limpa
aquela casa do tabuleiro. `marcasExpirando` só lê o primeiro item de cada fila.

No modo clássico `maxMarcas` é `null`, a fila nunca é cortada e o comportamento
é idêntico ao de antes.

Para adicionar um modo novo, veja a seção correspondente no
[CLAUDE.md](../CLAUDE.md).
