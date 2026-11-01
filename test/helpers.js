import { applyAction, createGame, getCard, testDeck } from '../src/engine/index.js';

/** 引き直しなし（両者キープ）で開始したゲーム。先攻はプレイヤー0。 */
export function newGame(config = {}, seed = 42) {
  const s = createGame({ decks: [testDeck(), testDeck()], seed, firstPlayer: 0, config });
  if (s.awaiting?.step === 'mulligan') {
    ok(applyAction(s, 0, { type: 'mulligan', handIndices: [] }));
    ok(applyAction(s, 1, { type: 'mulligan', handIndices: [] }));
  }
  return s;
}

/** テスト用: 場にクリーチャーを直接置く（召喚酔いなし） */
export function put(state, player, cardId, opts = {}) {
  const card = getCard(cardId);
  const c = {
    uid: state.nextUid++, cardId, owner: player, name: card.name,
    attack: card.attack, hp: card.hp, damage: 0, tempAttack: 0, tempHp: 0, exhausted: false, summoningSick: false, ...opts,
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

/** 残っている瞬発の機会をすべて見送る */
export function passResponses(state) {
  let guard = 10;
  while (state.awaiting?.step === 'response' && guard--) ok(applyAction(state, state.awaiting.player, { type: 'pass' }));
}
