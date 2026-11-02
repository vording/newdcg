import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/engine/index.js';
import { newGame, ok, put, setHand, passResponses } from './helpers.js';

const attack = (s, ...uids) => applyAction(s, s.activePlayer, { type: 'attack', attackers: uids });
const block = (s, blocks) => {
  if (s.awaiting?.step === 'response') ok(applyAction(s, s.awaiting.player, { type: 'pass' }));
  const res = applyAction(s, 1 - s.activePlayer, { type: 'declareBlocks', blocks });
  if (res.ok) passResponses(s);
  return res;
};

test('吸命: 与えたダメージぶんライフ回復（20を超えて増える）', () => {
  const s = newGame();
  s.players[0].life = 15;
  const bat = put(s, 0, 'c_bat'); // 1/2 天翔 吸命
  ok(attack(s, bat.uid));
  ok(block(s, []));
  assert.equal(s.players[1].life, 19);
  assert.equal(s.players[0].life, 16);
  const t = newGame();
  const b2 = put(t, 0, 'c_bat');
  ok(attack(t, b2.uid));
  ok(block(t, []));
  assert.equal(t.players[0].life, 21); // 上限なし

  const u = newGame({ lifeCap: 20 });
  const b3 = put(u, 0, 'c_bat');
  ok(attack(u, b3.uid));
  ok(block(u, []));
  assert.equal(u.players[0].life, 20); // lifeCap を設定すれば上限あり
});

test('必殺: ダメージを受けたクリーチャーは破壊される', () => {
  const s = newGame();
  const viper = put(s, 0, 'c_viper'); // 1/2 必殺
  const golem = put(s, 1, 'c_golem'); // 2/5
  ok(attack(s, viper.uid));
  ok(block(s, [{ attacker: viper.uid, blocker: golem.uid }]));
  assert.equal(s.players[1].board.length, 0);
  assert.equal(s.players[0].board.length, 0); // 蛇も2ダメージで破壊
});

test('蹂躙: 余ったダメージは相手プレイヤーへ', () => {
  const s = newGame();
  const boar = put(s, 0, 'c_boar'); // 4/2 蹂躙
  const app = put(s, 1, 'c_apprentice'); // 1/2
  ok(attack(s, boar.uid));
  ok(block(s, [{ attacker: boar.uid, blocker: app.uid }]));
  assert.equal(s.players[1].life, 18);
  assert.equal(s.players[1].board.length, 0);
});

test('加護: 最初のダメージを1回だけ無効にする', () => {
  const s = newGame();
  const w = put(s, 1, 'c_warden', { shield: true }); // 3/6 加護
  const a = put(s, 0, 'c_warrior'); // 3/3
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: w.uid }]));
  assert.equal(w.damage, 0);
  assert.equal(w.shield, false);
});

test('加護は必殺も防ぐ／加護は召喚時に付く', () => {
  const s = newGame();
  s.players[0].mana = 10;
  setHand(s, 0, ['c_warden']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  const w = s.players[0].board[0];
  assert.equal(w.shield, true);
  ok(applyAction(s, 0, { type: 'endTurn' }));
  const viper = put(s, 1, 'c_viper');
  ok(applyAction(s, 1, { type: 'attack', attackers: [viper.uid] }));
  if (s.awaiting.step === 'response') ok(applyAction(s, 0, { type: 'pass' }));
  ok(applyAction(s, 0, { type: 'declareBlocks', blocks: [{ attacker: viper.uid, blocker: w.uid }] }));
  assert.ok(s.players[0].board.includes(w));
});

test('遺志: 破壊時に効果（小鬼は相手に1ダメージ、墓守は1枚引く）', () => {
  const s = newGame();
  const imp = put(s, 0, 'c_imp');
  const gk = put(s, 0, 'c_gravekeeper');
  s.players[0].mana = 6;
  setHand(s, 0, []);
  s.players[1].mana = 12;
  ok(applyAction(s, 0, { type: 'endTurn' }));
  setHand(s, 1, ['s_wave']);
  s.players[1].mana = 8;
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].board.length, 0);
  assert.equal(s.players[1].life, 19);
  assert.equal(s.players[0].hand.length, 1); // 墓守の遺志で1枚
  void imp; void gk;
});

test('遺志: 不死鳥は灰の雛（トークン）を残し、トークンは捨て札に行かない', () => {
  const s = newGame();
  put(s, 1, 'c_phoenix');
  s.players[0].mana = 12;
  setHand(s, 0, ['s_judgment']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[1].board.length, 1);
  assert.equal(s.players[1].board[0].cardId, 't_ash');
  const before = s.players[1].graveyard.length;
  s.players[0].mana = 6;
  setHand(s, 0, ['s_fireball']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: s.players[1].board[0].uid } }));
  assert.equal(s.players[1].graveyard.length, before);
});

test('群れの長: 狼の子を2体呼び出す（場の上限まで）', () => {
  const s = newGame();
  for (let i = 0; i < 3; i++) put(s, 0, 'c_apprentice');
  s.players[0].mana = 8;
  setHand(s, 0, ['c_packleader']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].board.length, 5); // 3 + 長 + 子1体（上限）
});

test('足止めの網: 相手を行動済みにしてブロックさせない', () => {
  const s = newGame();
  const e = put(s, 1, 'c_shield');
  const a = put(s, 0, 'c_warrior');
  setHand(s, 0, ['s_snare']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: e.uid } }));
  ok(attack(s, a.uid));
  assert.equal(block(s, [{ attacker: a.uid, blocker: e.uid }]).ok, false);
});

test('送還の風: 手札に戻す／守護の祝福: 加護を与える／癒しの祈り: 回復とドロー', () => {
  const s = newGame();
  const e = put(s, 1, 'c_golem');
  s.players[0].mana = 20;
  s.players[0].life = 10;
  const mine = put(s, 0, 'c_warrior');
  setHand(s, 0, ['s_recall', 's_ward', 's_prayer']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: e.uid } }));
  assert.equal(s.players[1].board.length, 0);
  assert.ok(s.players[1].hand.includes('c_golem'));
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: mine.uid } }));
  assert.equal(mine.shield, true);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].life, 14);
  assert.equal(s.players[0].hand.length, 1);
});

test('断罪の剣: 場のクリーチャーをすべて破壊する（自分の側も、加護も無視）', () => {
  const s = newGame();
  put(s, 0, 'c_warrior');
  put(s, 1, 'c_warden', { shield: true });
  put(s, 1, 'c_gravekeeper');
  s.players[0].mana = 12;
  setHand(s, 0, ['s_judgment']);
  const handBefore = s.players[1].hand.length;
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].board.length, 0);
  assert.equal(s.players[1].board.length, 0);
  assert.equal(s.players[1].hand.length, handBefore + 1); // 墓守の遺志で1枚
});
