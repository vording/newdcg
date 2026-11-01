// ゲーム進行ルール（UI非依存）。
//
// 使い方:
//   const state = createGame({ decks: [deckA, deckB], seed: 1 });
//   applyAction(state, { type: 'playCard', handIndex: 0 });
//
// state.awaiting は「次に誰が何を決める必要があるか」を表す。
//   { player, step: 'mulligan' } : ゲーム開始時の手札引き直し（先攻→後攻の順）
//   { player, step: 'main' }     : 手番プレイヤーのメインフェイズ
//   { player, step: 'response' } : 攻撃宣言後、防御側が瞬発カードを使えるタイミング
//   { player, step: 'block' }    : 防御側プレイヤーのブロック宣言
//
// アクション:
//   { type: 'mulligan', handIndices: [i, ...] }         引き直すカード（空配列 = そのまま）
//   { type: 'playCard', handIndex, target? }            メインフェイズ／瞬発（瞬発カードのみ）
//   { type: 'attack', attackers: [uid, ...] }           メインフェイズ → バトルフェイズへ
//   { type: 'endTurn' }                                 メインフェイズ（攻撃せず終了）
//   { type: 'pass' }                                    瞬発しない
//   { type: 'declareBlocks', blocks: [{attacker, blocker}] }  ブロック宣言（空配列 = ブロックなし）

import { getCard, hasKeyword, validateDeck } from './cards.js';
import { makeConfig } from './config.js';
import { legalTargets, resolveEffect, sameTarget } from './effects.js';
import {
  dealDamageToCreature, dealDamageToPlayer, drawCards, log, nextRandom, opponentOf, shuffle,
} from './state.js';

export function createGame({ decks, seed = Date.now(), firstPlayer = null, config = {}, names } = {}) {
  const cfg = makeConfig(config);
  if (!decks || decks.length !== 2) throw new Error('decks must be an array of 2 decks');
  decks.forEach((d, i) => {
    const errors = validateDeck(d, cfg);
    if (errors.length) throw new Error(`Player ${i + 1} deck invalid: ${errors.join(' / ')}`);
  });

  const state = {
    config: cfg,
    rngState: seed >>> 0,
    turn: 0,
    activePlayer: 0,
    firstPlayer: 0,
    nextUid: 1,
    players: decks.map((deck, i) => ({
      index: i,
      name: names?.[i] ?? `プレイヤー${i + 1}`,
      life: cfg.startingLife,
      maxMana: 0,
      mana: 0,
      deck: [...deck],
      hand: [],
      board: [],
      graveyard: [],
      turnsTaken: 0,
      deckedOut: false,
      fatigue: 0,
      mulliganDone: false,
    })),
    awaiting: null,
    combat: null,
    winner: null, // 0 | 1 | 'draw' | null
    log: [],
  };

  const first = firstPlayer ?? (nextRandom(state) < 0.5 ? 0 : 1);
  state.firstPlayer = first;
  for (const p of state.players) shuffle(state, p.deck);
  drawCards(state, first, cfg.openingHandFirst);
  drawCards(state, opponentOf(first), cfg.openingHandSecond);
  log(state, 'gameStart', { firstPlayer: first });

  if (cfg.mulligan) state.awaiting = { player: first, step: 'mulligan' };
  else beginFirstTurn(state);
  return state;
}

function beginFirstTurn(state) {
  const bonus = state.config.secondPlayerBonusCard;
  if (bonus) {
    const second = opponentOf(state.firstPlayer);
    state.players[second].hand.push(bonus);
    log(state, 'bonusCard', { player: second, cardId: bonus });
  }
  startTurn(state, state.firstPlayer);
}

function mulligan(state, playerIndex, { handIndices = [] }) {
  const p = state.players[playerIndex];
  const idx = [...new Set(handIndices)];
  if (idx.length !== handIndices.length) return fail('同じカードが重複しています');
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= p.hand.length)) return fail('手札にないカードです');
  const returned = idx.sort((a, b) => b - a).map((i) => p.hand.splice(i, 1)[0]);
  p.deck.push(...returned);
  shuffle(state, p.deck);
  // 手札上限の影響を受けないよう直接引く
  p.hand.push(...p.deck.splice(0, returned.length));
  p.mulliganDone = true;
  log(state, 'mulligan', { player: playerIndex, count: returned.length });

  const other = opponentOf(playerIndex);
  if (!state.players[other].mulliganDone) state.awaiting = { player: other, step: 'mulligan' };
  else beginFirstTurn(state);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// ターン進行
// ---------------------------------------------------------------------------

function startTurn(state, playerIndex) {
  const p = state.players[playerIndex];
  state.turn += 1;
  state.activePlayer = playerIndex;
  p.turnsTaken += 1;
  log(state, 'turnStart', { player: playerIndex, turnOfPlayer: p.turnsTaken });

  // 1. 開始フェイズ: 最大マナ+1、マナ全回復、クリーチャーのリフレッシュ、開始時効果
  p.maxMana = Math.min(p.maxMana + 1, state.config.maxMana);
  p.mana = p.maxMana;
  for (const c of p.board) {
    c.exhausted = false;
    c.summoningSick = false;
  }
  runTriggers(state, playerIndex, 'turnStart');
  if (checkStateBased(state)) return;

  // 2. ドローフェイズ
  const isFirstPlayersFirstTurn = playerIndex === state.firstPlayer && p.turnsTaken === 1;
  if (!isFirstPlayersFirstTurn || state.config.firstPlayerDrawsOnFirstTurn) {
    drawCards(state, playerIndex, state.config.drawPerTurn);
  }
  if (checkStateBased(state)) return;

  // 3. メインフェイズ
  state.awaiting = { player: playerIndex, step: 'main' };
}

function endTurn(state) {
  const playerIndex = state.activePlayer;
  // 5. エンドフェイズ
  runTriggers(state, playerIndex, 'turnEnd');
  if (checkStateBased(state)) return;
  for (const p of state.players) {
    for (const c of p.board) {
      // 「ターン終了時まで」の修整を戻す
      c.attack -= c.tempAttack; c.hp -= c.tempHp;
      c.tempAttack = 0; c.tempHp = 0;
      if (state.config.damageResetsAtTurnEnd) c.damage = 0;
    }
  }
  if (checkStateBased(state)) return;
  log(state, 'turnEnd', { player: playerIndex });
  startTurn(state, opponentOf(playerIndex));
}

function runTriggers(state, playerIndex, on) {
  // 発動時点の盤面のコピーで回す（処理中に破壊されても安全）
  for (const c of [...state.players[playerIndex].board]) {
    for (const t of getCard(c.cardId).triggers ?? []) {
      if (t.on !== on) continue;
      resolveEffect(state, playerIndex, t.effect, null, c.uid);
    }
  }
}

// ---------------------------------------------------------------------------
// 状態起因処理: 破壊判定と勝敗判定。ゲームが終了したら true を返す。
// ---------------------------------------------------------------------------

export function checkStateBased(state) {
  for (const p of state.players) {
    const dead = p.board.filter((c) => c.damage >= c.hp);
    if (dead.length) {
      p.board = p.board.filter((c) => c.damage < c.hp);
      for (const c of dead) {
        p.graveyard.push(c.cardId);
        log(state, 'destroyed', { uid: c.uid, name: c.name, owner: p.index });
      }
    }
  }
  const lost = state.players.map((p) => p.life <= 0 || p.deckedOut);
  if (lost[0] || lost[1]) {
    state.winner = lost[0] && lost[1] ? 'draw' : lost[0] ? 1 : 0;
    state.awaiting = null;
    state.combat = null;
    log(state, 'gameOver', { winner: state.winner });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 判定ヘルパー（UI・AIから利用）
// ---------------------------------------------------------------------------

export function canAttack(state, creature) {
  return creature.owner === state.activePlayer
    && !creature.exhausted
    && (!creature.summoningSick || hasKeyword(getCard(creature.cardId), 'haste'));
}

export function canBlock(state, creature) {
  return creature.owner !== state.activePlayer
    && (state.config.exhaustedCanBlock || !creature.exhausted);
}

/** blocker が attacker をブロックできるか（天翔は天翔でしかブロックできない） */
export function canBlockAttacker(state, blocker, attacker) {
  if (!canBlock(state, blocker)) return false;
  if (hasKeyword(getCard(attacker.cardId), 'flying') && !hasKeyword(getCard(blocker.cardId), 'flying')) return false;
  return true;
}

/** 手札のカードが今プレイ可能か。不可なら理由を返す。 */
export function playability(state, playerIndex, handIndex) {
  const p = state.players[playerIndex];
  const cardId = p.hand[handIndex];
  if (cardId === undefined) return { ok: false, reason: '手札にそのカードがありません' };
  if (state.winner !== null) return { ok: false, reason: 'ゲームは終了しています' };
  const aw = state.awaiting;
  if (!aw || aw.player !== playerIndex || (aw.step !== 'main' && aw.step !== 'response')) {
    return { ok: false, reason: '今はカードを使えません' };
  }
  const card = getCard(cardId);
  if (aw.step === 'response' && !hasKeyword(card, 'quick')) {
    return { ok: false, reason: '相手のターン中は「瞬発」カードしか使えません' };
  }
  if (card.cost > p.mana) return { ok: false, reason: 'マナが足りません' };
  if (card.type === 'creature' && p.board.length >= state.config.boardLimit) {
    return { ok: false, reason: `場のクリーチャーが上限（${state.config.boardLimit}体）です` };
  }
  if (card.type === 'spell') {
    const targets = legalTargets(state, playerIndex, card.effect);
    if (targets.length === 0) return { ok: false, reason: '対象がいません' };
  }
  return { ok: true };
}

/**
 * 手札のカードを使うときに選べる対象。[null] は「対象なし」。
 * クリーチャーの召喚時効果は、対象がいなければ対象なしで召喚できる（効果は不発）。
 */
export function targetsForHandCard(state, playerIndex, handIndex) {
  const card = getCard(state.players[playerIndex].hand[handIndex]);
  if (!card.effect) return [null];
  const targets = legalTargets(state, playerIndex, card.effect);
  if (card.type === 'creature' && targets.length === 0) return [null];
  return targets;
}

// ---------------------------------------------------------------------------
// アクション適用
// ---------------------------------------------------------------------------

/**
 * @param {number} playerIndex アクションを行うプレイヤー
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function applyAction(state, playerIndex, action) {
  if (state.winner !== null) return fail('ゲームは終了しています');
  const aw = state.awaiting;
  if (!aw || aw.player !== playerIndex) return fail('あなたの手番ではありません');

  switch (action?.type) {
    case 'mulligan': return aw.step === 'mulligan' ? mulligan(state, playerIndex, action) : fail('今は引き直しできません');
    case 'playCard':
      if (aw.step === 'main') return playCard(state, playerIndex, action);
      if (aw.step === 'response') return respond(state, playerIndex, action);
      return fail('今はカードを使えません');
    case 'pass':
      if (aw.step !== 'response') return fail('今はパスできません');
      log(state, 'pass', { player: playerIndex });
      proceedToBlock(state);
      return { ok: true };
    case 'attack': return aw.step === 'main' ? declareAttack(state, playerIndex, action) : fail('今は攻撃できません');
    case 'endTurn':
      if (aw.step !== 'main') return fail('今はターンを終了できません');
      endTurn(state);
      return { ok: true };
    case 'declareBlocks': return aw.step === 'block' ? declareBlocks(state, playerIndex, action) : fail('今はブロックできません');
    default: return fail(`不明なアクション: ${action?.type}`);
  }
}

function fail(error) {
  return { ok: false, error };
}

function playCard(state, playerIndex, { handIndex, target = null }) {
  const check = playability(state, playerIndex, handIndex);
  if (!check.ok) return fail(check.reason);
  const p = state.players[playerIndex];
  const cardId = p.hand[handIndex];
  const card = getCard(cardId);

  const targets = targetsForHandCard(state, playerIndex, handIndex);
  if (!targets.some((t) => sameTarget(t, target))) return fail('その対象は選べません');

  p.mana -= card.cost;
  p.hand.splice(handIndex, 1);

  if (card.type === 'creature') {
    const creature = {
      uid: state.nextUid++,
      cardId,
      owner: playerIndex,
      name: card.name,
      attack: card.attack,
      hp: card.hp,
      damage: 0,
      tempAttack: 0,
      tempHp: 0,
      exhausted: false,
      summoningSick: true,
    };
    p.board.push(creature);
    log(state, 'summon', { player: playerIndex, uid: creature.uid, name: card.name });
    if (card.effect && target) resolveEffect(state, playerIndex, card.effect, target, creature.uid);
    for (const t of card.triggers ?? []) {
      if (t.on === 'summon') resolveEffect(state, playerIndex, t.effect, null, creature.uid);
    }
  } else {
    log(state, 'castSpell', { player: playerIndex, name: card.name, target, response: state.awaiting.step === 'response' });
    resolveEffect(state, playerIndex, card.effect, target, cardId);
    p.graveyard.push(cardId);
  }
  checkStateBased(state);
  return { ok: true };
}

function declareAttack(state, playerIndex, { attackers }) {
  if (!Array.isArray(attackers) || attackers.length === 0) return fail('攻撃するクリーチャーを選んでください');
  if (new Set(attackers).size !== attackers.length) return fail('同じクリーチャーが重複しています');
  const board = state.players[playerIndex].board;
  for (const uid of attackers) {
    const c = board.find((x) => x.uid === uid);
    if (!c) return fail('自分のクリーチャーではありません');
    if (!canAttack(state, c)) return fail(`${c.name} は攻撃できません`);
  }
  for (const uid of attackers) {
    const c = board.find((x) => x.uid === uid);
    if (!hasKeyword(getCard(c.cardId), 'vigilance')) c.exhausted = true; // 隠蔽は行動済みにならない
  }
  state.combat = { attackers: [...attackers], blocks: {} };
  log(state, 'attack', { player: playerIndex, attackers: [...attackers] });

  // 4. バトルフェイズ: 防御側に瞬発の機会 → ブロック宣言
  const defender = opponentOf(playerIndex);
  if (hasResponse(state, defender)) state.awaiting = { player: defender, step: 'response' };
  else proceedToBlock(state);
  return { ok: true };
}

/** 防御側が今使える瞬発カードを持っているか（持っていなければ確認を出さない） */
export function hasResponse(state, playerIndex) {
  const saved = state.awaiting;
  state.awaiting = { player: playerIndex, step: 'response' };
  const any = state.players[playerIndex].hand.some((_, i) => playability(state, playerIndex, i).ok);
  state.awaiting = saved;
  return any;
}

/** 瞬発カードを1枚使う。再瞬発はなく、解決後はブロック宣言へ進む。 */
function respond(state, playerIndex, action) {
  const res = playCard(state, playerIndex, action);
  if (!res.ok) return res;
  if (state.winner === null) proceedToBlock(state);
  return res;
}

function proceedToBlock(state) {
  // 瞬発で除去された攻撃クリーチャーは戦闘から外れる
  const atkBoard = state.players[state.activePlayer].board;
  state.combat.attackers = state.combat.attackers.filter((uid) => atkBoard.some((c) => c.uid === uid));
  if (state.combat.attackers.length === 0) {
    log(state, 'combatCancelled', {});
    state.combat = null;
    endTurn(state);
    return;
  }
  state.awaiting = { player: opponentOf(state.activePlayer), step: 'block' };
}

function declareBlocks(state, playerIndex, { blocks = [] }) {
  const combat = state.combat;
  const defBoard = state.players[playerIndex].board;
  const usedBlockers = new Set();
  const blockedAttackers = new Set();
  for (const { attacker, blocker } of blocks) {
    if (!combat.attackers.includes(attacker)) return fail('攻撃していないクリーチャーはブロックできません');
    const b = defBoard.find((x) => x.uid === blocker);
    if (!b) return fail('自分のクリーチャーではありません');
    if (!canBlock(state, b)) return fail(`${b.name} はブロックできません`);
    const atk = state.players[state.activePlayer].board.find((x) => x.uid === attacker);
    if (!canBlockAttacker(state, b, atk)) return fail(`${atk.name} は天翔を持つため、天翔でしかブロックできません`);
    if (usedBlockers.has(blocker)) return fail('1体のクリーチャーは1回しかブロックできません');
    if (blockedAttackers.has(attacker)) return fail('1体の攻撃に対するブロッカーは1体までです');
    usedBlockers.add(blocker);
    blockedAttackers.add(attacker);
  }

  for (const { attacker, blocker } of blocks) {
    combat.blocks[attacker] = blocker;
    if (state.config.blockerExhaustsOnBlock) {
      defBoard.find((x) => x.uid === blocker).exhausted = true;
      log(state, 'blockerExhausted', { uid: blocker });
    }
  }
  log(state, 'blocks', { player: playerIndex, blocks: blocks.map((b) => ({ ...b })) });

  resolveCombat(state);
  return { ok: true };
}

function resolveCombat(state) {
  const atkPlayer = state.activePlayer;
  const defPlayer = opponentOf(atkPlayer);
  const onBoard = (pi, uid) => state.players[pi].board.find((x) => x.uid === uid) ?? null;
  const firstStrike = (c) => hasKeyword(getCard(c.cardId), 'firstStrike');
  const pairs = state.combat.attackers.map((uid) => ({ a: uid, b: state.combat.blocks[uid] }));

  // 先制攻撃を持つクリーチャーが先にダメージを与え、その後に残りが与える。各段階の中では同時。
  for (const isFirst of [true, false]) {
    const pending = [];
    for (const { a: aUid, b: bUid } of pairs) {
      const a = onBoard(atkPlayer, aUid);
      if (!a) continue; // 除去された攻撃クリーチャー
      if (bUid === undefined) {
        if (firstStrike(a) === isFirst) pending.push(() => dealDamageToPlayer(state, defPlayer, a.attack, a.uid));
        continue;
      }
      const b = onBoard(defPlayer, bUid);
      if (!b) continue; // ブロッカーが除去されても「ブロックされた」まま
      if (firstStrike(a) === isFirst) pending.push(() => dealDamageToCreature(state, b, a.attack, a.uid));
      if (firstStrike(b) === isFirst) pending.push(() => dealDamageToCreature(state, a, b.attack, b.uid));
    }
    for (const fn of pending) fn();
    if (checkStateBased(state)) return;
  }

  state.combat = null;
  // バトルフェイズ後はエンドフェイズへ（第2メインフェイズはなし）
  endTurn(state);
}

/** 公開情報のみを含むビュー（対戦相手の手札・デッキ順を隠す）。UI・AI用。 */
export function viewFor(state, playerIndex) {
  return {
    ...state,
    rngState: undefined,
    players: state.players.map((p, i) => ({
      ...p,
      deck: undefined,
      deckCount: p.deck.length,
      hand: i === playerIndex ? [...p.hand] : undefined,
      handCount: p.hand.length,
    })),
  };
}
