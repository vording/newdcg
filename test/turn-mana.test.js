import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/engine/index.js';
import { newGame, ok, setHand } from './helpers.js';

test('マナ: 自分のターン開始時に最大マナ+1、全回復、上限10', () => {
  const s = newGame();
  const seen = [];
  for (let i = 0; i < 24; i++) {
    const p = s.awaiting.player;
    if (p === 0) seen.push([s.players[0].maxMana, s.players[0].mana]);
    s.players[p].mana = 0; // 使い切った想定（持ち越さないことの確認）
    ok(applyAction(s, p, { type: 'endTurn' }));
  }
  assert.deepEqual(seen.map((x) => x[0]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10]);
  assert.ok(seen.every(([max, cur]) => max === cur));
});

test('後攻もマナ成長速度は同じ', () => {
  const s = newGame();
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.players[1].maxMana, 1);
  ok(applyAction(s, 1, { type: 'endTurn' }));
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.players[1].maxMana, 2);
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
  t.players[0].mana = 2;
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
