import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, createGame, testDeck } from '../src/engine/index.js';
import { newGame, ok, put, setHand } from './helpers.js';

test('マリガン: 先攻→後攻の順に1回ずつ。選んだ枚数だけ引き直し、その後先攻のターン開始', () => {
  const s = createGame({ decks: [testDeck(), testDeck()], seed: 3, firstPlayer: 1 });
  assert.deepEqual(s.awaiting, { player: 1, step: 'mulligan' });
  assert.equal(applyAction(s, 0, { type: 'mulligan', handIndices: [] }).ok, false);
  ok(applyAction(s, 1, { type: 'mulligan', handIndices: [0, 1] }));
  assert.equal(s.players[1].hand.length, 4);
  assert.deepEqual(s.awaiting, { player: 0, step: 'mulligan' });
  assert.equal(applyAction(s, 0, { type: 'mulligan', handIndices: [9] }).ok, false);
  ok(applyAction(s, 0, { type: 'mulligan', handIndices: [] }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'main' });
  assert.equal(s.players[1].hand.length, 5);
  assert.equal(s.players[1].deck.length + s.players[1].hand.length, 30);
  assert.equal(applyAction(s, 1, { type: 'mulligan', handIndices: [] }).ok, false);
});

test('手札上限10枚: 超えて引いたカードは墓地へ', () => {
  const s = newGame();
  setHand(s, 1, Array(10).fill('c_scout'));
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(s.players[1].hand.length, 10);
  assert.equal(s.players[1].graveyard.length, 1);
});

function attackSetup(defHand, defMana = 1) {
  const s = newGame();
  const a = put(s, 0, 'c_warrior'); // 3/3
  const a2 = put(s, 0, 'c_scout'); // 2/1
  setHand(s, 1, defHand);
  s.players[1].mana = defMana; // 自分のターンに使い残したマナ
  return { s, a, a2 };
}

test('対応: 対応カードがなければ確認なしでブロック宣言へ', () => {
  const { s, a } = attackSetup(['s_fireball', 'c_apprentice'], 5);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'block' });
});

test('対応: マナが足りなければ確認なし', () => {
  const { s, a } = attackSetup(['s_arrow'], 0);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.equal(s.awaiting.step, 'block');
});

test('対応: 攻撃宣言後に防御側へ確認。対応カード以外は使えない', () => {
  const { s, a } = attackSetup(['s_arrow', 'c_apprentice'], 1);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'response' });
  assert.equal(applyAction(s, 1, { type: 'playCard', handIndex: 1 }).ok, false);
  assert.equal(applyAction(s, 0, { type: 'pass' }).ok, false); // 攻撃側は対応できない
  ok(applyAction(s, 1, { type: 'pass' }));
  assert.equal(s.awaiting.step, 'block');
});

test('対応: 迎撃で攻撃クリーチャーを倒すと戦闘から外れ、残りでブロック宣言', () => {
  const { s, a, a2 } = attackSetup(['s_arrow', 's_mend'], 2);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid, a2.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a2.uid } }));
  assert.equal(s.players[1].mana, 1);
  // 1回の対応で使えるのは1枚。解決後すぐブロック宣言へ（再対応なし）
  assert.deepEqual(s.awaiting, { player: 1, step: 'block' });
  assert.deepEqual(s.combat.attackers, [a.uid]);
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [] }));
  assert.equal(s.players[1].life, 17);
});

test('対応: 攻撃クリーチャーが全滅したら戦闘は終わりターン終了', () => {
  const { s, a2 } = attackSetup(['s_arrow'], 1);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a2.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a2.uid } }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'main' });
  assert.equal(s.players[1].life, 20);
});

test('対応カードは自分のメインフェイズにも使える', () => {
  const s = newGame();
  const e = put(s, 1, 'c_scout');
  setHand(s, 0, ['s_arrow']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: e.uid } }));
  assert.equal(s.players[1].board.length, 0);
});
