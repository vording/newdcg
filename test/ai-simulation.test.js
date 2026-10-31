import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, testDeck } from '../src/engine/index.js';
import { step } from '../src/ai/simple-ai.js';

test('AI同士の対戦200戦が不正アクションなく決着する', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = createGame({ decks: [testDeck(), testDeck()], seed });
    let n = 0;
    while (s.winner === null && n++ < 2000) step(s);
    assert.notEqual(s.winner, null, `seed ${seed} did not finish`);
    for (const p of s.players) {
      assert.ok(p.board.length <= s.config.boardLimit);
      assert.ok(p.board.every((c) => c.damage < c.hp));
      const cards = [...p.deck, ...p.hand, ...p.board.map((c) => c.cardId), ...p.graveyard].filter((id) => id !== 's_coin');
      assert.equal(cards.length, 30);
    }
  }
});
