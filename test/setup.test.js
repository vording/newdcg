import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, testDeck, validateDeck, DEFAULT_CONFIG } from '../src/engine/index.js';
import { newGame } from './helpers.js';

test('テストデッキは構築ルールを満たす', () => {
  assert.deepEqual(validateDeck(testDeck(), DEFAULT_CONFIG), []);
});

test('不正なデッキは拒否される（枚数・同名上限）', () => {
  const d = testDeck();
  assert.ok(validateDeck(d.slice(1), DEFAULT_CONFIG).length > 0);
  const four = [...d.slice(0, 26), 'c_dragon', 'c_dragon', 'c_dragon', 'c_dragon'];
  assert.ok(validateDeck(four, DEFAULT_CONFIG).some((e) => e.includes('3枚まで')));
  assert.throws(() => createGame({ decks: [d.slice(1), d] }));
});

test('初期状態: ライフ20、先攻4枚+1ドロー、後攻5枚+マナの雫', () => {
  const s = newGame();
  assert.equal(s.players[0].life, 20);
  assert.equal(s.players[1].life, 20);
  assert.equal(s.players[0].hand.length, 5); // 4枚 + 1ターン目ドロー
  assert.equal(s.players[1].hand.length, 6);
  assert.ok(s.players[1].hand.includes('s_coin'));
  assert.equal(s.players[0].deck.length + s.players[0].hand.length, 30);
  assert.deepEqual(s.awaiting, { player: 0, step: 'main' });
});

test('マナの雫はデッキに入れられない', () => {
  const d = [...testDeck().slice(1), 's_coin'];
  assert.ok(validateDeck(d, DEFAULT_CONFIG).some((e) => e.includes('入れられません')));
});

test('先攻1ターン目のドローは設定で無効化できる', () => {
  const s = newGame({ firstPlayerDrawsOnFirstTurn: false });
  assert.equal(s.players[0].hand.length, 4);
});

test('同じシードなら同じ結果（再現性）', () => {
  const a = createGame({ decks: [testDeck(), testDeck()], seed: 7 });
  const b = createGame({ decks: [testDeck(), testDeck()], seed: 7 });
  assert.deepEqual(a.players.map((p) => p.hand), b.players.map((p) => p.hand));
  assert.equal(a.firstPlayer, b.firstPlayer);
});
