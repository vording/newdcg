import { createGame, getCard, testDeck } from '../src/engine/index.js';

export function newGame(config = {}, seed = 42) {
  return createGame({ decks: [testDeck(), testDeck()], seed, firstPlayer: 0, config });
}

/** テスト用: 場にクリーチャーを直接置く（召喚酔いなし） */
export function put(state, player, cardId, opts = {}) {
  const card = getCard(cardId);
  const c = {
    uid: state.nextUid++, cardId, owner: player, name: card.name,
    attack: card.attack, hp: card.hp, damage: 0, exhausted: false, summoningSick: false, ...opts,
  };
  state.players[player].board.push(c);
  return c;
}

/** テスト用: 手札を差し替える */
export function setHand(state, player, ids) {
  state.players[player].hand = [...ids];
}

export function ok(res) {
  if (!res.ok) throw new Error(`action failed: ${res.error}`);
  return res;
}
