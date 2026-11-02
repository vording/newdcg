import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, playability } from '../src/engine/index.js';
import { newGame, ok, put, setHand, passResponses } from './helpers.js';

const attack = (s, ...uids) => applyAction(s, s.activePlayer, { type: 'attack', attackers: uids });
const block = (s, blocks) => {
  if (s.awaiting?.step === 'response') ok(applyAction(s, s.awaiting.player, { type: 'pass' }));
  const res = applyAction(s, 1 - s.activePlayer, { type: 'declareBlocks', blocks });
  if (res.ok) passResponses(s);
  return res;
};

test('天翔: 天翔を持たないクリーチャーではブロックできない', () => {
  const s = newGame();
  const hawk = put(s, 0, 'c_hawk');
  const wall = put(s, 1, 'c_shield');
  const bird = put(s, 1, 'c_messenger');
  ok(attack(s, hawk.uid));
  assert.equal(block(s, [{ attacker: hawk.uid, blocker: wall.uid }]).ok, false);
  ok(block(s, [{ attacker: hawk.uid, blocker: bird.uid }]));
  assert.equal(s.players[1].board.some((c) => c.uid === bird.uid), false);
});

test('先制攻撃: 先に倒せば反撃を受けない', () => {
  const s = newGame();
  const a = put(s, 0, 'c_scout'); // 2/1
  const pike = put(s, 1, 'c_pikeman'); // 2/3 先制攻撃
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: pike.uid }]));
  assert.equal(s.players[0].board.length, 0);
  assert.ok(s.players[1].board.includes(pike));
  assert.equal(pike.damage, 0);
});

test('先制攻撃: 倒し切れなければ通常どおり反撃を受ける', () => {
  const s = newGame({ damageResetsAtTurnEnd: false });
  const a = put(s, 0, 'c_golem'); // 2/6
  const pike = put(s, 1, 'c_pikeman'); // 2/3 先制攻撃
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: pike.uid }]));
  assert.equal(a.damage, 2);
  assert.equal(pike.damage, 2);
});

test('番人: 攻撃しても行動済みにならず、相手ターンにブロックできる', () => {
  const s = newGame();
  const k = put(s, 0, 'c_knight');
  ok(attack(s, k.uid));
  assert.equal(k.exhausted, false);
  ok(block(s, []));
  const e = put(s, 1, 'c_scout');
  ok(attack(s, e.uid));
  ok(block(s, [{ attacker: e.uid, blocker: k.uid }]));
});

test('剛力の薬: ターン終了時まで+2/+2、終了時に元に戻る', () => {
  const s = newGame();
  const c = put(s, 0, 'c_apprentice'); // 1/2
  setHand(s, 0, ['s_might']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: c.uid } }));
  assert.equal(c.attack, 3);
  assert.equal(c.hp, 4);
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(c.attack, 1);
  assert.equal(c.hp, 2);
});

test('瞬発で剛力の薬: ブロッカーを強化して返り討ち', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior'); // 3/3
  const b = put(s, 1, 'c_pikeman'); // 2/3 先制攻撃
  setHand(s, 1, ['s_might']);
  s.players[1].mana = 2;
  ok(attack(s, a.uid));
  assert.equal(s.awaiting.step, 'response');
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: b.uid } }));
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [{ attacker: a.uid, blocker: b.uid }] }));
  assert.equal(s.players[0].board.length, 0);
  assert.equal(s.players[1].board.length, 1);
});

test('召喚時に対象を選ぶクリーチャー（火吹きトカゲ）', () => {
  const s = newGame();
  const e = put(s, 1, 'c_assassin'); // 2/1
  s.players[0].mana = 6;
  setHand(s, 0, ['c_salamander']);
  assert.equal(applyAction(s, 0, { type: 'playCard', handIndex: 0 }).ok, false); // 対象が必要
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: e.uid } }));
  assert.equal(s.players[1].board.length, 0);
  assert.equal(s.players[0].board.length, 1);
});

test('炎の波: 相手のクリーチャーすべてに2ダメージ', () => {
  const s = newGame();
  put(s, 1, 'c_scout'); put(s, 1, 'c_apprentice'); const g = put(s, 1, 'c_golem');
  const mine = put(s, 0, 'c_scout');
  s.players[0].mana = 8;
  setHand(s, 0, ['s_wave']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.deepEqual(s.players[1].board, [g]);
  assert.equal(s.players[0].board[0], mine);
});

test('戦場の将軍: 他の自分のクリーチャーに永続+1/+1', () => {
  const s = newGame();
  const c = put(s, 0, 'c_apprentice');
  s.players[0].mana = 10;
  setHand(s, 0, ['c_general']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(c.attack, 2);
  assert.equal(c.hp, 3);
});

test('マナの雫: このターンだけマナ+1', () => {
  const s = newGame();
  setHand(s, 0, ['s_coin', 'c_scout']);
  assert.equal(playability(s, 0, 1).ok, false);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].mana, 2);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
});
