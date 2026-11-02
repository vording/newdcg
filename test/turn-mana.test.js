import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/engine/index.js';
import { newGame, ok, setHand } from './helpers.js';

test('マナ: 毎ターン開始時に最大マナ+2（先攻の1ターン目だけ+1）、全回復、上限20', () => {
  const s = newGame();
  const seen = [[], []];
  for (let i = 0; i < 26; i++) {
    const p = s.awaiting.player;
    seen[p].push([s.players[p].maxMana, s.players[p].mana]);
    s.players[p].mana = 0; // 使い切った想定（持ち越さないことの確認）
    ok(applyAction(s, p, { type: 'endTurn' }));
  }
  assert.deepEqual(seen[0].map((x) => x[0]), [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 20, 20, 20]); // 先攻は奇数
  assert.deepEqual(seen[1].map((x) => x[0]), [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 20, 20]); // 後攻は偶数
  assert.ok([...seen[0], ...seen[1]].every(([max, cur]) => max === cur));
});

test('マナの増え方は設定で従来（毎ターン+1・上限10）にも戻せる', () => {
  const s = newGame({ manaPerTurn: 1, firstPlayerFirstTurnMana: null, maxMana: 10 });
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.players[1].maxMana, 1);
  ok(applyAction(s, 1, { type: 'endTurn' }));
  assert.equal(s.players[0].maxMana, 2);
});

test('毎ターン開始時に1枚ドロー', () => {
  const s = newGame();
  const before = s.players[1].hand.length;
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.players[1].hand.length, before + 1);
});

test('手番でないプレイヤーは行動できない', () => {
  const s = newGame();
  setHand(s, 1, ['c_apprentice']);
  assert.equal(applyAction(s, 1, { type: 'endTurn' }).ok, false);
  assert.equal(applyAction(s, 1, { type: 'playCard', handIndex: 0 }).ok, false);
});

test('デッキ切れ: ドローできなくなった時点で敗北（デフォルト）', () => {
  const t = newGame();
  t.players[1].deck = [];
  ok(applyAction(t, 0, { type: 'endTurn' }));
  assert.equal(t.winner, 0);
  assert.equal(t.awaiting, null);
});

test('デッキ切れ: カード効果のドローでも引けなければ敗北', () => {
  const t = newGame();
  t.players[0].deck = [];
  t.players[0].mana = 4;
  t.players[0].hand = ['c_messenger'];
  ok(applyAction(t, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(t.winner, 1);
});

test('デッキ切れ: 最後の1枚は引ける（引けなくなるまでは負けない）', () => {
  const t = newGame();
  t.players[1].deck = t.players[1].deck.slice(0, 1);
  ok(applyAction(t, 0, { type: 'endTurn' }));
  assert.equal(t.winner, null);
  assert.equal(t.players[1].deck.length, 0);
});

test('デッキ切れ: deckOutRule=skip に切り替えると何も起きない', () => {
  const s = newGame({ deckOutRule: 'skip' });
  s.players[1].deck = [];
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.winner, null);
});
