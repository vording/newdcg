import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, DEFAULT_CONFIG, arrangeDeck, deckableCards, listFromCounts, validateDeck, CARDS } from '../src/engine/index.js';

function seq(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }

test('デッキに入れられるカードにトークンとマナの雫は含まれない', () => {
  const ids = deckableCards().map((c) => c.id);
  assert.ok(!ids.includes('s_coin'));
  assert.ok(!ids.includes('t_pup'));
  assert.ok(ids.includes('c_packleader')); // 構築済みデッキに入っていないカードも使える
});

test('CPU用のアレンジ版デッキは、どの構築済みデッキでも30枚・同名3枚までを保つ', () => {
  for (const id of Object.keys(DECKS)) {
    for (let k = 1; k <= 50; k++) {
      const counts = arrangeDeck(id, seq(k), 6);
      assert.deepEqual(validateDeck(listFromCounts(counts), DEFAULT_CONFIG), [], `${id} seed ${k}`);
    }
  }
});

test('アレンジ版は元のデッキと少し違い、入れ替えたカードはコストが近い', () => {
  const base = DECKS.shadow.counts;
  const counts = arrangeDeck('shadow', seq(3), 4);
  const diff = Object.keys({ ...base, ...counts }).reduce((s, id) => s + Math.abs((base[id] ?? 0) - (counts[id] ?? 0)), 0);
  assert.ok(diff > 0 && diff <= 8);
  const cost = (c) => Object.entries(c).reduce((s, [id, n]) => s + CARDS[id].cost * n, 0);
  assert.ok(Math.abs(cost(base) - cost(counts)) <= 4); // 1枚あたり±1まで
});
