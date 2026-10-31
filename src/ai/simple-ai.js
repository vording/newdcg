// CPU / 自動対戦用AI。
// 盤面評価関数 + 1手先読み（候補アクションを複製した状態に適用して評価する）。
// 相手の手札は見ない（複製時に相手の手札を空にする）。

import {
  applyAction, canAttack, canBlockAttacker, getCard, hasKeyword, playability, targetsForHandCard,
} from '../engine/index.js';

// 評価の重み（scripts/simulate.js で調整）
export const WEIGHTS = {
  life: 1.0, // ライフ1点
  lifeLow: 1.0, // ライフが10以下のときの追加の重み
  attack: 1.3,
  hp: 0.9,
  flying: 1.5,
  firstStrike: 1.0,
  vigilance: 0.6,
  hand: 1.6, // 手札1枚
  quickHoldBonus: 1.2, // 対応カードを手札に持っていることの価値（相手ターンに使える）
};

// ---------------------------------------------------------------------------
// 評価
// ---------------------------------------------------------------------------

function lifeValue(life) {
  if (life <= 0) return -1000;
  return WEIGHTS.life * life + WEIGHTS.lifeLow * Math.min(0, life - 10);
}

export function creatureValue(c) {
  const card = getCard(c.cardId);
  const atk = c.attack - (c.tempAttack || 0);
  const hp = c.hp - (c.tempHp || 0) - (c.damage || 0);
  let v = WEIGHTS.attack * atk + WEIGHTS.hp * Math.max(hp, 0);
  if (hasKeyword(card, 'flying')) v += WEIGHTS.flying * Math.min(atk, 3) / 2;
  if (hasKeyword(card, 'firstStrike')) v += WEIGHTS.firstStrike;
  if (hasKeyword(card, 'vigilance')) v += WEIGHTS.vigilance;
  return v;
}

function handValue(hand) {
  return hand.reduce((s, id) => s + WEIGHTS.hand + (hasKeyword(getCard(id), 'quick') ? WEIGHTS.quickHoldBonus : 0), 0);
}

export function evaluate(state, me) {
  if (state.winner === me) return 100000;
  if (state.winner === 'draw') return 0;
  if (state.winner !== null) return -100000;
  const side = (p) => lifeValue(p.life) + p.board.reduce((s, c) => s + creatureValue(c), 0) + handValue(p.hand);
  return side(state.players[me]) - side(state.players[1 - me]);
}

/** 先読み用の複製。ログを捨て、相手の手札は見えないので空にする。 */
function simClone(state, me) {
  const s = structuredClone({ ...state, log: [] });
  s.players[1 - me].hand = [];
  return s;
}

function tryAction(state, me, actor, action) {
  const s = simClone(state, me);
  const res = applyAction(s, actor, action);
  return res.ok ? s : null;
}

// ---------------------------------------------------------------------------
// 意思決定
// ---------------------------------------------------------------------------

/**
 * awaiting.player の次の1アクションを決めて返す（適用はしない）
 * @param {{level?: 'normal'|'easy', random?: () => number}} opts
 *   easy: 対応を見逃しやすく、ブロックは簡易判断、攻撃は上位候補からランダムに選ぶ
 */
export function chooseAction(state, opts = {}) {
  const me = state.awaiting.player;
  const easy = opts.level === 'easy';
  const rnd = opts.random ?? Math.random;
  switch (state.awaiting.step) {
    case 'mulligan': return { type: 'mulligan', handIndices: chooseMulligan(state, me) };
    case 'response': return easy && rnd() < 0.5 ? { type: 'pass' } : chooseResponse(state, me);
    case 'block': return { type: 'declareBlocks', blocks: easy ? quickBlocks(state, me) : chooseBlocks(state, me) };
    default: return choosePlay(state, me) ?? chooseAttack(state, me, easy ? rnd : null);
  }
}

/** 1手進める。不正アクションを選んだ場合は例外にする（AI・エンジンのバグ検出用） */
export function step(state) {
  const player = state.awaiting.player;
  const action = chooseAction(state);
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(`AI chose illegal action ${JSON.stringify(action)}: ${res.error}`);
  return action;
}

function chooseMulligan(state, me) {
  const hand = state.players[me].hand.map(getCard);
  const cheap = hand.filter((c) => c.cost <= 3).length;
  // 序盤に出せるカードが少なければ重いカードを戻す
  return hand.map((c, i) => ((c.cost >= 5 || (cheap < 2 && c.cost >= 4)) ? i : -1)).filter((i) => i >= 0);
}

function playCandidates(state, me) {
  const out = [];
  state.players[me].hand.forEach((id, i) => {
    if (!playability(state, me, i).ok) return;
    for (const target of targetsForHandCard(state, me, i)) out.push({ type: 'playCard', handIndex: i, target });
  });
  return out;
}

/** メインフェイズ: 評価が上がるカードを1枚使う。なければ null */
function choosePlay(state, me) {
  return bestPlay(state, me, true)?.action ?? null;
}

function bestPlay(state, me, allowManaCombo) {
  const base = evaluate(simClone(state, me), me);
  let best = null;
  let bestGain = 0.01;
  for (const action of playCandidates(state, me)) {
    const s = tryAction(state, me, me, action);
    if (!s) continue;
    const card = getCard(state.players[me].hand[action.handIndex]);
    let gain;
    if (card.effect?.type === 'gainMana') {
      // マナを得るカードは、それで出せるようになる次の1枚と合わせて評価する
      if (!allowManaCombo) continue;
      const next = bestPlay(s, me, false);
      if (!next) continue;
      const s2 = tryAction(s, me, me, next.action);
      gain = evaluate(s2, me) - base + 0.15 * getCard(s.players[me].hand[next.action.handIndex]).cost;
      // 同じカードがマナなしでも出せるなら使う意味はない
      if (playability(state, me, state.players[me].hand.indexOf(s.players[me].hand[next.action.handIndex])).ok) continue;
    } else {
      // マナを使い切ることにも少し価値を置く（テンポ）
      gain = evaluate(s, me) - base + 0.15 * card.cost;
    }
    if (gain > bestGain) { bestGain = gain; best = action; }
  }
  return best ? { action: best, gain: bestGain } : null;
}

/** 攻撃: 攻撃可能なクリーチャーの全組み合わせを、相手の予想ブロック込みで評価する */
function chooseAttack(state, me, rnd = null) {
  const ready = state.players[me].board.filter((c) => canAttack(state, c)).map((c) => c.uid);
  const scored = [{ action: { type: 'endTurn' }, score: scoreAfterCombat(tryAction(state, me, me, { type: 'endTurn' }), me) }];
  const n = Math.min(ready.length, 6);
  for (let mask = 1; mask < (1 << n); mask++) {
    const attackers = ready.filter((_, i) => mask & (1 << i));
    const s = tryAction(state, me, me, { type: 'attack', attackers });
    if (s) scored.push({ action: { type: 'attack', attackers }, score: scoreAfterCombat(s, me) });
  }
  scored.sort((a, b) => b.score - a.score);
  if (rnd && scored[0].score < 50000) return scored[Math.floor(rnd() * Math.min(3, scored.length))].action;
  return scored[0].action;
}

/** 相手の対応なし・相手は簡易ブロックを行うと仮定して戦闘を最後まで進めて評価 */
function scoreAfterCombat(s, me) {
  let guard = 10;
  while (s.winner === null && s.awaiting && s.awaiting.player !== s.activePlayer && guard--) {
    const p = s.awaiting.player;
    const action = s.awaiting.step === 'block'
      ? { type: 'declareBlocks', blocks: quickBlocks(s, p) }
      : { type: 'pass' };
    applyAction(s, p, action);
  }
  return evaluate(s, me);
}

/** 対応: 使わない場合と、使える対応カード×対象のすべてを比較 */
function chooseResponse(state, me) {
  let best = { type: 'pass' };
  let bestScore = afterResponseScore(tryAction(state, me, me, best), me);
  state.players[me].hand.forEach((id, i) => {
    if (!playability(state, me, i).ok) return;
    for (const target of targetsForHandCard(state, me, i)) {
      const action = { type: 'playCard', handIndex: i, target };
      const s = tryAction(state, me, me, action);
      if (!s) continue;
      const score = afterResponseScore(s, me) - 0.3; // 手札を使うことへの小さなコスト
      if (score > bestScore) { bestScore = score; best = action; }
    }
  });
  return best;
}

function afterResponseScore(s, me) {
  if (s.awaiting?.step === 'block' && s.awaiting.player === me) {
    applyAction(s, me, { type: 'declareBlocks', blocks: searchBlocks(s, me) });
  }
  return evaluate(s, me);
}

function chooseBlocks(state, me) {
  return searchBlocks(state, me);
}

/** ブロックの割り当てを全探索（多すぎる場合は簡易ブロックで打ち切り） */
function searchBlocks(state, me) {
  const atkBoard = state.players[state.activePlayer].board;
  const attackers = state.combat.attackers.map((uid) => atkBoard.find((c) => c.uid === uid)).filter(Boolean);
  const blockers = state.players[me].board;
  const options = attackers.map((a) => [null, ...blockers.filter((b) => canBlockAttacker(state, b, a)).map((b) => b.uid)]);
  const total = options.reduce((x, o) => x * o.length, 1);
  if (total > 4000) return quickBlocks(state, me);

  let best = null;
  let bestScore = -Infinity;
  const pick = new Array(attackers.length);
  const rec = (i, used) => {
    if (i === attackers.length) {
      const blocks = [];
      pick.forEach((b, k) => { if (b !== null) blocks.push({ attacker: attackers[k].uid, blocker: b }); });
      const s = tryAction(state, me, me, { type: 'declareBlocks', blocks });
      if (!s) return;
      const score = evaluate(s, me);
      if (score > bestScore) { bestScore = score; best = blocks; }
      return;
    }
    for (const b of options[i]) {
      if (b !== null && used.has(b)) continue;
      pick[i] = b;
      if (b !== null) used.add(b);
      rec(i + 1, used);
      if (b !== null) used.delete(b);
    }
  };
  rec(0, new Set());
  return best ?? [];
}

/** 戦闘1対1の結果予測（先制考慮） */
export function fight(a, b) {
  const fa = hasKeyword(getCard(a.cardId), 'firstStrike');
  const fb = hasKeyword(getCard(b.cardId), 'firstStrike');
  const aHp = a.hp - a.damage;
  const bHp = b.hp - b.damage;
  const bDies = a.attack >= bHp;
  const aDies = b.attack >= aHp;
  if (fa && !fb && bDies) return { aDies: false, bDies: true };
  if (fb && !fa && aDies) return { aDies: true, bDies: false };
  return { aDies, bDies };
}

/** 高速な簡易ブロック（攻撃側の予測用） */
function quickBlocks(state, me) {
  const atkBoard = state.players[state.activePlayer].board;
  const attackers = state.combat.attackers
    .map((uid) => atkBoard.find((c) => c.uid === uid)).filter(Boolean)
    .sort((x, y) => y.attack - x.attack);
  const available = [...state.players[me].board];
  const blocks = [];
  let incoming = attackers.reduce((s, a) => s + a.attack, 0);
  const take = (b) => available.splice(available.indexOf(b), 1);
  for (const a of attackers) {
    const legal = available.filter((b) => canBlockAttacker(state, b, a));
    const good = legal.find((b) => { const r = fight(a, b); return r.aDies && !r.bDies; })
      ?? legal.find((b) => !fight(a, b).bDies)
      ?? legal.find((b) => { const r = fight(a, b); return r.aDies && creatureValue(a) >= creatureValue(b); });
    if (good) { blocks.push({ attacker: a.uid, blocker: good.uid }); take(good); incoming -= a.attack; }
  }
  for (const a of attackers) {
    if (incoming < state.players[me].life) break;
    if (blocks.some((x) => x.attacker === a.uid)) continue;
    const chump = available.filter((b) => canBlockAttacker(state, b, a)).sort((x, y) => creatureValue(x) - creatureValue(y))[0];
    if (!chump) continue;
    blocks.push({ attacker: a.uid, blocker: chump.uid }); take(chump); incoming -= a.attack;
  }
  return blocks;
}
