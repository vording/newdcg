// カード効果のレジストリ。
// 新しい効果を追加するときは EFFECTS にキーを1つ足し、カードデータの effect.type から参照する。
//
// 各効果は以下を実装する:
//   targetKind : 対象の種類（null = 対象なし）
//   resolve(state, playerIndex, params, target, source)
//
// 対象の表現: { kind: 'player', player: 0|1 } または { kind: 'creature', uid }

import {
  dealDamageToCreature, dealDamageToPlayer, drawCards, findCreature, gainLife, healCreature, log, makeCreature,
} from './state.js';
import { CARDS } from './cards.js';

export const EFFECTS = {
  damage: {
    resolve(state, playerIndex, params, target, source) {
      if (target.kind === 'player') { dealDamageToPlayer(state, target.player, params.amount, source); return; }
      // amountIfAttacking：攻撃しているクリーチャーが対象なら、ダメージが増える
      const attacking = params.amountIfAttacking != null && state.combat?.attackers.includes(target.uid);
      dealDamageToCreature(state, findCreature(state, target.uid), attacking ? params.amountIfAttacking : params.amount, source);
    },
  },
  healAll: {
    resolve(state, playerIndex, params, target, source) {
      const c = findCreature(state, target.uid);
      healCreature(state, c, c.damage, source);
    },
  },
  damageAllEnemies: {
    resolve(state, playerIndex, params, target, source) {
      for (const c of [...state.players[1 - playerIndex].board]) dealDamageToCreature(state, c, params.amount, source);
    },
  },
  /** ターン終了時まで +X/+Y */
  buffTemp: {
    resolve(state, playerIndex, params, target, source) {
      const c = findCreature(state, target.uid);
      c.attack += params.attack; c.hp += params.hp;
      c.tempAttack += params.attack; c.tempHp += params.hp;
      log(state, 'buff', { target: c.uid, targetName: c.name, owner: c.owner, attack: params.attack, hp: params.hp, temporary: true });
    },
  },
  /** 自分のクリーチャーすべてにターン終了時まで +X/+Y */
  buffTempAll: {
    resolve(state, playerIndex, params, target, source) {
      for (const c of state.players[playerIndex].board) {
        c.attack += params.attack; c.hp += params.hp;
        c.tempAttack += params.attack; c.tempHp += params.hp;
      }
      log(state, 'buffAll', { player: playerIndex, attack: params.attack, hp: params.hp });
    },
  },
  /** 自分の他のクリーチャーすべてに永続 +X/+Y */
  buffOthers: {
    resolve(state, playerIndex, params, target, source) {
      for (const c of state.players[playerIndex].board) {
        if (c.uid === source) continue;
        c.attack += params.attack; c.hp += params.hp;
        log(state, 'buff', { target: c.uid, targetName: c.name, owner: c.owner, attack: params.attack, hp: params.hp, temporary: false });
      }
    },
  },
  gainMana: {
    resolve(state, playerIndex, params) {
      state.players[playerIndex].mana += params.amount;
      log(state, 'gainMana', { player: playerIndex, amount: params.amount });
      if (params.draw) drawCards(state, playerIndex, params.draw);
    },
  },
  draw: {
    resolve(state, playerIndex, params, target, source) {
      drawCards(state, playerIndex, params.amount);
    },
  },
  /** 自分のライフを回復。draw があれば引く */
  gainLife: {
    resolve(state, playerIndex, params, target, source) {
      gainLife(state, playerIndex, params.amount, typeof source === 'string' ? CARDS[source]?.name : null);
      if (params.draw) drawCards(state, playerIndex, params.draw);
    },
  },
  /** 相手プレイヤーにダメージ */
  damageOpponent: {
    resolve(state, playerIndex, params, target, source) {
      dealDamageToPlayer(state, 1 - playerIndex, params.amount, source);
    },
  },
  /** トークン（デッキに入らないクリーチャー）を場に出す。場がいっぱいなら出ない */
  summonToken: {
    resolve(state, playerIndex, params) {
      const p = state.players[playerIndex];
      for (let i = 0; i < (params.count ?? 1); i++) {
        if (p.board.length >= state.config.boardLimit) break;
        const c = makeCreature(state, params.cardId, playerIndex);
        p.board.push(c);
        log(state, 'summon', { player: playerIndex, uid: c.uid, name: c.name, token: true });
      }
    },
  },
  /** 相手のクリーチャーを行動済みにする（このターン、ブロックできない） */
  exhaust: {
    resolve(state, playerIndex, params, target) {
      const c = findCreature(state, target.uid);
      c.exhausted = true;
      log(state, 'exhausted', { target: c.uid, targetName: c.name, owner: c.owner });
    },
  },
  /** クリーチャーを破壊する（加護は無視） */
  destroy: {
    resolve(state, playerIndex, params, target) {
      const c = findCreature(state, target.uid);
      c.damage = Math.max(c.damage, c.hp);
      log(state, 'destroyEffect', { target: c.uid, targetName: c.name, owner: c.owner });
    },
  },
  /** 場のクリーチャーをすべて破壊する（双方。加護は無視） */
  destroyAll: {
    resolve(state) {
      for (const p of state.players) for (const c of p.board) c.damage = Math.max(c.damage, c.hp);
      log(state, 'destroyAllEffect', {});
    },
  },
  /** 加護を与える */
  grantShield: {
    resolve(state, playerIndex, params, target) {
      const c = findCreature(state, target.uid);
      c.shield = true;
      log(state, 'shieldGranted', { target: c.uid, targetName: c.name, owner: c.owner });
    },
  },
  /** クリーチャーを持ち主の手札に戻す（トークンは消える） */
  bounce: {
    resolve(state, playerIndex, params, target) {
      const c = findCreature(state, target.uid);
      const p = state.players[c.owner];
      p.board = p.board.filter((x) => x.uid !== c.uid);
      log(state, 'bounced', { target: c.uid, targetName: c.name, owner: c.owner });
      if (CARDS[c.cardId].token) return;
      if (state.config.handLimit != null && p.hand.length >= state.config.handLimit) {
        p.graveyard.push(c.cardId);
        log(state, 'burn', { player: c.owner, cardId: c.cardId });
      } else {
        p.hand.push(c.cardId);
      }
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
 *   'attackingCreature': 攻撃している相手のクリーチャー（戦闘中のみ）
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
    case 'attackingCreature':
      return theirs.filter((c) => state.combat?.attackers.includes(c.uid)).map(asTarget);
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
