// カード効果のレジストリ。
// 新しい効果を追加するときは EFFECTS にキーを1つ足し、カードデータの effect.type から参照する。
//
// 各効果は以下を実装する:
//   targetKind : 対象の種類（null = 対象なし）
//   resolve(state, playerIndex, params, target, source)
//
// 対象の表現: { kind: 'player', player: 0|1 } または { kind: 'creature', uid }

import {
  dealDamageToCreature, dealDamageToPlayer, drawCards, findCreature, healCreature,
} from './state.js';

export const EFFECTS = {
  damage: {
    resolve(state, playerIndex, params, target, source) {
      if (target.kind === 'player') dealDamageToPlayer(state, target.player, params.amount, source);
      else dealDamageToCreature(state, findCreature(state, target.uid), params.amount, source);
    },
  },
  healAll: {
    resolve(state, playerIndex, params, target, source) {
      const c = findCreature(state, target.uid);
      healCreature(state, c, c.damage, source);
    },
  },
  draw: {
    resolve(state, playerIndex, params, target, source) {
      drawCards(state, playerIndex, params.amount);
    },
  },
};

/**
 * 効果の対象として選べるものの一覧を返す。
 * 対象種類 (effect.target):
 *   undefined          : 対象なし
 *   'character'        : 任意のクリーチャーまたはプレイヤー
 *   'creature'         : 任意のクリーチャー
 *   'friendlyCreature' : 自分のクリーチャー
 *   'enemyCreature'    : 相手のクリーチャー
 */
export function legalTargets(state, playerIndex, effect) {
  const kind = effect.target;
  if (!kind) return [null];
  const mine = state.players[playerIndex].board;
  const theirs = state.players[1 - playerIndex].board;
  const asTarget = (c) => ({ kind: 'creature', uid: c.uid });
  switch (kind) {
    case 'character':
      return [
        { kind: 'player', player: 0 }, { kind: 'player', player: 1 },
        ...mine.map(asTarget), ...theirs.map(asTarget),
      ];
    case 'creature': return [...mine, ...theirs].map(asTarget);
    case 'friendlyCreature': return mine.map(asTarget);
    case 'enemyCreature': return theirs.map(asTarget);
    default: throw new Error(`Unknown target kind: ${kind}`);
  }
}

export function sameTarget(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return a == b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'player' ? a.player === b.player : a.uid === b.uid;
}

export function resolveEffect(state, playerIndex, effect, target, source) {
  const impl = EFFECTS[effect.type];
  if (!impl) throw new Error(`Unknown effect type: ${effect.type}`);
  impl.resolve(state, playerIndex, effect, target, source);
}
