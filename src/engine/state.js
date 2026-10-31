// ゲーム状態を操作する低レベルのヘルパー。
// game.js（ルール進行）と effects.js（カード効果）の両方から使う。

export function opponentOf(playerIndex) {
  return playerIndex === 0 ? 1 : 0;
}

export function log(state, type, data = {}) {
  state.log.push({ turn: state.turn, type, ...data });
}

export function findCreature(state, uid) {
  for (const p of state.players) {
    const c = p.board.find((x) => x.uid === uid);
    if (c) return c;
  }
  return null;
}

/** クリーチャーの残りHP（最大HP - 蓄積ダメージ） */
export function remainingHp(creature) {
  return creature.hp - creature.damage;
}

export function dealDamageToCreature(state, creature, amount, source) {
  if (amount <= 0) return;
  creature.damage += amount;
  log(state, 'damage', { target: creature.uid, targetName: creature.name, owner: creature.owner, amount, source });
}

export function dealDamageToPlayer(state, playerIndex, amount, source) {
  if (amount <= 0) return;
  state.players[playerIndex].life -= amount;
  log(state, 'playerDamage', { player: playerIndex, amount, source });
}

export function healCreature(state, creature, amount, source) {
  const healed = Math.min(creature.damage, amount);
  creature.damage -= healed;
  log(state, 'heal', { target: creature.uid, targetName: creature.name, owner: creature.owner, amount: healed, source });
}

/** カードを引く。デッキ切れ時の扱いは config.deckOutRule に従う。 */
export function drawCards(state, playerIndex, count) {
  const p = state.players[playerIndex];
  for (let i = 0; i < count; i++) {
    if (p.deck.length === 0) {
      handleDeckOut(state, playerIndex);
      continue;
    }
    const cardId = p.deck.shift();
    if (state.config.handLimit != null && p.hand.length >= state.config.handLimit) {
      p.graveyard.push(cardId);
      log(state, 'burn', { player: playerIndex, cardId });
      continue;
    }
    p.hand.push(cardId);
    log(state, 'draw', { player: playerIndex });
  }
}

function handleDeckOut(state, playerIndex) {
  const p = state.players[playerIndex];
  const rule = state.config.deckOutRule;
  log(state, 'deckOut', { player: playerIndex, rule });
  if (rule === 'lose') {
    p.deckedOut = true;
  } else if (rule === 'fatigue') {
    p.fatigue = (p.fatigue || 0) + 1;
    dealDamageToPlayer(state, playerIndex, p.fatigue, 'fatigue');
  }
  // 'skip' は何もしない
}

/** 決定論的な乱数（mulberry32）。状態に保存してリプレイ・テストを再現可能にする。 */
export function nextRandom(state) {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle(state, array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom(state) * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
