// ブラウザUI。ゲームロジックは src/engine のみが持ち、ここは表示と入力の変換だけを行う。
import {
  applyAction, canAttack, canBlock, createGame, getCard, KEYWORDS, playability, sameTarget,
  targetsForHandCard, testDeck,
} from '../engine/index.js';
import { chooseAction } from '../ai/simple-ai.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

let game;
let mode = 'cpu';
let ui; // 画面上の一時的な選択状態

function resetUi() {
  ui = { attackers: new Set(), spellHand: null, blocker: null, blocks: new Map(), error: '' };
}

function newGame() {
  mode = $('#mode').value;
  game = createGame({
    decks: [testDeck(), testDeck()],
    seed: Date.now(),
    names: mode === 'cpu' ? ['あなた', 'CPU'] : ['プレイヤー1', 'プレイヤー2'],
  });
  resetUi();
  render();
}

/** 画面の手前側に表示するプレイヤー */
function viewer() {
  if (mode === 'cpu') return 0;
  return game.awaiting?.player ?? game.activePlayer;
}

function isHumanTurn() {
  return game.awaiting && (mode === 'hotseat' || game.awaiting.player === 0);
}

function act(action) {
  const res = applyAction(game, game.awaiting.player, action);
  resetUi();
  if (!res.ok) ui.error = res.error;
  render();
}

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

function render() {
  const me = viewer();
  const opp = 1 - me;
  const table = $('#table');
  table.textContent = '';

  if (game.winner !== null) {
    const msg = game.winner === 'draw' ? '引き分け' : `${game.players[game.winner].name} の勝利！`;
    table.append(el('div', 'banner', msg));
  } else {
    table.append(renderPrompt(me));
  }

  table.append(renderSide(opp, false));
  table.append(renderSide(me, true));
  renderLog();
  scheduleCpu();
}

function renderPrompt(me) {
  const box = el('div', 'prompt');
  const msg = el('div', 'msg');
  box.append(msg);
  const aw = game.awaiting;
  if (!isHumanTurn()) {
    msg.textContent = `${game.players[aw.player].name} が考えています…`;
    return box;
  }
  const name = game.players[aw.player].name;
  if (aw.step === 'main') {
    if (ui.spellHand !== null) {
      msg.textContent = `${getCard(game.players[me].hand[ui.spellHand]).name} の対象を選んでください（オレンジ枠）`;
      box.append(button('キャンセル', () => { ui.spellHand = null; render(); }));
    } else {
      msg.textContent = `${name} のメインフェイズ：手札（緑枠）をクリックで使用。攻撃するクリーチャーをクリックで選択してから「攻撃」。`;
      const atk = button(`攻撃（${ui.attackers.size}体）`, () => act({ type: 'attack', attackers: [...ui.attackers] }), 'primary');
      atk.disabled = ui.attackers.size === 0;
      box.append(atk, button('ターン終了', () => act({ type: 'endTurn' })));
    }
  } else if (aw.step === 'block') {
    msg.textContent = ui.blocker === null
      ? `${name} のブロック宣言：ブロックに使う自分のクリーチャーを選び、次に止めたい攻撃クリーチャー（赤枠）を選んでください。`
      : 'ブロックする攻撃クリーチャー（オレンジ枠）を選んでください。';
    const blocks = [...ui.blocks].map(([attacker, blocker]) => ({ attacker, blocker }));
    box.append(
      button(blocks.length ? `ブロック確定（${blocks.length}）` : 'ブロックしない', () => act({ type: 'declareBlocks', blocks }), 'primary'),
      button('選び直す', () => { ui.blocks.clear(); ui.blocker = null; render(); }),
    );
  }
  if (ui.error) box.append(el('div', 'error', ui.error));
  return box;
}

function button(label, onClick, cls) {
  const b = el('button', cls, label);
  b.addEventListener('click', onClick);
  return b;
}

function renderSide(pi, isFront) {
  const p = game.players[pi];
  const side = el('div', `side${game.activePlayer === pi ? ' active' : ''}`);

  const status = el('div', 'status');
  const life = el('span', 'life', `♥ ${p.life}`);
  const playerTarget = { kind: 'player', player: pi };
  if (isTargetable(playerTarget)) {
    life.classList.add('targetable');
    life.addEventListener('click', () => castSpellAt(playerTarget));
  }
  const mana = el('span', 'mana');
  for (let i = 0; i < game.config.maxMana; i++) {
    const full = i < p.mana;
    const exists = i < p.maxMana;
    if (!exists) continue;
    mana.append(el('span', full ? 'full' : 'empty', full ? '◆' : '◇'));
  }
  mana.append(` ${p.mana}/${p.maxMana}`);
  status.append(
    el('strong', '', p.name + (game.activePlayer === pi ? '（手番）' : '')),
    life, mana,
    el('span', '', `デッキ ${p.deck.length}`),
    el('span', '', `手札 ${p.hand.length}`),
    el('span', '', `墓地 ${p.graveyard.length}`),
  );

  const board = el('div', 'row');
  for (const c of p.board) board.append(renderCreature(c));

  const hand = el('div', 'hand');
  const handRow = el('div', 'row');
  const showHand = isFront && (mode === 'hotseat' || pi === 0);
  p.hand.forEach((id, i) => handRow.append(showHand ? renderHandCard(pi, id, i) : el('div', 'card back')));
  hand.append(handRow);

  if (isFront) side.append(board, status, hand);
  else side.append(hand, status, board);
  return side;
}

function cardBody(card, node) {
  node.append(el('div', 'cost', String(card.cost)), el('div', 'name', card.name));
  const texts = (card.keywords ?? []).map((k) => KEYWORDS[k].name);
  if (card.text) texts.push(card.text);
  if (texts.length) node.append(el('div', 'text', texts.join(' ')));
}

function renderHandCard(pi, cardId, handIndex) {
  const card = getCard(cardId);
  const node = el('div', 'card');
  cardBody(card, node);
  if (card.type === 'creature') {
    const stats = el('div', 'stats');
    stats.append(el('span', 'atk', `⚔${card.attack}`), el('span', 'hp', `♥${card.hp}`));
    node.append(stats);
  } else {
    node.append(el('div', 'badges', 'スペル'));
  }
  const check = playability(game, pi, handIndex);
  if (isHumanTurn() && check.ok && ui.spellHand === null) {
    node.classList.add('playable');
    node.addEventListener('click', () => {
      if (card.type === 'spell') { ui.spellHand = handIndex; ui.attackers.clear(); render(); }
      else act({ type: 'playCard', handIndex });
    });
  } else {
    node.classList.add('unplayable');
    if (!check.ok) node.title = check.reason;
  }
  if (ui.spellHand === handIndex) node.classList.add('selected');
  return node;
}

function renderCreature(c) {
  const card = getCard(c.cardId);
  const node = el('div', 'card');
  cardBody(card, node);
  const left = c.hp - c.damage;
  const stats = el('div', 'stats');
  stats.append(el('span', 'atk', `⚔${c.attack}`), el('span', `hp${c.damage ? ' damaged' : ''}`, `♥${left}/${c.hp}`));
  const bar = el('div', 'hpbar');
  const fill = el('div', left / c.hp <= 0.34 ? 'low' : '');
  fill.style.width = `${(left / c.hp) * 100}%`;
  bar.append(fill);
  node.append(stats, bar);
  node.append(el('div', 'dmg', c.damage ? `蓄積ダメージ ${c.damage}` : ''));
  const badges = [];
  if (c.exhausted) badges.push('行動済み');
  if (c.summoningSick && c.owner === game.activePlayer && !card.keywords?.includes('haste')) badges.push('召喚酔い');
  node.append(el('div', 'badges', badges.join(' / ')));
  if (c.exhausted) node.classList.add('exhausted');

  const aw = game.awaiting;
  const target = { kind: 'creature', uid: c.uid };
  if (game.combat?.attackers.includes(c.uid)) {
    node.classList.add('attacking');
    const blockedBy = ui.blocks.get(c.uid);
    if (blockedBy !== undefined) node.append(el('div', 'blocklink', `← ${nameOf(blockedBy)} がブロック`));
  }

  if (!isHumanTurn()) return node;

  if (isTargetable(target)) {
    node.classList.add('targetable');
    node.addEventListener('click', () => castSpellAt(target));
  } else if (aw.step === 'main' && ui.spellHand === null && c.owner === aw.player && canAttack(game, c)) {
    node.classList.add('selectable');
    if (ui.attackers.has(c.uid)) node.classList.add('selected');
    node.addEventListener('click', () => {
      ui.attackers.has(c.uid) ? ui.attackers.delete(c.uid) : ui.attackers.add(c.uid);
      ui.error = '';
      render();
    });
  } else if (aw.step === 'block') {
    const assigned = [...ui.blocks.values()].includes(c.uid);
    if (c.owner === aw.player && canBlock(game, c) && !assigned) {
      node.classList.add('selectable');
      if (ui.blocker === c.uid) node.classList.add('selected');
      node.addEventListener('click', () => { ui.blocker = ui.blocker === c.uid ? null : c.uid; render(); });
    } else if (ui.blocker !== null && game.combat.attackers.includes(c.uid) && !ui.blocks.has(c.uid)) {
      node.classList.add('targetable');
      node.addEventListener('click', () => { ui.blocks.set(c.uid, ui.blocker); ui.blocker = null; render(); });
    }
  }
  return node;
}

function nameOf(uid) {
  return game.players.flatMap((p) => p.board).find((c) => c.uid === uid)?.name ?? '?';
}

function isTargetable(target) {
  if (ui.spellHand === null || !isHumanTurn()) return false;
  return targetsForHandCard(game, game.awaiting.player, ui.spellHand).some((t) => sameTarget(t, target));
}

function castSpellAt(target) {
  act({ type: 'playCard', handIndex: ui.spellHand, target });
}

// ---------------------------------------------------------------------------
// ログとCPU
// ---------------------------------------------------------------------------

function describe(e) {
  const pn = (i) => game.players[i].name;
  switch (e.type) {
    case 'gameStart': return `ゲーム開始。先攻は ${pn(e.firstPlayer)}`;
    case 'turnStart': return `―― ${pn(e.player)} のターン（${e.turnOfPlayer}ターン目） ――`;
    case 'summon': return `${pn(e.player)} が ${e.name} を召喚`;
    case 'castSpell': return `${pn(e.player)} が ${e.name} を使用`;
    case 'attack': return `${pn(e.player)} が ${e.attackers.length}体で攻撃`;
    case 'blocks': return e.blocks.length ? `${pn(e.player)} が ${e.blocks.length}体でブロック` : `${pn(e.player)} はブロックしない`;
    case 'damage': return `${pn(e.owner)}の ${e.targetName} に ${e.amount} ダメージ`;
    case 'playerDamage': return `${pn(e.player)} に ${e.amount} ダメージ`;
    case 'heal': return `${pn(e.owner)}の ${e.targetName} のダメージを ${e.amount} 回復`;
    case 'destroyed': return `${pn(e.owner)}の ${e.name} は破壊された`;
    case 'deckOut': return `${pn(e.player)} はデッキ切れでドローできない`;
    case 'gameOver': return e.winner === 'draw' ? '引き分け' : `${pn(e.winner)} の勝利`;
    default: return null;
  }
}

function renderLog() {
  const ol = $('#log');
  ol.textContent = '';
  for (const e of game.log) {
    const text = describe(e);
    if (text) ol.append(el('li', '', text));
  }
  ol.parentElement.scrollTop = ol.parentElement.scrollHeight;
}

let cpuTimer = null;
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (mode !== 'cpu' || !game.awaiting || game.awaiting.player !== 1) return;
  cpuTimer = setTimeout(() => {
    applyAction(game, 1, chooseAction(game));
    render();
  }, 600);
}

$('#newGame').addEventListener('click', newGame);
newGame();
