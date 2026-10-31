// ブラウザUI（ゲーム名は未定）。ゲームロジックは src/engine のみが持ち、ここは表示と入力の変換だけを行う。
import {
  applyAction, canAttack, canBlock, canBlockAttacker, createGame, DECKS, deckList, getCard, hasKeyword,
  KEYWORDS, playability, sameTarget, targetsForHandCard,
} from '../engine/index.js';
import { chooseAction } from '../ai/simple-ai.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

// カードの絵の代わりに表示する一文字
const GLYPH = {
  c_apprentice: '剣', c_scout: '斥', c_shield: '盾', c_wolf: '狼', c_messenger: '鳥', c_warrior: '槌',
  c_rider: '騎', c_pikeman: '槍', c_hawk: '鷹', c_salamander: '蜥', c_golem: '岩', c_knight: '犬',
  c_general: '将', c_dragon: '竜', s_arrow: '矢', s_might: '力', s_rally: '鬨', s_fireball: '炎',
  s_insight: '泉', s_wave: '波', s_coin: '雫', s_mend: '癒',
};
const DECK_TYPE = { swift: '速攻型', fortress: '防御型', balance: '標準型' };

let game = null;
let mode = 'cpu';
let level = 'easy';
let deckNames = ['', ''];
let ui;
let seenLog = 0;
let feed = [];
let fresh = new Set();

function resetUi() {
  ui = { attackers: new Set(), targeting: null, blocker: null, blocks: new Map(), mulligan: new Set(), error: '' };
}

// ---------------------------------------------------------------------------
// タイトル画面
// ---------------------------------------------------------------------------

function buildTitle() {
  const box = $('#deckChoices');
  const choices = [...Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name.replace(/（.*）/, ''), type: DECK_TYPE[id] ?? '', text: d.text })),
    { id: 'random', name: 'おまかせ', type: 'ランダム', text: '3つのデッキからランダムに選ぶ。' }];
  choices.forEach((c, i) => {
    const label = el('label', 'deck-choice');
    const input = el('input');
    input.type = 'radio'; input.name = 'deck'; input.value = c.id; input.id = `deck-${c.id}`;
    if (i === 0) input.checked = true;
    const face = el('span', 'face');
    face.append(el('span', 'dtype', c.type), el('span', 'dname', c.name), el('span', 'dtext', c.text));
    label.append(input, face);
    box.append(label);
  });
  $('#setup').addEventListener('submit', (e) => { e.preventDefault(); startGame(); });
}

function showTitle() {
  clearTimeout(cpuTimer);
  $('#overlay').hidden = true;
  $('#logPanel').hidden = true;
  $('#game').hidden = true;
  $('#title').hidden = false;
}

function pickDeck(value) {
  const ids = Object.keys(DECKS);
  return value === 'random' ? ids[Math.floor(Math.random() * ids.length)] : value;
}

function startGame() {
  const form = new FormData($('#setup'));
  mode = form.get('mode');
  level = form.get('level');
  const mine = pickDeck(form.get('deck'));
  const theirs = pickDeck('random');
  deckNames = [DECKS[mine].name, DECKS[theirs].name];
  game = createGame({
    decks: [deckList(mine), deckList(theirs)],
    seed: Date.now(),
    names: mode === 'cpu' ? ['あなた', 'CPU'] : ['プレイヤー1', 'プレイヤー2'],
  });
  seenLog = 0; feed = []; fresh = new Set();
  resetUi();
  $('#title').hidden = true;
  $('#game').hidden = false;
  $('#overlay').hidden = true;
  render();
}

// ---------------------------------------------------------------------------
// 対戦画面
// ---------------------------------------------------------------------------

function viewer() {
  if (mode === 'cpu') return 0;
  return game.awaiting?.player ?? game.activePlayer;
}
function isHumanTurn() {
  return game.awaiting && (mode === 'hotseat' || game.awaiting.player === 0);
}
function nm(i) {
  return mode === 'cpu' ? (i === 0 ? 'あなた' : 'CPU') : game.players[i].name;
}
function act(action) {
  const res = applyAction(game, game.awaiting.player, action);
  resetUi();
  if (!res.ok) ui.error = res.error;
  render();
}
function creatureByUid(uid) {
  return game.players.flatMap((p) => p.board).find((c) => c.uid === uid);
}

function render() {
  updateFeed();
  const me = viewer();
  const opp = 1 - me;
  const table = $('#table');
  table.textContent = '';
  table.append(
    renderSeat(opp, false),
    renderOppHand(opp),
    renderBattlefield(me, opp),
    renderCommand(me),
    renderHand(me),
    renderSeat(me, true),
  );
  $('#turnInfo').textContent = game.turn > 0 ? `ターン ${Math.ceil(game.turn / 2)}・${nm(game.activePlayer)}の番` : '準備中';
  renderLog();
  renderOverlay();
  scheduleCpu();
}

function updateFeed() {
  if (!isHumanTurn() && game.winner === null) return;
  const entries = game.log.slice(seenLog);
  if (entries.length === 0) return;
  seenLog = game.log.length;
  feed = entries.map(describe).filter(Boolean).filter((t) => !t.startsWith('――')).slice(-5);
  fresh = new Set(entries.filter((e) => e.type === 'damage' || e.type === 'summon' || e.type === 'buff').map((e) => e.target ?? e.uid));
}

function renderSeat(pi, isFront) {
  const p = game.players[pi];
  const seat = el('div', `seat ${isFront ? 'mine' : 'theirs'}`);
  const who = el('div', 'who', nm(pi));
  if (game.activePlayer === pi && game.turn > 0 && game.winner === null) who.append(el('span', 'turn-badge', '手番'));

  const life = el('div', `life${p.life <= 5 ? ' low' : ''}`, String(Math.max(p.life, 0)));
  life.append(el('small', '', 'ライフ'));
  life.setAttribute('aria-label', `${nm(pi)}のライフ ${p.life}`);
  const target = { kind: 'player', player: pi };
  if (isTargetable(target)) {
    life.classList.add('targetable');
    life.tabIndex = 0;
    life.addEventListener('click', () => playAt(target));
  }

  const mana = el('div', 'mana');
  mana.setAttribute('aria-label', `マナ ${p.mana}/${p.maxMana}`);
  const pips = Math.max(p.maxMana, p.mana);
  for (let i = 0; i < pips; i++) mana.append(el('span', `pip${i < p.mana ? (i >= p.maxMana ? ' extra' : ' full') : ''}`));
  mana.append(el('span', 'mana-num', `${p.mana}/${p.maxMana}`));

  const piles = el('div', 'piles', `山札 ${p.deck.length}　手札 ${p.hand.length}　捨て札 ${p.graveyard.length}`);
  seat.append(life, who, mana, piles);
  return seat;
}

function renderOppHand(pi) {
  const row = el('div', 'opp-hand');
  row.setAttribute('aria-label', `${nm(pi)}の手札 ${game.players[pi].hand.length}枚`);
  if (mode === 'hotseat') return row;
  for (let i = 0; i < game.players[pi].hand.length; i++) row.append(el('div', 'card back'));
  return row;
}

function renderBattlefield(me, opp) {
  const bf = el('div', 'battlefield');
  const lane = (pi, cls) => {
    const l = el('div', `lane ${cls}`);
    const board = game.players[pi].board;
    if (board.length === 0) l.append(el('div', 'empty', `${nm(pi)}の場にクリーチャーはいない`));
    for (const c of board) l.append(renderCreature(c));
    return l;
  };
  bf.append(lane(opp, 'theirs'), el('div', 'midline'), lane(me, 'mine'));
  return bf;
}

function renderHand(pi) {
  const row = el('div', 'hand');
  const p = game.players[pi];
  const show = mode === 'hotseat' || pi === 0;
  p.hand.forEach((id, i) => row.append(show ? renderHandCard(pi, id, i) : el('div', 'card back')));
  return row;
}

// --- カード ---

function cardFace(card, node) {
  node.append(el('div', 'cost', String(card.cost)));
  const kind = card.token ? 't-token' : card.type === 'creature' ? 't-creature' : hasKeyword(card, 'quick') ? 't-quick' : 't-spell';
  node.append(el('div', `art ${kind}`, GLYPH[card.id] ?? card.name[0]));
  node.append(el('div', 'name', card.name));
  if (card.keywords?.length) {
    const kws = el('div', 'kws');
    for (const k of card.keywords) {
      const chip = el('span', `kw kw-${k}`, KEYWORDS[k].name);
      chip.title = KEYWORDS[k].text;
      kws.append(chip);
    }
    node.append(kws);
  }
  node.append(el('div', 'text', card.text ?? ''));
  node.title = [card.name, ...(card.keywords ?? []).map((k) => `${KEYWORDS[k].name}：${KEYWORDS[k].text}`), card.text].filter(Boolean).join('\n');
}

function renderHandCard(pi, cardId, handIndex) {
  const card = getCard(cardId);
  const node = el('div', `card ${card.type}`);
  cardFace(card, node);
  if (card.type === 'creature') {
    const stats = el('div', 'stats');
    stats.append(el('span', 'stat atk', String(card.attack)), el('span', 'stat hp', String(card.hp)));
    node.append(stats);
  }
  if (isHumanTurn() && game.awaiting.step === 'mulligan') {
    node.classList.add('selectable');
    node.tabIndex = 0;
    if (ui.mulligan.has(handIndex)) { node.classList.add('selected', 'returning'); node.append(el('div', 'ribbon', '引き直す')); }
    const toggle = () => { ui.mulligan.has(handIndex) ? ui.mulligan.delete(handIndex) : ui.mulligan.add(handIndex); render(); };
    node.addEventListener('click', toggle);
    onKey(node, toggle);
    return node;
  }
  const check = playability(game, pi, handIndex);
  if (isHumanTurn() && check.ok && ui.targeting === null) {
    node.classList.add('playable');
    node.tabIndex = 0;
    const use = () => {
      const targets = targetsForHandCard(game, pi, handIndex);
      if (targets.length === 1 && targets[0] === null) act({ type: 'playCard', handIndex });
      else { ui.targeting = handIndex; ui.attackers.clear(); render(); }
    };
    node.addEventListener('click', use);
    onKey(node, use);
  } else {
    node.classList.add('unplayable');
    if (!check.ok) node.title += `\n（${check.reason}）`;
  }
  if (ui.targeting === handIndex) { node.classList.add('selected'); node.append(el('div', 'ribbon', '対象を選択中')); }
  return node;
}

function renderCreature(c) {
  const card = getCard(c.cardId);
  const node = el('div', 'card creature');
  if (fresh.has(c.uid)) node.classList.add('fresh');
  cardFace(card, node);
  const left = c.hp - c.damage;
  const stats = el('div', 'stats');
  const atk = el('span', `stat atk${c.attack > card.attack ? ' buffed' : ''}`, String(c.attack));
  const hp = el('span', `stat hp${c.damage ? ' damaged' : ''}${c.hp > card.hp ? ' buffed' : ''}`, String(left));
  atk.title = `攻撃力 ${c.attack}`;
  hp.title = `HP ${left}/${c.hp}${c.damage ? `（このターン${c.damage}ダメージ）` : ''}`;
  stats.append(atk, hp);
  node.append(stats);

  const status = [];
  if (c.tempAttack || c.tempHp) status.push(`+${c.tempAttack}/+${c.tempHp}`);
  if (c.exhausted) status.push('行動済み');
  else if (c.summoningSick && c.owner === game.activePlayer && !hasKeyword(card, 'haste')) status.push('召喚酔い');
  if (c.damage) status.push(`-${c.damage}`);

  const aw = game.awaiting;
  if (c.exhausted) node.classList.add('exhausted');
  if (game.combat?.attackers.includes(c.uid)) {
    node.classList.add('attacking');
    const by = ui.blocks.get(c.uid) ?? game.combat.blocks[c.uid];
    if (by !== undefined) status.unshift(`${creatureByUid(by)?.name ?? '?'}が防ぐ`);
    else status.unshift('攻撃中');
  }
  if (aw?.step === 'block' && [...ui.blocks.values()].includes(c.uid)) { node.classList.add('assigned'); status.unshift('ブロック'); }
  if (ui.attackers.has(c.uid)) status.unshift('攻撃する');
  if (status.length) node.append(el('div', 'ribbon', status.join('・')));

  if (!isHumanTurn()) return node;
  const target = { kind: 'creature', uid: c.uid };
  let onPick = null;
  if (isTargetable(target)) {
    node.classList.add('targetable');
    onPick = () => playAt(target);
  } else if (aw.step === 'main' && ui.targeting === null && c.owner === aw.player && canAttack(game, c)) {
    node.classList.add('selectable');
    if (ui.attackers.has(c.uid)) node.classList.add('selected');
    onPick = () => { ui.attackers.has(c.uid) ? ui.attackers.delete(c.uid) : ui.attackers.add(c.uid); ui.error = ''; render(); };
  } else if (aw.step === 'block') {
    const assigned = [...ui.blocks.values()].includes(c.uid);
    const open = game.combat.attackers.filter((uid) => !ui.blocks.has(uid)).map(creatureByUid).filter(Boolean);
    if (c.owner === aw.player && canBlock(game, c) && !assigned && open.some((a) => canBlockAttacker(game, c, a))) {
      node.classList.add('selectable');
      if (ui.blocker === c.uid) node.classList.add('selected');
      onPick = () => { ui.blocker = ui.blocker === c.uid ? null : c.uid; render(); };
    } else if (ui.blocker !== null && game.combat.attackers.includes(c.uid) && !ui.blocks.has(c.uid)
      && canBlockAttacker(game, creatureByUid(ui.blocker), c)) {
      node.classList.add('targetable');
      onPick = () => { ui.blocks.set(c.uid, ui.blocker); ui.blocker = null; render(); };
    }
  }
  if (onPick) {
    node.tabIndex = 0;
    node.addEventListener('click', onPick);
    onKey(node, onPick);
  }
  return node;
}

function onKey(node, fn) {
  node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}

function isTargetable(target) {
  if (ui.targeting === null || !isHumanTurn()) return false;
  return targetsForHandCard(game, game.awaiting.player, ui.targeting).some((t) => sameTarget(t, target));
}
function playAt(target) {
  act({ type: 'playCard', handIndex: ui.targeting, target });
}

// --- 指示バー ---

function button(label, onClick, cls = '') {
  const b = el('button', `btn ${cls}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function renderCommand(me) {
  const box = el('div', 'command');
  const left = el('div');
  const msg = el('div', 'msg');
  const sub = el('div', 'sub');
  left.append(msg, sub);
  const actions = el('div', 'actions');
  box.append(left, actions);
  const aw = game.awaiting;

  if (game.winner !== null) {
    msg.textContent = '決着！';
  } else if (!isHumanTurn()) {
    msg.textContent = `${nm(aw.player)}が考えています`;
    msg.classList.add('thinking');
  } else if (ui.targeting !== null) {
    msg.textContent = `${getCard(game.players[me].hand[ui.targeting]).name}：対象を選んでください`;
    sub.textContent = '金色に光っているものが選べます。';
    actions.append(button('やめる', () => { ui.targeting = null; render(); }));
  } else if (aw.step === 'mulligan') {
    msg.textContent = '最初の手札です。引き直すカードを選んでください';
    sub.textContent = (game.firstPlayer === aw.player ? 'あなたは先攻です。' : 'あなたは後攻です。開始時に「マナの雫」を受け取ります。') + '引き直しは1回だけ。';
    const n = ui.mulligan.size;
    actions.append(button(n ? `${n}枚引き直す` : 'このまま始める', () => act({ type: 'mulligan', handIndices: [...ui.mulligan] }), 'btn-gold'));
  } else if (aw.step === 'response') {
    msg.textContent = `${nm(game.activePlayer)}が${game.combat.attackers.length}体で攻撃してきた！`;
    sub.textContent = 'ブロックの前に「対応」カードを1枚使えます。';
    actions.append(button('対応しない', () => act({ type: 'pass' }), 'btn-gold'));
  } else if (aw.step === 'main') {
    const ready = game.players[aw.player].board.filter((c) => canAttack(game, c));
    msg.textContent = ui.attackers.size ? `${ui.attackers.size}体で攻撃する` : 'あなたのターン';
    sub.textContent = ready.length
      ? '光っている手札を使う／攻撃するクリーチャーを選ぶ'
      : '光っている手札を使ってから、ターンを終了';
    if (game.players[aw.player].hand.some((id) => hasKeyword(getCard(id), 'quick'))) sub.textContent += '（対応カードはマナを残すと相手の攻撃時にも使える）';
    const all = button('全員で攻撃', () => { ready.forEach((c) => ui.attackers.add(c.uid)); render(); });
    all.disabled = ready.length === 0 || ui.attackers.size === ready.length;
    const atk = button(ui.attackers.size ? `突撃！（${ui.attackers.size}体）` : '突撃！', () => act({ type: 'attack', attackers: [...ui.attackers] }), 'btn-crimson');
    atk.disabled = ui.attackers.size === 0;
    actions.append(all, atk, button('ターン終了', () => act({ type: 'endTurn' }), ui.attackers.size ? '' : 'btn-gold'));
  } else if (aw.step === 'block') {
    const blocks = [...ui.blocks].map(([attacker, blocker]) => ({ attacker, blocker }));
    const incoming = game.combat.attackers.filter((uid) => !ui.blocks.has(uid)).reduce((s, uid) => s + (creatureByUid(uid)?.attack ?? 0), 0);
    msg.textContent = ui.blocker === null ? 'ブロックするクリーチャーを選ぶ' : '止める相手（金色）を選ぶ';
    sub.textContent = `このままだと${incoming}ダメージを受ける（ライフ${game.players[aw.player].life}）。飛行は飛行でしか止められない。`;
    if (incoming >= game.players[aw.player].life) sub.classList.add('danger');
    actions.append(
      button('選び直す', () => { ui.blocks.clear(); ui.blocker = null; render(); }),
      button(blocks.length ? `ブロック確定（${blocks.length}）` : 'ブロックしない', () => act({ type: 'declareBlocks', blocks }), 'btn-gold'),
    );
  }
  if (ui.error) box.append(el('div', 'error', ui.error));
  if (feed.length && game.winner === null) {
    const f = el('ul', 'feed');
    f.setAttribute('aria-label', '直前の出来事');
    for (const t of feed) f.append(el('li', '', t));
    box.append(f);
  }
  return box;
}

// --- 勝敗 ---

function renderOverlay() {
  const ov = $('#overlay');
  if (game.winner === null) { ov.hidden = true; return; }
  ov.textContent = '';
  const won = game.winner === 0;
  const box = el('div', `result ${mode === 'hotseat' || won ? 'win' : 'lose'}`);
  const title = game.winner === 'draw' ? '引き分け' : mode === 'hotseat' ? `${game.players[game.winner].name}の勝利` : won ? '勝利！' : '敗北…';
  box.append(el('h2', '', title));
  box.append(el('p', '', mode === 'cpu' && won ? '見事な勝利だ。' : mode === 'cpu' ? 'CPUの勝ち。もう一度挑もう。' : '見事な戦いだった。'));
  box.append(el('p', '', `${Math.ceil(game.turn / 2)}ターンで決着　あなた：${deckNames[0]}／相手：${deckNames[1]}`));
  const actions = el('div', 'actions');
  actions.append(button('もう一度', startGame, 'btn-gold'), button('タイトルへ', showTitle));
  box.append(actions);
  ov.append(box);
  ov.hidden = false;
}

// ---------------------------------------------------------------------------
// ログとCPU
// ---------------------------------------------------------------------------

function describe(e) {
  switch (e.type) {
    case 'gameStart': return `ゲーム開始。先攻は${nm(e.firstPlayer)}`;
    case 'turnStart': return `―― ${nm(e.player)}のターン（${e.turnOfPlayer}ターン目） ――`;
    case 'summon': return `${nm(e.player)}：${e.name}を召喚`;
    case 'castSpell': return `${nm(e.player)}：${e.name}を使用${e.response ? '（対応）' : ''}`;
    case 'attack': return `${nm(e.player)}：${e.attackers.length}体で突撃`;
    case 'blocks': return e.blocks.length ? `${nm(e.player)}：${e.blocks.length}体でブロック` : `${nm(e.player)}：ブロックしない`;
    case 'damage': return `${e.sourceName ? `${e.sourceName}→` : ''}${nm(e.owner)}の${e.targetName}に${e.amount}ダメージ`;
    case 'playerDamage': return `${e.sourceName ? `${e.sourceName}→` : ''}${nm(e.player)}に${e.amount}ダメージ`;
    case 'heal': return `${nm(e.owner)}の${e.targetName}のダメージを${e.amount}回復`;
    case 'buff': return `${nm(e.owner)}の${e.targetName}が+${e.attack}/+${e.hp}${e.temporary ? '（このターン）' : ''}`;
    case 'buffAll': return `${nm(e.player)}のクリーチャーすべてが+${e.attack}/+${e.hp}（このターン）`;
    case 'gainMana': return `${nm(e.player)}：マナを${e.amount}得た`;
    case 'bonusCard': return `${nm(e.player)}は後攻なので「マナの雫」を受け取った`;
    case 'destroyed': return `${nm(e.owner)}の${e.name}は破壊された`;
    case 'mulligan': return e.count ? `${nm(e.player)}：${e.count}枚引き直した` : `${nm(e.player)}：手札をそのままにした`;
    case 'pass': return `${nm(e.player)}：対応しない`;
    case 'combatCancelled': return '攻撃クリーチャーがいなくなり、戦闘は終了';
    case 'burn': return `${nm(e.player)}は手札がいっぱいで、引いたカードが捨て札へ`;
    case 'deckOut': return `${nm(e.player)}は山札切れでカードを引けない`;
    case 'gameOver': return e.winner === 'draw' ? '引き分け' : `${nm(e.winner)}の勝利`;
    default: return null;
  }
}

function renderLog() {
  if ($('#logPanel').hidden) return;
  const ol = $('#log');
  ol.textContent = '';
  for (const e of game.log) {
    const text = describe(e);
    if (text) ol.append(el('li', e.type === 'turnStart' ? 'turn' : '', text));
  }
  ol.scrollTop = ol.scrollHeight;
}

let cpuTimer = null;
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (mode !== 'cpu' || !game.awaiting || game.awaiting.player !== 1) return;
  cpuTimer = setTimeout(() => {
    if ($('#game').hidden) return;
    applyAction(game, 1, chooseAction(game, { level }));
    render();
  }, 650);
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

buildTitle();
$('#menuBtn').addEventListener('click', showTitle);
$('#logBtn').addEventListener('click', () => { $('#logPanel').hidden = !$('#logPanel').hidden; renderLog(); });
$('#logClose').addEventListener('click', () => { $('#logPanel').hidden = true; });
showTitle();
