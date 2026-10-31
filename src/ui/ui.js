// ブラウザUI。ゲームロジックは src/engine のみが持ち、ここは表示と入力の変換だけを行う。
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

let game;
let mode = 'cpu';
let deckNames = ['', ''];
let ui; // 画面上の一時的な選択状態
let seenLog = 0; // 人間が最後に見たログ位置（それ以降の出来事を「直前の出来事」として表示）
let feed = []; // 直前の出来事
let fresh = new Set(); // 直前にダメージや召喚があったクリーチャー

function resetUi() {
  ui = { attackers: new Set(), targeting: null, blocker: null, blocks: new Map(), mulligan: new Set(), error: '' };
}

function pickDeck(value) {
  const ids = Object.keys(DECKS);
  return value === 'random' ? ids[Math.floor(Math.random() * ids.length)] : value;
}

function newGame() {
  mode = $('#mode').value;
  const mine = pickDeck($('#deck').value);
  const theirs = mode === 'cpu' ? pickDeck('random') : pickDeck($('#deck2')?.value ?? 'random');
  deckNames = [DECKS[mine].name, DECKS[theirs].name];
  game = createGame({
    decks: [deckList(mine), deckList(theirs)],
    seed: Date.now(),
    names: mode === 'cpu' ? ['あなた', 'CPU'] : ['プレイヤー1', 'プレイヤー2'],
  });
  seenLog = 0;
  feed = [];
  fresh = new Set();
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
  updateFeed();
  const me = viewer();
  const opp = 1 - me;
  const table = $('#table');
  table.textContent = '';
  table.append(game.winner !== null ? renderGameOver() : renderPrompt(me));
  table.append(renderSide(opp, false));
  table.append(renderSide(me, true));
  renderLog();
  scheduleCpu();
}

/** 人間が操作する番になったら、前回からの出来事をまとめて表示する */
function updateFeed() {
  if (!isHumanTurn() && game.winner === null) return;
  const entries = game.log.slice(seenLog);
  if (entries.length === 0) return;
  seenLog = game.log.length;
  feed = entries.map(describe).filter(Boolean).filter((t) => !t.startsWith('――')).slice(-6);
  fresh = new Set(entries.filter((e) => e.type === 'damage' || e.type === 'summon' || e.type === 'buff').map((e) => e.target ?? e.uid));
}

function renderGameOver() {
  const box = el('div', 'prompt over');
  const won = game.winner === 0 && mode === 'cpu';
  const msg = game.winner === 'draw' ? '引き分け' : (mode === 'cpu' ? (won ? 'あなたの勝利！' : 'CPU の勝利') : `${game.players[game.winner].name} の勝利！`);
  box.append(el('div', 'banner', msg));
  box.append(el('div', 'msg', `${Math.ceil(game.turn / 2)}ターンで決着。あなた：${deckNames[0]} / 相手：${deckNames[1]}`));
  box.append(button('もう一度遊ぶ', newGame, 'primary'));
  return box;
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
  const name = mode === 'cpu' ? 'あなた' : game.players[aw.player].name;
  const actions = el('div', 'actions');
  box.append(actions);

  if (ui.targeting !== null) {
    msg.textContent = `${getCard(game.players[me].hand[ui.targeting]).name} の対象を選んでください（オレンジ枠）`;
    actions.append(button('キャンセル', () => { ui.targeting = null; render(); }));
  } else if (aw.step === 'mulligan') {
    msg.textContent = `${name}の最初の手札です。引き直したいカードを選んでください（1回だけ）。`
      + (game.firstPlayer === aw.player ? ' あなたが先攻です。' : ' あなたは後攻です。開始時に「マナの雫」を受け取ります。');
    const n = ui.mulligan.size;
    actions.append(button(n ? `${n}枚引き直す` : 'このまま始める', () => act({ type: 'mulligan', handIndices: [...ui.mulligan] }), 'primary'));
  } else if (aw.step === 'response') {
    const n = game.combat.attackers.length;
    msg.textContent = `${game.players[game.activePlayer].name}が ${n}体で攻撃してきました（赤枠）。ブロックの前に「対応」カードを1枚使えます。`;
    actions.append(button('対応しない', () => act({ type: 'pass' }), 'primary'));
  } else if (aw.step === 'main') {
    msg.textContent = `${name}のターン：緑枠の手札を使う／攻撃させるクリーチャーを選んで「攻撃」。`;
    const atk = button(ui.attackers.size ? `${ui.attackers.size}体で攻撃` : '攻撃（未選択）', () => act({ type: 'attack', attackers: [...ui.attackers] }), 'primary');
    atk.disabled = ui.attackers.size === 0;
    const ready = game.players[aw.player].board.filter((c) => canAttack(game, c));
    const all = button('全員選択', () => { ready.forEach((c) => ui.attackers.add(c.uid)); render(); });
    all.disabled = ready.length === 0 || ui.attackers.size === ready.length;
    actions.append(atk, all, button('ターン終了', () => act({ type: 'endTurn' })));
    const p = game.players[aw.player];
    if (p.hand.some((id) => hasKeyword(getCard(id), 'quick') && getCard(id).id !== 's_coin')) {
      box.append(el('div', 'hint', 'ヒント：「対応」カードは、マナを残してターンを終えると相手の攻撃時に使えます。'));
    }
  } else if (aw.step === 'block') {
    msg.textContent = ui.blocker === null
      ? `ブロック：自分のクリーチャーを選び、止めたい攻撃クリーチャー（赤枠）をクリック。飛行は飛行でしか止められません。`
      : 'このクリーチャーで止める攻撃クリーチャー（オレンジ枠）を選んでください。';
    const blocks = [...ui.blocks].map(([attacker, blocker]) => ({ attacker, blocker }));
    const incoming = game.combat.attackers
      .filter((uid) => !ui.blocks.has(uid))
      .reduce((s, uid) => s + (creatureByUid(uid)?.attack ?? 0), 0);
    actions.append(
      button(blocks.length ? `ブロック確定（${blocks.length}体）` : 'ブロックしない', () => act({ type: 'declareBlocks', blocks }), 'primary'),
      button('選び直す', () => { ui.blocks.clear(); ui.blocker = null; render(); }),
    );
    box.append(el('div', incoming >= game.players[aw.player].life ? 'hint danger' : 'hint',
      `このままだと受けるダメージ：${incoming}（ライフ ${game.players[aw.player].life}）`));
  }
  if (ui.error) box.append(el('div', 'error', ui.error));
  if (feed.length) {
    const f = el('ul', 'feed');
    f.setAttribute('aria-label', '直前の出来事');
    for (const t of feed) f.append(el('li', '', t));
    box.append(f);
  }
  return box;
}

function button(label, onClick, cls) {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function creatureByUid(uid) {
  return game.players.flatMap((p) => p.board).find((c) => c.uid === uid);
}

function renderSide(pi, isFront) {
  const p = game.players[pi];
  const side = el('div', `side${game.activePlayer === pi && game.turn > 0 ? ' active' : ''}`);

  const status = el('div', 'status');
  const life = el('span', `life${p.life <= 5 ? ' low' : ''}`, `♥ ${p.life}`);
  const playerTarget = { kind: 'player', player: pi };
  if (isTargetable(playerTarget)) {
    life.classList.add('targetable');
    life.title = 'クリックして対象に選ぶ';
    life.addEventListener('click', () => playAt(playerTarget));
  }
  const mana = el('span', 'mana');
  mana.title = '現在マナ / 最大マナ';
  for (let i = 0; i < Math.max(p.maxMana, p.mana); i++) {
    const full = i < p.mana;
    mana.append(el('span', full ? 'full' : 'empty', full ? '◆' : '◇'));
  }
  mana.append(` ${p.mana}/${p.maxMana}`);
  status.append(
    el('strong', '', p.name + (game.activePlayer === pi && game.turn > 0 ? '（手番）' : '')),
    life, mana,
    el('span', 'meta', `デッキ ${p.deck.length}・手札 ${p.hand.length}・墓地 ${p.graveyard.length}`),
  );

  const board = el('div', 'row board');
  if (p.board.length === 0) board.append(el('div', 'empty', 'クリーチャーなし'));
  for (const c of p.board) board.append(renderCreature(c));

  const hand = el('div', 'row hand');
  const showHand = isFront && (mode === 'hotseat' || pi === 0);
  p.hand.forEach((id, i) => hand.append(showHand ? renderHandCard(pi, id, i) : el('div', 'card back')));

  if (isFront) side.append(board, status, hand);
  else side.append(hand, status, board);
  return side;
}

function cardBody(card, node) {
  node.append(el('div', 'cost', String(card.cost)), el('div', 'name', card.name));
  const kws = el('div', 'kws');
  for (const k of card.keywords ?? []) {
    const chip = el('span', `kw kw-${k}`, KEYWORDS[k].name);
    chip.title = KEYWORDS[k].text;
    kws.append(chip);
  }
  if (card.keywords?.length) node.append(kws);
  if (card.text) node.append(el('div', 'text', card.text));
  node.title = [card.name, ...(card.keywords ?? []).map((k) => `${KEYWORDS[k].name}：${KEYWORDS[k].text}`), card.text].filter(Boolean).join('\n');
}

function renderHandCard(pi, cardId, handIndex) {
  const card = getCard(cardId);
  const node = el('div', `card ${card.type}`);
  cardBody(card, node);
  if (card.type === 'creature') {
    const stats = el('div', 'stats');
    stats.append(el('span', 'atk', `⚔${card.attack}`), el('span', 'hp', `♥${card.hp}`));
    node.append(stats);
  } else {
    node.append(el('div', 'badges', 'スペル'));
  }
  if (isHumanTurn() && game.awaiting.step === 'mulligan') {
    node.classList.add('selectable');
    if (ui.mulligan.has(handIndex)) { node.classList.add('selected', 'returning'); node.append(el('div', 'tag', '引き直す')); }
    node.addEventListener('click', () => {
      ui.mulligan.has(handIndex) ? ui.mulligan.delete(handIndex) : ui.mulligan.add(handIndex);
      render();
    });
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
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); use(); } });
  } else {
    node.classList.add('unplayable');
    if (!check.ok) node.title += `\n（${check.reason}）`;
  }
  if (ui.targeting === handIndex) node.classList.add('selected');
  return node;
}

function renderCreature(c) {
  const card = getCard(c.cardId);
  const node = el('div', 'card creature');
  if (fresh.has(c.uid)) node.classList.add('fresh');
  cardBody(card, node);
  const left = c.hp - c.damage;
  const stats = el('div', 'stats');
  const atkCls = c.attack > card.attack ? 'atk buffed' : 'atk';
  const hpCls = c.damage ? 'hp damaged' : (c.hp > card.hp ? 'hp buffed' : 'hp');
  stats.append(el('span', atkCls, `⚔${c.attack}`), el('span', hpCls, `♥${left}/${c.hp}`));
  const bar = el('div', 'hpbar');
  const fill = el('div', left / c.hp <= 0.34 ? 'low' : '');
  fill.style.width = `${Math.max(0, (left / c.hp) * 100)}%`;
  bar.append(fill);
  node.append(stats, bar);
  const badges = [];
  if (c.tempAttack || c.tempHp) badges.push(`このターン+${c.tempAttack}/+${c.tempHp}`);
  if (c.exhausted) badges.push('行動済み');
  if (c.summoningSick && c.owner === game.activePlayer && !hasKeyword(card, 'haste')) badges.push('召喚酔い');
  node.append(el('div', 'badges', badges.join('・')));
  if (c.exhausted) node.classList.add('exhausted');

  const aw = game.awaiting;
  const target = { kind: 'creature', uid: c.uid };
  if (game.combat?.attackers.includes(c.uid)) {
    node.classList.add('attacking');
    const blockedBy = ui.blocks.get(c.uid);
    if (blockedBy !== undefined) node.append(el('div', 'tag', `${nameOf(blockedBy)}がブロック`));
  }
  if (aw?.step === 'block' && [...ui.blocks.values()].includes(c.uid)) node.classList.add('assigned');

  if (!isHumanTurn()) return node;

  if (isTargetable(target)) {
    node.classList.add('targetable');
    node.addEventListener('click', () => playAt(target));
  } else if (aw.step === 'main' && ui.targeting === null && c.owner === aw.player && canAttack(game, c)) {
    node.classList.add('selectable');
    if (ui.attackers.has(c.uid)) { node.classList.add('selected'); node.append(el('div', 'tag', '攻撃する')); }
    node.addEventListener('click', () => {
      ui.attackers.has(c.uid) ? ui.attackers.delete(c.uid) : ui.attackers.add(c.uid);
      ui.error = '';
      render();
    });
  } else if (aw.step === 'block') {
    const assigned = [...ui.blocks.values()].includes(c.uid);
    const openAttackers = game.combat.attackers.filter((uid) => !ui.blocks.has(uid)).map(creatureByUid).filter(Boolean);
    if (c.owner === aw.player && canBlock(game, c) && !assigned && openAttackers.some((a) => canBlockAttacker(game, c, a))) {
      node.classList.add('selectable');
      if (ui.blocker === c.uid) node.classList.add('selected');
      node.addEventListener('click', () => { ui.blocker = ui.blocker === c.uid ? null : c.uid; render(); });
    } else if (ui.blocker !== null && game.combat.attackers.includes(c.uid) && !ui.blocks.has(c.uid)
      && canBlockAttacker(game, creatureByUid(ui.blocker), c)) {
      node.classList.add('targetable');
      node.addEventListener('click', () => { ui.blocks.set(c.uid, ui.blocker); ui.blocker = null; render(); });
    }
  }
  return node;
}

function nameOf(uid) {
  return creatureByUid(uid)?.name ?? '?';
}

function isTargetable(target) {
  if (ui.targeting === null || !isHumanTurn()) return false;
  return targetsForHandCard(game, game.awaiting.player, ui.targeting).some((t) => sameTarget(t, target));
}

function playAt(target) {
  act({ type: 'playCard', handIndex: ui.targeting, target });
}

// ---------------------------------------------------------------------------
// ログとCPU
// ---------------------------------------------------------------------------

function describe(e) {
  const pn = (i) => game.players[i].name;
  const nm = (i) => (mode === 'cpu' ? (i === 0 ? 'あなた' : 'CPU') : pn(i));
  switch (e.type) {
    case 'gameStart': return `ゲーム開始。先攻は ${nm(e.firstPlayer)}`;
    case 'turnStart': return `―― ${nm(e.player)} のターン（${e.turnOfPlayer}ターン目） ――`;
    case 'summon': return `${nm(e.player)}：${e.name} を召喚`;
    case 'castSpell': return `${nm(e.player)}：${e.name} を使用${e.response ? '（対応）' : ''}`;
    case 'attack': return `${nm(e.player)}：${e.attackers.length}体で攻撃`;
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
    case 'burn': return `${nm(e.player)}は手札がいっぱいで、引いたカードが墓地へ`;
    case 'deckOut': return `${nm(e.player)}はデッキ切れでドローできない`;
    case 'gameOver': return e.winner === 'draw' ? '引き分け' : `${nm(e.winner)}の勝利`;
    default: return null;
  }
}

function renderLog() {
  const ol = $('#log');
  ol.textContent = '';
  for (const e of game.log) {
    const text = describe(e);
    if (text) ol.append(el('li', e.type === 'turnStart' ? 'turn' : '', text));
  }
  ol.parentElement.scrollTop = ol.parentElement.scrollHeight;
}

let cpuTimer = null;
function scheduleCpu() {
  clearTimeout(cpuTimer);
  if (mode !== 'cpu' || !game.awaiting || game.awaiting.player !== 1) return;
  cpuTimer = setTimeout(() => {
    applyAction(game, 1, chooseAction(game, { level: $('#level').value }));
    render();
  }, 550);
}

// デッキ選択肢を作る
for (const sel of [$('#deck')]) {
  for (const [id, d] of Object.entries(DECKS)) {
    const o = el('option', '', `${d.name}`);
    o.value = id;
    o.title = d.text;
    sel.append(o);
  }
  const r = el('option', '', 'ランダム');
  r.value = 'random';
  sel.append(r);
}
$('#newGame').addEventListener('click', newGame);
newGame();
