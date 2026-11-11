import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, canAttack } from '../src/engine/index.js';
import { newGame, ok, put, setHand } from './helpers.js';

const play = (s, p, handIndex, target = null) => ok(applyAction(s, p, { type: 'playCard', handIndex, target }));

test('鏡の反転：自分と相手のクリーチャーがすべて入れ替わり、もらった側はこのターン攻撃できない', () => {
  const s = newGame();
  const mine = put(s, 0, 'c_apprentice');
  const t1 = put(s, 1, 'c_dragon');
  const t2 = put(s, 1, 'c_scout'); // 速攻でも攻撃できない
  setHand(s, 0, ['s_mirror']);
  s.players[0].mana = 11;
  play(s, 0, 0);
  assert.deepEqual(s.players[0].board.map((c) => c.uid), [t1.uid, t2.uid]);
  assert.deepEqual(s.players[1].board.map((c) => c.uid), [mine.uid]);
  assert.ok(s.players[0].board.every((c) => c.owner === 0 && !canAttack(s, c)));
  assert.equal(mine.owner, 1);
  // 次の自分のターンには攻撃できる
  ok(applyAction(s, 0, { type: 'endTurn' }));
  ok(applyAction(s, 1, { type: 'endTurn' }));
  assert.ok(canAttack(s, t1));
});

test('運命の交換：手札がすべて入れ替わる（使ったカード自身は含まない）', () => {
  const s = newGame();
  setHand(s, 0, ['s_fateswap', 'c_apprentice']);
  setHand(s, 1, ['c_dragon', 'c_golem', 's_lance']);
  s.players[0].mana = 6;
  play(s, 0, 0);
  assert.deepEqual(s.players[0].hand, ['c_dragon', 'c_golem', 's_lance']);
  assert.deepEqual(s.players[1].hand, ['c_apprentice']);
});

test('心を操る者：攻撃力4以下の相手クリーチャーだけ奪える。奪ったクリーチャーは自分のものになる', () => {
  const s = newGame();
  const small = put(s, 1, 'c_warrior'); // 3/3
  put(s, 1, 'c_dragon'); // 6/6 は対象外
  setHand(s, 0, ['c_puppeteer']);
  s.players[0].mana = 12;
  play(s, 0, 0, { kind: 'creature', uid: small.uid });
  assert.equal(small.owner, 0);
  assert.ok(s.players[0].board.includes(small));
  assert.equal(s.players[1].board.length, 1);
  assert.equal(canAttack(s, small), false);
});

test('心を操る者：大きな相手しかいなければ、対象なしで出せる', () => {
  const s = newGame();
  put(s, 1, 'c_dragon');
  setHand(s, 0, ['c_puppeteer']);
  s.players[0].mana = 12;
  play(s, 0, 0, null);
  assert.equal(s.players[0].board.length, 1);
});

test('入れ替えの道化：攻撃力と体力を入れ替える。ダメージが残っていれば倒れることもある', () => {
  const s = newGame();
  const boar = put(s, 1, 'c_boar'); // 4/2
  setHand(s, 0, ['c_jester']);
  s.players[0].mana = 5;
  play(s, 0, 0, { kind: 'creature', uid: boar.uid });
  assert.equal(boar.attack, 2);
  assert.equal(boar.hp, 4);
  const s2 = newGame();
  const golem = put(s2, 1, 'c_golem', { damage: 3 }); // 2/5、3ダメージ
  setHand(s2, 0, ['c_jester']);
  s2.players[0].mana = 5;
  play(s2, 0, 0, { kind: 'creature', uid: golem.uid }); // 5/2 になり、3ダメージで倒れる
  assert.equal(s2.players[1].board.length, 0);
});

test('影の掏摸：相手の手札から1枚奪う。相手の手札が空なら何も起きない', () => {
  const s = newGame();
  setHand(s, 0, ['c_pickpocket']);
  setHand(s, 1, ['c_dragon']);
  s.players[0].mana = 3;
  play(s, 0, 0);
  assert.deepEqual(s.players[0].hand, ['c_dragon']);
  assert.deepEqual(s.players[1].hand, []);
  const s2 = newGame();
  setHand(s2, 0, ['c_pickpocket']);
  setHand(s2, 1, []);
  s2.players[0].mana = 3;
  play(s2, 0, 0);
  assert.deepEqual(s2.players[0].hand, []);
});

test('混沌の語り部：お互いに2枚引く', () => {
  const s = newGame();
  setHand(s, 0, ['c_bard']);
  setHand(s, 1, []);
  s.players[0].mana = 4;
  play(s, 0, 0);
  assert.equal(s.players[0].hand.length, 2);
  assert.equal(s.players[1].hand.length, 2);
});
