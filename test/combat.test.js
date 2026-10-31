import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/engine/index.js';
import { newGame, ok, put, setHand } from './helpers.js';

const attack = (s, ...uids) => applyAction(s, s.activePlayer, { type: 'attack', attackers: uids });
const block = (s, blocks) => {
  if (s.awaiting?.step === 'response') ok(applyAction(s, s.awaiting.player, { type: 'pass' }));
  return applyAction(s, 1 - s.activePlayer, { type: 'declareBlocks', blocks });
};

test('ブロックなし: 攻撃力分のダメージをプレイヤーへ。攻撃後は行動済み、ターン終了', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior');
  ok(attack(s, a.uid));
  assert.equal(a.exhausted, true);
  assert.deepEqual(s.awaiting, { player: 1, step: 'block' });
  ok(block(s, []));
  assert.equal(s.players[1].life, 17);
  assert.deepEqual(s.awaiting, { player: 1, step: 'main' });
});

test('ブロック: 互いの攻撃力分を同時に与え、HP以上で破壊（相打ち）', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior');
  const b = put(s, 1, 'c_warrior');
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: b.uid }]));
  assert.equal(s.players[0].board.length, 0);
  assert.equal(s.players[1].board.length, 0);
  assert.equal(s.players[1].life, 20);
});

test('ダメージはターン終了時に全回復する（デフォルト）', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior'); // 3/3
  const golem = put(s, 1, 'c_golem'); // 3/6
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: golem.uid }]));
  assert.equal(s.players[0].board.length, 0); // 致死ダメージは即座に破壊
  assert.equal(golem.damage, 0); // 生き残った側はターン終了で回復
});

test('ダメージはターン中は残る（同じターン内の火球と組み合わせ）', () => {
  const s = newGame();
  const golem = put(s, 1, 'c_golem'); // 3/6
  s.players[0].mana = 4;
  setHand(s, 0, ['s_fireball', 's_fireball']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: golem.uid } }));
  assert.equal(golem.damage, 3);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: golem.uid } }));
  assert.equal(s.players[1].board.length, 0);
});

test('damageResetsAtTurnEnd=false: ダメージは蓄積しターンをまたいで回復しない', () => {
  const s = newGame({ damageResetsAtTurnEnd: false });
  const a = put(s, 0, 'c_warrior'); // 3/3
  const golem = put(s, 1, 'c_golem'); // 3/6
  ok(attack(s, a.uid));
  ok(block(s, [{ attacker: a.uid, blocker: golem.uid }]));
  assert.equal(golem.damage, 3);
  assert.equal(s.players[0].board.length, 0);
  // 次のターン、さらにターン終了を経ても蓄積は残る
  ok(applyAction(s, 1, { type: 'endTurn' }));
  ok(applyAction(s, 0, { type: 'endTurn' }));
  assert.equal(golem.damage, 3);
  // 追加で3ダメージ（合計6 = HP）で破壊
  const a2 = put(s, 0, 'c_warrior');
  ok(applyAction(s, 1, { type: 'endTurn' }));
  ok(attack(s, a2.uid));
  ok(block(s, [{ attacker: a2.uid, blocker: golem.uid }]));
  assert.equal(s.players[1].board.length, 0);
});

test('1体の攻撃にブロッカーは1体まで / 1体は複数ブロック不可', () => {
  const s = newGame();
  const a1 = put(s, 0, 'c_apprentice');
  const a2 = put(s, 0, 'c_apprentice');
  const b1 = put(s, 1, 'c_shield');
  const b2 = put(s, 1, 'c_shield');
  ok(attack(s, a1.uid, a2.uid));
  assert.equal(block(s, [{ attacker: a1.uid, blocker: b1.uid }, { attacker: a1.uid, blocker: b2.uid }]).ok, false);
  assert.equal(block(s, [{ attacker: a1.uid, blocker: b1.uid }, { attacker: a2.uid, blocker: b1.uid }]).ok, false);
  ok(block(s, [{ attacker: a1.uid, blocker: b1.uid }]));
  assert.equal(s.players[1].life, 19);
});

test('同じクリーチャーは1ターンに1回しか攻撃できない', () => {
  const s = newGame();
  const a = put(s, 0, 'c_apprentice');
  assert.equal(attack(s, a.uid, a.uid).ok, false);
});

test('行動済みはターン開始時にリフレッシュされる', () => {
  const s = newGame();
  const a = put(s, 0, 'c_apprentice');
  ok(attack(s, a.uid));
  ok(block(s, []));
  ok(applyAction(s, 1, { type: 'endTurn' }));
  assert.equal(a.exhausted, false);
  ok(attack(s, a.uid));
});

test('未確定Q2: exhaustedCanBlock=false なら攻撃したクリーチャーはブロックできない', () => {
  const s = newGame();
  const mine = put(s, 0, 'c_shield');
  ok(attack(s, mine.uid));
  ok(block(s, []));
  const enemy = put(s, 1, 'c_apprentice');
  ok(attack(s, enemy.uid));
  assert.equal(block(s, [{ attacker: enemy.uid, blocker: mine.uid }]).ok, false);

  const t = newGame({ exhaustedCanBlock: true });
  const m2 = put(t, 0, 'c_shield');
  ok(attack(t, m2.uid));
  ok(block(t, []));
  const e2 = put(t, 1, 'c_apprentice');
  ok(attack(t, e2.uid));
  ok(block(t, [{ attacker: e2.uid, blocker: m2.uid }]));
});

test('Q1: ブロックしたクリーチャーは行動済みになり、自分のターン開始時に解除される', () => {
  const s = newGame();
  const a1 = put(s, 0, 'c_apprentice');
  const a2 = put(s, 0, 'c_apprentice');
  const b = put(s, 1, 'c_shield');
  ok(attack(s, a1.uid, a2.uid));
  // 戦闘解決前のブロック宣言時点で行動済みになることを確認するため、ダメージ解決を観測する
  ok(block(s, [{ attacker: a1.uid, blocker: b.uid }]));
  const ev = s.log.find((e) => e.type === 'blockerExhausted' && e.uid === b.uid);
  assert.ok(ev, 'ブロッカーが行動済みになったログがある');
  // 戦闘後に防御側のターンが始まり、リフレッシュされている
  assert.equal(s.activePlayer, 1);
  assert.equal(b.exhausted, false);
});

test('勝敗: ライフ0以下で敗北', () => {
  const s = newGame();
  s.players[1].life = 3;
  const a = put(s, 0, 'c_warrior');
  ok(attack(s, a.uid));
  ok(block(s, []));
  assert.equal(s.winner, 0);
  assert.equal(s.awaiting, null);
  assert.equal(applyAction(s, 1, { type: 'endTurn' }).ok, false);
});
