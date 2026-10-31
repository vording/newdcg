import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction, playability } from '../src/engine/index.js';
import { newGame, ok, put, setHand } from './helpers.js';

test('召喚: マナを支払い場に出る。召喚酔いで攻撃不可', () => {
  const s = newGame();
  setHand(s, 0, ['c_apprentice']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].mana, 0);
  assert.equal(s.players[0].board.length, 1);
  const uid = s.players[0].board[0].uid;
  assert.equal(applyAction(s, 0, { type: 'attack', attackers: [uid] }).ok, false);
});

test('マナ不足のカードは使えない', () => {
  const s = newGame();
  setHand(s, 0, ['c_dragon']);
  assert.equal(playability(s, 0, 0).ok, false);
  assert.equal(applyAction(s, 0, { type: 'playCard', handIndex: 0 }).ok, false);
  assert.equal(s.players[0].hand.length, 1);
});

test('速攻は召喚したターンに攻撃できる', () => {
  const s = newGame();
  s.players[0].mana = 2;
  setHand(s, 0, ['c_wolf']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  const uid = s.players[0].board[0].uid;
  s.players[1].hand = [];
  ok(applyAction(s, 0, { type: 'attack', attackers: [uid] }));
  ok(applyAction(s, 1, { type: 'declareBlocks', blocks: [] }));
  assert.equal(s.players[1].life, 17);
});

test('配置上限5体を超えて召喚できない', () => {
  const s = newGame();
  for (let i = 0; i < 5; i++) put(s, 0, 'c_apprentice');
  setHand(s, 0, ['c_apprentice']);
  assert.match(playability(s, 0, 0).reason, /上限/);
});

test('召喚時効果: 伝令の鳥で1枚引く', () => {
  const s = newGame();
  s.players[0].mana = 2;
  setHand(s, 0, ['c_messenger']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0 }));
  assert.equal(s.players[0].hand.length, 1);
});

test('スペル: 火球でクリーチャー・プレイヤーにダメージ。不正対象は拒否', () => {
  const s = newGame();
  const enemy = put(s, 1, 'c_golem');
  s.players[0].mana = 6;
  setHand(s, 0, ['s_fireball', 's_fireball']);
  assert.equal(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: 999 } }).ok, false);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: enemy.uid } }));
  assert.equal(enemy.damage, 3);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'player', player: 1 } }));
  assert.equal(s.players[1].life, 17);
  assert.equal(s.players[0].graveyard.length, 2);
});

test('スペル: 癒しの光でダメージを全回復', () => {
  const s = newGame();
  const mine = put(s, 0, 'c_golem', { damage: 4 });
  setHand(s, 0, ['s_mend']);
  ok(applyAction(s, 0, { type: 'playCard', handIndex: 0, target: { kind: 'creature', uid: mine.uid } }));
  assert.equal(mine.damage, 0);
});

test('対象がいないスペルは使えない', () => {
  const s = newGame();
  setHand(s, 0, ['s_mend']);
  assert.equal(playability(s, 0, 0).ok, false);
});
