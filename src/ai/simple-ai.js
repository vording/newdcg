// 動作確認・バランス計測用の単純な貪欲AI。強さよりも「ルールを一通り使うこと」を目的とする。

import {
  applyAction, canAttack, canBlock, getCard, playability, remainingHp, targetsForHandCard,
} from '../engine/index.js';

/** awaiting.player の次の1アクションを決めて返す（適用はしない） */
export function chooseAction(state) {
  const me = state.awaiting.player;
  if (state.awaiting.step === 'block') return { type: 'declareBlocks', blocks: chooseBlocks(state, me) };

  const play = choosePlay(state, me);
  if (play) return play;
  const attackers = chooseAttackers(state, me);
  if (attackers.length) return { type: 'attack', attackers };
  return { type: 'endTurn' };
}

/** 1手進める。不正アクションを選んだ場合は例外にする（AI・エンジンのバグ検出用） */
export function step(state) {
  const player = state.awaiting.player;
  const action = chooseAction(state);
  const res = applyAction(state, player, action);
  if (!res.ok) throw new Error(`AI chose illegal action ${JSON.stringify(action)}: ${res.error}`);
  return action;
}

function choosePlay(state, me) {
  const p = state.players[me];
  const order = p.hand
    .map((id, i) => ({ i, card: getCard(id) }))
    .filter(({ i }) => playability(state, me, i).ok)
    .sort((a, b) => b.card.cost - a.card.cost);
  for (const { i, card } of order) {
    if (card.type === 'creature') return { type: 'playCard', handIndex: i };
    const target = chooseSpellTarget(state, me, i, card);
    if (target !== undefined) return { type: 'playCard', handIndex: i, target };
  }
  return null;
}

function chooseSpellTarget(state, me, handIndex, card) {
  const targets = targetsForHandCard(state, me, handIndex);
  const creatureOf = (t) => state.players.flatMap((p) => p.board).find((c) => c.uid === t.uid);
  const opp = 1 - me;
  if (card.effect.type === 'damage') {
    const amount = card.effect.amount;
    if (state.players[opp].life <= amount) return { kind: 'player', player: opp };
    const kills = targets
      .filter((t) => t.kind === 'creature')
      .map((t) => ({ t, c: creatureOf(t) }))
      .filter(({ c }) => c.owner === opp && remainingHp(c) <= amount)
      .sort((a, b) => b.c.attack - a.c.attack);
    if (kills.length) return kills[0].t;
    return undefined; // 有効な使い道がなければ温存
  }
  if (card.effect.type === 'healAll') {
    const hurt = targets
      .map((t) => ({ t, c: creatureOf(t) }))
      .filter(({ c }) => c.damage >= 2)
      .sort((a, b) => b.c.damage - a.c.damage);
    return hurt.length ? hurt[0].t : undefined;
  }
  return targets[0];
}

function chooseAttackers(state, me) {
  const opp = state.players[1 - me];
  const blockers = opp.board.filter((c) => state.config.exhaustedCanBlock || !c.exhausted);
  const mine = state.players[me].board.filter((c) => canAttack(state, c));
  const totalPower = mine.reduce((s, c) => s + c.attack, 0);
  if (blockers.length === 0 || totalPower >= opp.life + sumTopAttack(blockers, mine)) return mine.map((c) => c.uid);
  // 一方的に倒される（相手が無傷で生き残り、自分だけ死ぬ）ブロッカーがいる場合は攻撃しない
  return mine
    .filter((a) => !blockers.some((b) => b.attack >= remainingHp(a) && a.attack < remainingHp(b)))
    .map((c) => c.uid);
}

function sumTopAttack(blockers, attackers) {
  // 粗い見積もり: ブロッカーの数だけ大きい攻撃が止められる
  return attackers.map((c) => c.attack).sort((a, b) => b - a).slice(0, blockers.length).reduce((s, x) => s + x, 0);
}

function chooseBlocks(state, me) {
  const atkBoard = state.players[state.activePlayer].board;
  const attackers = state.combat.attackers
    .map((uid) => atkBoard.find((c) => c.uid === uid))
    .filter(Boolean)
    .sort((a, b) => b.attack - a.attack);
  const available = state.players[me].board.filter((c) => canBlock(state, c));
  const blocks = [];
  let incoming = attackers.reduce((s, a) => s + a.attack, 0);
  const take = (b) => available.splice(available.indexOf(b), 1);

  for (const a of attackers) {
    // 生き残って倒せる → 生き残る → 相打ち（相手のほうが高コスト）の順で選ぶ
    const good = available.find((b) => b.attack >= remainingHp(a) && a.attack < remainingHp(b))
      ?? available.find((b) => a.attack < remainingHp(b))
      ?? available.find((b) => b.attack >= remainingHp(a) && getCard(a.cardId).cost >= getCard(b.cardId).cost);
    if (good) {
      blocks.push({ attacker: a.uid, blocker: good.uid });
      take(good);
      incoming -= a.attack;
    }
  }
  // 致死ダメージなら残りのクリーチャーでチャンプブロック
  for (const a of attackers) {
    if (incoming < state.players[me].life) break;
    if (blocks.some((x) => x.attacker === a.uid) || available.length === 0) continue;
    const chump = available.sort((x, y) => x.attack - y.attack)[0];
    blocks.push({ attacker: a.uid, blocker: chump.uid });
    take(chump);
    incoming -= a.attack;
  }
  return blocks;
}
