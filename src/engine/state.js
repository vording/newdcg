// ゲーム状態を操作する低レベルのヘルパー。
// game.js（ルール進行）と effects.js（カード効果）の両方から使う。

import { CARDS } from './cards.js';

/** ダメージ等の発生源の表示名（クリーチャーのuid またはカードID） */
function sourceName(state, source) {
  if (typeof source === 'number') return findCreature(state, source)?.name ?? null;
  if (typeof source === 'string') return CARDS[source]?.name ?? null;
  return null;
}

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

/** 場に出すクリーチャーの実体を作る（召喚・トークン生成で共通） */
export function makeCreature(state, cardId, owner) {
  const card = CARDS[cardId];
  return {
    uid: state.nextUid++,
    cardId,
    owner,
    name: card.name,
    attack: card.attack,
    hp: card.hp,
    damage: 0,
    tempAttack: 0,
    tempHp: 0,
    exhausted: false,
    summoningSick: true,
    shield: (card.keywords ?? []).includes('ward'), // 加護
  };
}

function sourceCreatureKeyword(state, source, kw) {
  if (typeof source !== 'number') return false;
  const c = findCreature(state, source);
  return !!c && (CARDS[c.cardId].keywords ?? []).includes(kw);
}

/** 吸命：ダメージを与えたクリーチャーの持ち主のライフを回復（初期ライフが上限） */
function applyLifesteal(state, source, amount) {
  if (!sourceCreatureKeyword(state, source, 'lifesteal')) return;
  const c = findCreature(state, source);
  const p = state.players[c.owner];
  const healed = Math.min(amount, Math.max(0, state.config.startingLife - p.life));
  if (healed > 0) {
    p.life += healed;
    log(state, 'lifeGain', { player: c.owner, amount: healed, sourceName: c.name });
  }
}

export function dealDamageToCreature(state, creature, amount, source) {
  if (amount <= 0) return;
  if (creature.shield) {
    // 加護：ダメージを1回だけ無効にする
    creature.shield = false;
    log(state, 'shieldBroken', { target: creature.uid, targetName: creature.name, owner: creature.owner, sourceName: sourceName(state, source) });
    return;
  }
  creature.damage += amount;
  log(state, 'damage', { target: creature.uid, targetName: creature.name, owner: creature.owner, amount, source, sourceName: sourceName(state, source) });
  if (sourceCreatureKeyword(state, source, 'deathtouch') && creature.damage < creature.hp) {
    creature.damage = creature.hp; // 必殺
    log(state, 'deathtouch', { target: creature.uid, targetName: creature.name, owner: creature.owner, sourceName: sourceName(state, source) });
  }
  applyLifesteal(state, source, amount);
}

export function dealDamageToPlayer(state, playerIndex, amount, source) {
  if (amount <= 0) return;
  state.players[playerIndex].life -= amount;
  log(state, 'playerDamage', { player: playerIndex, amount, source, sourceName: sourceName(state, source) });
  applyLifesteal(state, source, amount);
}

export function gainLife(state, playerIndex, amount, sourceName = null) {
  const p = state.players[playerIndex];
  const healed = Math.min(amount, Math.max(0, state.config.startingLife - p.life));
  if (healed > 0) {
    p.life += healed;
    log(state, 'lifeGain', { player: playerIndex, amount: healed, sourceName });
  }
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
