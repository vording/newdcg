// ゲーム進行ルール（UI非依存）。
//
// 使い方:
//   const state = createGame({ decks: [deckA, deckB], seed: 1 });
//   applyAction(state, { type: 'playCard', handIndex: 0 });
//
// state.awaiting は「次に誰が何を決める必要があるか」を表す。
//   { player, step: 'main' }  : 手番プレイヤーのメインフェイズ
//   { player, step: 'block' } : 防御側プレイヤーのブロック宣言
// 将来の「相手ターン中の対応（§9）」は step: 'response' として追加できる構造にしている。
//
// アクション:
//   { type: 'playCard', handIndex, target? }            メインフェイズ
//   { type: 'attack', attackers: [uid, ...] }           メインフェイズ → バトルフェイズへ
//   { type: 'endTurn' }                                 メインフェイズ（攻撃せず終了）
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

  startTurn(state, first);
  return state;
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
  log(state, 'turnEnd', { player: playerIndex });
  if (checkStateBased(state)) return;
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

/** 手札のカードが今プレイ可能か。不可なら理由を返す。 */
export function playability(state, playerIndex, handIndex) {
  const p = state.players[playerIndex];
  const cardId = p.hand[handIndex];
  if (cardId === undefined) return { ok: false, reason: '手札にそのカードがありません' };
  if (state.winner !== null) return { ok: false, reason: 'ゲームは終了しています' };
  const aw = state.awaiting;
  if (!aw || aw.player !== playerIndex || aw.step !== 'main') {
    return { ok: false, reason: '今はカードを使えません' };
  }
  const card = getCard(cardId);
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

export function targetsForHandCard(state, playerIndex, handIndex) {
  const card = getCard(state.players[playerIndex].hand[handIndex]);
  if (card.type !== 'spell') return [null];
  return legalTargets(state, playerIndex, card.effect);
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
    case 'playCard': return aw.step === 'main' ? playCard(state, playerIndex, action) : fail('今はカードを使えません');
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

  if (card.type === 'spell') {
    const targets = legalTargets(state, playerIndex, card.effect);
    if (!targets.some((t) => sameTarget(t, target))) return fail('その対象は選べません');
  }

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
      exhausted: false,
      summoningSick: true,
    };
    p.board.push(creature);
    log(state, 'summon', { player: playerIndex, uid: creature.uid, name: card.name });
    for (const t of card.triggers ?? []) {
      if (t.on === 'summon') resolveEffect(state, playerIndex, t.effect, null, creature.uid);
    }
  } else {
    log(state, 'castSpell', { player: playerIndex, name: card.name, target });
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
  for (const uid of attackers) board.find((x) => x.uid === uid).exhausted = true;
  state.combat = { attackers: [...attackers], blocks: {} };
  log(state, 'attack', { player: playerIndex, attackers: [...attackers] });

  // 4. バトルフェイズ: 防御側がブロッカーを選ぶ
  state.awaiting = { player: opponentOf(playerIndex), step: 'block' };
  return { ok: true };
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
  const atkBoard = state.players[atkPlayer].board;
  const defBoard = state.players[defPlayer].board;

  // 全ダメージを先に計算してから同時に適用する
  const pending = [];
  for (const uid of state.combat.attackers) {
    const a = atkBoard.find((x) => x.uid === uid);
    if (!a) continue; // 将来、対応カードで除去された場合
    const blockerUid = state.combat.blocks[uid];
    const b = blockerUid !== undefined ? defBoard.find((x) => x.uid === blockerUid) : null;
    if (b) {
      pending.push(() => dealDamageToCreature(state, b, a.attack, a.uid));
      pending.push(() => dealDamageToCreature(state, a, b.attack, b.uid));
    } else if (blockerUid === undefined) {
      pending.push(() => dealDamageToPlayer(state, defPlayer, a.attack, a.uid));
    }
    // ブロッカーが戦闘前に除去された場合は「ブロックされた」まま（プレイヤーへのダメージなし）
  }
  for (const fn of pending) fn();

  state.combat = null;
  if (checkStateBased(state)) return;
  // バトルフェイズ後はエンドフェイズへ（仕様書§5のとおり、第2メインフェイズはなし）
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
