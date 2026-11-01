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

test('瞬発: 瞬発カードがなければ確認なしでブロック宣言へ', () => {
  const { s, a } = attackSetup(['s_fireball', 'c_apprentice'], 5);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'block' });
});

test('瞬発: マナが足りなければ確認なし（構えの軽減後でも足りない）', () => {
  const { s, a } = attackSetup(['s_lance'], 0); // 2コスト → 相手ターン中は1
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.equal(s.awaiting.step, 'block');
});

test('瞬発: 攻撃宣言後に防御側へ確認。瞬発カード以外は使えない', () => {
  const { s, a } = attackSetup(['s_arrow', 'c_apprentice'], 1);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'response', window: 'attack' });
  assert.equal(applyAction(s, 1, { type: 'playCard', handIndex: 1 }).ok, false);
  assert.equal(applyAction(s, 0, { type: 'pass' }).ok, false); // この機会は防御側のもの
  ok(applyAction(s, 1, { type: 'pass' }));
  assert.equal(s.awaiting.step, 'block');
});

test('瞬発: 迎撃で攻撃クリーチャーを倒すと戦闘から外れ、残りでブロック宣言', () => {
  const { s, a, a2 } = attackSetup(['s_arrow', 's_mend'], 2);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid, a2.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a2.uid } }));
  assert.equal(s.players[1].mana, 2); // 構え：相手ターン中は1コスト軽減（1→0）
  // 1回の瞬発で使えるのは1枚。解決後すぐブロック宣言へ（再瞬発なし）
  assert.deepEqual(s.awaiting, { player: 1, step: 'block' });
  assert.deepEqual(s.combat.attackers, [a.uid]);
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [] }));
  assert.equal(s.players[1].life, 17);
});

test('瞬発: 攻撃クリーチャーが全滅したら戦闘は終わりターン終了', () => {
  const { s, a2 } = attackSetup(['s_arrow'], 1);
  ok(applyAction(s, 0, { type: 'attack', attackers: [a2.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a2.uid } }));
  assert.deepEqual(s.awaiting, { player: 1, step: 'main' });
  assert.equal(s.players[1].life, 20);
});

test('瞬発カードは自分のメインフェイズにも使える（剛力の薬）', () => {
  const s = newGame();
  const mine = put(s, 0, 'c_scout');
  setHand(s, 0, ['s_might']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: mine.uid } }));
  assert.equal(mine.attack, 4);
});

test('迎撃の矢は攻撃中のクリーチャーしか対象にできない（メインフェイズでは使えない）', () => {
  const s = newGame();
  put(s, 1, 'c_scout');
  setHand(s, 0, ['s_arrow']);
  assert.equal(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: null }).ok, false);
});

test('瞬発の機会: ブロック宣言の後に攻撃側→防御側の順で使える', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior'); // 3/3
  const b = put(s, 1, 'c_pikeman'); // 2/3 先制攻撃
  setHand(s, 0, ['s_riposte']);
  setHand(s, 1, ['s_might']);
  s.players[0].mana = 1;
  s.players[1].mana = 0; // 剛力の薬は相手ターン中なら 1→0
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  // 攻撃宣言後：防御側の機会
  assert.deepEqual(s.awaiting, { player: 1, step: 'response', window: 'attack' });
  ok(applyAction(s, 1, { type: 'pass' }));
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [{ attacker: a.uid, blocker: b.uid }] }));
  // ブロック後：攻撃側の機会
  assert.deepEqual(s.awaiting, { player: 0, step: 'response', window: 'blockA' });
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a.uid } })); // 返し刃 +3/+0
  // 続いて防御側の機会
  assert.deepEqual(s.awaiting, { player: 1, step: 'response', window: 'blockD' });
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: b.uid } })); // 剛力 +2/+2
  // 槍兵 4/5 先制 → 戦士 6/3 は先に4ダメージを受けて倒れる
  assert.equal(s.players[0].board.length, 0);
  assert.equal(s.players[1].board.length, 1);
});

test('瞬発クリーチャー: 相手の攻撃に合わせて呼び出し、そのままブロックできる', () => {
  const s = newGame();
  const a = put(s, 0, 'c_warrior');
  setHand(s, 1, ['c_ambusher']); // 2コスト → 相手ターン中は1
  s.players[1].mana = 1;
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0 }));
  const amb = s.players[1].board[0];
  assert.equal(amb.cardId, 'c_ambusher');
  assert.equal(s.players[1].mana, 0);
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [{ attacker: a.uid, blocker: amb.uid }] }));
});

test('構え: 瞬発カードのコスト軽減は相手のターン中だけ', () => {
  const s = newGame();
  setHand(s, 0, ['s_lance']);
  put(s, 1, 'c_scout');
  s.players[0].mana = 1;
  assert.equal(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: s.players[1].board[0].uid } }).ok, false);
});

test('瞬発の機会では、マナが続く限り何枚でも使える', () => {
  const { s, a, a2 } = attackSetup(['s_arrow', 's_arrow'], 0); // 1コスト → 0
  ok(applyAction(s, 0, { type: 'attack', attackers: [a.uid, a2.uid] }));
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a2.uid } }));
  assert.equal(s.awaiting.step, 'response');
  ok(applyAction(s, 1, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: a.uid } }));
  assert.equal(s.awaiting.step, 'block');
});
