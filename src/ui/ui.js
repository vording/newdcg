// ブラウザUI（ゲーム名は未定）。ゲームロジックは src/engine のみが持ち、ここは表示と入力の変換だけを行う。
import {
  applyAction, canAttack, canBlock, canBlockAttacker, createGame, DECKS, deckList, getCard, hasKeyword,
  KEYWORDS, RARITIES, CARDS, effectiveCost, playability, sameTarget, targetsForHandCard,
} from '../engine/index.js';
import { chooseAction } from '../ai/simple-ai.js';
import { ART } from './art-data.js';
import { isSoundOn, setSoundOn, sfx, unlockAudio } from './sound.js';

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
  c_imp: '鬼', c_bat: '蝠', c_viper: '蛇', c_sister: '祈', c_gravekeeper: '墓', c_archer: '弓', c_boar: '猪',
  c_duelist: '刃', c_assassin: '影', c_packleader: '長', c_paladin: '誓', c_warden: '守', c_phoenix: '鳳',
  c_bloodlord: '血', c_colossus: '像', c_lionking: '獣', s_snare: '網', s_ward: '護', s_lance: '雷',
  s_recall: '還', s_prayer: '祷', s_judgment: '断', t_pup: '仔', t_ash: '灰',
  c_ambusher: '伏', c_owl: '梟', c_stalker: '潜', s_riposte: '返', s_sidestep: '切', s_veil: '霧',
};
const DECK_TYPE = { swift: '速攻型', fortress: '防御型', balance: '標準型', night: '遺志・吸命型', shadow: '瞬発型' };

let game = null;
let mode = 'cpu';
let level = 'easy';
let deckNames = ['', ''];
let ui;
let seenLog = 0;
let fxSeen = 0;
let resultRecorded = false;
let lastStreak = null; // この対戦の勝敗を連勝記録に反映したか // 演出・効果音を出し終えたログの位置
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
    { id: 'random', name: 'おまかせ', type: 'ランダム', text: `${Object.keys(DECKS).length}つのデッキからランダムに選ぶ。` }];
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

// ---------------------------------------------------------------------------
// 連勝記録（CPU戦のみ。強さごとに、このブラウザに保存）
// ---------------------------------------------------------------------------

const STREAK_KEY = 'dcg-streaks';
const LEVEL_NAME = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
function loadStreaks() {
  try { return JSON.parse(localStorage.getItem(STREAK_KEY)) ?? {}; } catch { return {}; }
}
function saveStreaks(all) {
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(all)); } catch { /* 保存できない環境では記録しない */ }
}
function streakOf(lv) {
  const r = loadStreaks()[lv];
  return { cur: r?.cur ?? 0, best: r?.best ?? 0 };
}
/** 勝ちなら連勝+1（最高記録を更新）、負け・引き分け・中断なら0に戻す。更新前後を返す */
function recordStreak(lv, won) {
  const all = loadStreaks();
  const before = streakOf(lv);
  const cur = won ? before.cur + 1 : 0;
  const after = { cur, best: Math.max(before.best, cur) };
  all[lv] = after;
  saveStreaks(all);
  return { before, after };
}
function renderStreakInfo() {
  const box = $('#streakInfo');
  if (!box) return;
  const lv = new FormData($('#setup')).get('level');
  const isCpu = new FormData($('#setup')).get('mode') === 'cpu';
  const { cur, best } = streakOf(lv);
  box.hidden = !isCpu;
  box.textContent = `${LEVEL_NAME[lv]}の連勝：${cur}　最高：${best}`;
}
/** CPU戦の途中で抜けると連勝が途切れる */
function leaveGame() {
  const inProgress = game && mode === 'cpu' && game.winner === null && !resultRecorded;
  if (inProgress && streakOf(level).cur > 0
    && !confirm(`対戦を中断すると、${LEVEL_NAME[level]}の連勝（${streakOf(level).cur}）が途切れます。タイトルへ戻りますか？`)) return;
  if (inProgress) { recordStreak(level, false); resultRecorded = true; }
  showTitle();
}

function showTitle() {
  clearTimeout(cpuTimer);
  $('#overlay').hidden = true;
  $('#logPanel').hidden = true;
  $('#game').hidden = true;
  $('#title').hidden = false;
  renderStreakInfo();
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
  seenLog = 0; fxSeen = 0; feed = []; fresh = new Set(); resultRecorded = false;
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
  hidePreview();
  updateFeed();
  const me = viewer();
  const opp = 1 - me;
  const table = $('#table');
  const before = snapshotCards(table);
  table.textContent = '';
  table.append(
    renderSeat(opp, false),
    renderOppHand(opp),
    renderBattlefield(me, opp),
    renderCommand(me),
    renderHand(me),
    renderSeat(me, true),
  );
  animateCards(table, before);
  playEffects(table, before);
  $('#turnInfo').textContent = game.turn > 0 ? `ターン ${Math.ceil(game.turn / 2)}・${nm(game.activePlayer)}の番` : '準備中';
  renderLog();
  renderOverlay();
  scheduleCpu();
}

// ---------------------------------------------------------------------------
// カードの動き（描き直しの前後で位置を比べ、瞬間移動せずに滑らかに動かす）
// ---------------------------------------------------------------------------

let lastPlayed = null; // 直前に手札から使ったカードの位置（召喚されたクリーチャーの出発点にする）
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function snapshotCards(root) {
  const map = new Map();
  for (const el of root.querySelectorAll('[data-key]')) map.set(el.dataset.key, { el, rect: el.getBoundingClientRect() });
  return map;
}

function animateCards(root, before) {
  if (reduceMotion() || before.size === 0) { lastPlayed = null; return; }
  const after = new Map();
  for (const el of root.querySelectorAll('[data-key]')) after.set(el.dataset.key, el);
  const ease = 'cubic-bezier(.2,.8,.2,1)';

  for (const [key, el] of after) {
    const now = el.getBoundingClientRect();
    const prev = before.get(key);
    if (prev) {
      // 同じカードが別の場所に移った → 前の位置から滑らせる
      const dx = prev.rect.left - now.left;
      const dy = prev.rect.top - now.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], { duration: 320, easing: ease });
      }
    } else if (key.startsWith('u')) {
      // 新しく場に出たクリーチャー → 手札（相手なら相手の手札）から飛んでくる
      const owner = Number(el.dataset.owner);
      let from = lastPlayed && lastPlayed.owner === owner ? lastPlayed.rect : null;
      if (!from) {
        const handRow = root.querySelector(owner === viewer() ? '.hand' : '.opp-hand');
        from = handRow?.getBoundingClientRect();
      }
      const dx = from ? from.left + from.width / 2 - (now.left + now.width / 2) : 0;
      const dy = from ? from.top + from.height / 2 - (now.top + now.height / 2) : -30;
      el.animate([
        { translate: `${dx}px ${dy}px`, scale: '0.8', opacity: 0.4 },
        { translate: '0px 0px', scale: '1', opacity: 1 },
      ], { duration: 420, easing: ease });
    } else if (key.startsWith('h')) {
      // 引いたカード → 右から滑り込む
      el.animate([{ translate: '60px 0px', opacity: 0 }, { translate: '0px 0px', opacity: 1 }], { duration: 300, easing: ease });
    }
  }

  // 消えたカード（破壊されたクリーチャー、使ったスペル）は、元の位置で消えていく様子を見せる
  const bf = root.querySelector('.battlefield')?.getBoundingClientRect();
  for (const [key, { el, rect }] of before) {
    if (after.has(key)) continue;
    const isCreature = key.startsWith('u');
    const isSpell = key.startsWith('h') && el.dataset.kind === 'spell';
    if (!isCreature && !isSpell) continue;
    const ghost = el.cloneNode(true);
    ghost.classList.remove('playable', 'selectable', 'selected', 'targetable', 'unplayable');
    ghost.classList.add('ghost');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, '--cw': `${rect.width}px` });
    document.body.append(ghost);
    let frames;
    if (isCreature) {
      frames = [{ opacity: 1, filter: 'brightness(1.6)' }, { opacity: 0, scale: '0.85', translate: '0px 16px', filter: 'grayscale(1) brightness(.5)' }];
    } else {
      const tx = bf ? bf.left + bf.width / 2 - (rect.left + rect.width / 2) : 0;
      const ty = bf ? bf.top + bf.height / 2 - (rect.top + rect.height / 2) : -80;
      frames = [{ opacity: 1 }, { translate: `${tx}px ${ty}px`, scale: '1.1', opacity: 1, offset: 0.6 }, { translate: `${tx}px ${ty}px`, scale: '1.3', opacity: 0 }];
    }
    ghost.animate(frames, { duration: isCreature ? 520 : 600, easing: 'ease-out' }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
  lastPlayed = null;
}

// ---------------------------------------------------------------------------
// 演出と効果音（新しく増えたログを見て、ダメージ数字・斬撃・ライフの増減などを出す）
// ---------------------------------------------------------------------------

function fxLayer() {
  let layer = document.querySelector('.fx-layer');
  if (!layer) { layer = el('div', 'fx-layer'); document.body.append(layer); }
  return layer;
}
function centerOf(rect) { return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null; }
function spawnFx(cls, text, pos, frames, opts) {
  if (!pos) return;
  const n = el('div', cls, text);
  n.style.left = `${pos.x}px`; n.style.top = `${pos.y}px`;
  fxLayer().append(n);
  n.animate(frames, { fill: 'forwards', ...opts }).finished.then(() => n.remove(), () => n.remove());
}
function floatNumber(text, kind, pos, delay, big = false) {
  spawnFx(`fx-num ${kind}${big ? ' big' : ''}`, text, pos, [
    { opacity: 0, translate: '0 10px', scale: '.6' },
    { opacity: 1, translate: '0 -6px', scale: '1.15', offset: 0.18 },
    { opacity: 1, translate: '0 -22px', scale: '1', offset: 0.7 },
    { opacity: 0, translate: '0 -40px', scale: '1' },
  ], { duration: 1100, delay, easing: 'ease-out' });
}
function ring(kind, pos, delay) {
  spawnFx(`fx-ring ${kind}`, undefined, pos, [
    { opacity: 1, scale: '.4' }, { opacity: 0, scale: '3.2' },
  ], { duration: 550, delay, easing: 'ease-out' });
}
function slash(from, to, delay) {
  if (!from || !to) return;
  const dx = to.x - from.x; const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const n = el('div', 'fx-slash');
  Object.assign(n.style, { left: `${from.x}px`, top: `${from.y}px`, width: `${len}px`, rotate: `${Math.atan2(dy, dx)}rad` });
  fxLayer().append(n);
  n.animate([
    { opacity: 0, scale: '0 1' }, { opacity: 1, scale: '1 1', offset: 0.5 }, { opacity: 0, scale: '1 1' },
  ], { duration: 380, delay, fill: 'forwards', easing: 'ease-out' }).finished.then(() => n.remove(), () => n.remove());
}
function banner(text, delay) {
  const t = $('#table')?.getBoundingClientRect();
  spawnFx('fx-word', text, t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : null, [
    { opacity: 0, scale: '.8' }, { opacity: 1, scale: '1', offset: 0.15 }, { opacity: 1, scale: '1', offset: 0.75 }, { opacity: 0, scale: '1.05' },
  ], { duration: 1000, delay, easing: 'ease-out' });
}
function pulse(node, cls, delay) {
  if (!node) return;
  setTimeout(() => { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }, delay);
}

function playEffects(root, before) {
  const entries = game.log.slice(fxSeen);
  fxSeen = game.log.length;
  if (entries.length === 0) return;
  const motion = !reduceMotion();
  const me = viewer();
  const creatureNode = (uid) => root.querySelector(`[data-key="u${uid}"]`);
  const creaturePos = (uid) => centerOf(creatureNode(uid)?.getBoundingClientRect() ?? before.get(`u${uid}`)?.rect);
  const lifeNode = (pi) => root.querySelector(`[data-life="${pi}"]`);
  const lifePos = (pi) => centerOf(lifeNode(pi)?.getBoundingClientRect());
  const sourcePos = (src) => (typeof src === 'number' ? creaturePos(src) : null);
  let t = 0; // 演出を少しずつずらして、何が起きたか順に見えるようにする
  const step = (ms) => { const d = t; t = Math.min(t + ms, 1400); return d; };

  for (const e of entries) {
    switch (e.type) {
      case 'turnStart': { const d = step(0); sfx('turn', d); break; }
      case 'draw': if (e.player === me) sfx('draw', step(0)); break;
      case 'summon': { const d = step(120); sfx('summon', d); if (motion) ring('spell', creaturePos(e.uid), d + 200); break; }
      case 'castSpell': { const d = step(160); sfx(e.response ? 'quick' : 'spell', d); if (motion && e.response) banner(`瞬発　${e.name}`, d); break; }
      case 'attack': {
        const d = step(200); sfx('attack', d);
        if (motion) {
          for (const uid of e.attackers) {
            const n = creatureNode(uid);
            const dir = Number(n?.dataset.owner) === me ? -1 : 1;
            n?.animate([{ translate: '0 0' }, { translate: `0 ${dir * 26}px`, offset: 0.4 }, { translate: `0 ${dir * 10}px` }], { duration: 420, delay: d, easing: 'ease-out' });
          }
        }
        break;
      }
      case 'blocks': {
        if (!e.blocks.length) break;
        const d = step(180); sfx('block', d);
        if (motion) for (const b of e.blocks) slash(creaturePos(b.blocker), creaturePos(b.attacker), d);
        break;
      }
      case 'damage': {
        const d = step(110); sfx('hit', d);
        const pos = creaturePos(e.target);
        if (motion) {
          slash(sourcePos(e.source), pos, Math.max(0, d - 80));
          floatNumber(`-${e.amount}`, 'dmg', pos, d);
          ring('', pos, d);
          const n = creatureNode(e.target);
          if (n) setTimeout(() => n.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 300 }), d);
        }
        break;
      }
      case 'playerDamage': {
        const d = step(140); sfx('playerHit', d);
        const pos = lifePos(e.player);
        if (motion) { slash(sourcePos(e.source), pos, Math.max(0, d - 80)); floatNumber(`-${e.amount}`, 'dmg', pos, d, true); ring('', pos, d); }
        pulse(lifeNode(e.player), 'hit', d);
        break;
      }
      case 'lifeGain': {
        const d = step(120); sfx('heal', d);
        if (motion) { floatNumber(`+${e.amount}`, 'heal', lifePos(e.player), d, true); ring('heal', lifePos(e.player), d); }
        pulse(lifeNode(e.player), 'healed', d);
        break;
      }
      case 'heal': { const d = step(100); sfx('heal', d); if (motion) floatNumber(`+${e.amount}`, 'heal', creaturePos(e.target), d); break; }
      case 'buff': { const d = step(80); sfx('buff', d); if (motion) floatNumber(`+${e.attack}/+${e.hp}`, 'buff', creaturePos(e.target), d); break; }
      case 'buffAll': {
        const d = step(120); sfx('buff', d);
        if (motion) for (const c of game.players[e.player].board) floatNumber(`+${e.attack}/+${e.hp}`, 'buff', creaturePos(c.uid), d);
        break;
      }
      case 'shieldBroken': { const d = step(120); sfx('shield', d); if (motion) { ring('shield', creaturePos(e.target), d); floatNumber('防いだ', 'buff', creaturePos(e.target), d); } break; }
      case 'shieldGranted': { const d = step(100); sfx('shield', d); if (motion) ring('shield', creaturePos(e.target), d); break; }
      case 'deathtouch': { const d = step(100); if (motion) floatNumber('必殺', 'dmg', creaturePos(e.target), d); break; }
      case 'destroyed': sfx('destroy', step(140)); break;
      case 'destroyEffect': case 'exhausted': case 'bounced': { const d = step(100); sfx('spell', d); if (motion) ring('spell', creaturePos(e.target), d); break; }
      case 'destroyAllEffect': { const d = step(200); sfx('destroy', d); if (motion) banner('断罪', d); break; }
      case 'lastWill': { const d = step(160); if (motion) banner(`遺志　${e.name}`, d); break; }
      case 'gainMana': { const d = step(80); sfx('mana', d); break; }
      case 'gameOver': {
        const d = step(300);
        if (e.winner === 'draw') sfx('lose', d);
        else sfx(mode === 'cpu' ? (e.winner === 0 ? 'win' : 'lose') : 'win', d);
        break;
      }
      default: break;
    }
  }
}

// ---------------------------------------------------------------------------
// サウンドの切り替え
// ---------------------------------------------------------------------------

function soundLabel() { return isSoundOn() ? '♪ 音：入' : '♪ 音：切'; }
function refreshSoundButtons() {
  for (const b of document.querySelectorAll('.sound-toggle')) {
    b.textContent = soundLabel();
    b.setAttribute('aria-pressed', String(isSoundOn()));
  }
}
function toggleSound() { setSoundOn(!isSoundOn()); refreshSoundButtons(); sfx('click'); }

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
  life.dataset.life = String(pi);
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
  // 最大20マナになるので、粒を並べず「◆ 数字」と細いゲージで表す
  mana.append(el('span', 'pip full'));
  mana.append(el('span', 'mana-num', `${p.mana}/${p.maxMana}`));
  const gauge = el('span', 'mana-gauge');
  const cap = game.config.maxMana;
  const fill = el('span', 'mana-fill');
  fill.style.width = `${Math.min(100, (p.mana / cap) * 100)}%`;
  const max = el('span', 'mana-max');
  max.style.width = `${Math.min(100, (p.maxMana / cap) * 100)}%`;
  gauge.append(max, fill);
  mana.append(gauge);

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

// キーワード能力のマーク（24×24のSVGパス。固定文字列）
const MARK = {
  haste: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  flying: 'M2 15c5-1 8-5 10-11 1 4 0 7-2 9 3-1 7-1 11 0-3 2-7 3-10 3 2 1 5 2 8 4-6 1-12 0-17-5z',
  firstStrike: 'M14.5 3H21v6.5L10.5 20l-3-3-2 2L4 17.5l2-2L3 12.5 14.5 3zM3.5 19 5 20.5 3.5 22 2 20.5z',
  vigilance: 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  quick: 'M6 2h12v2c0 3-2 5-4.5 6.5v3C16 15 18 17 18 20v2H6v-2c0-3 2-5 4.5-6.5v-3C8 9 6 7 6 4V2zm2.2 2c.3 1.9 1.7 3.3 3.8 4.6 2.1-1.3 3.5-2.7 3.8-4.6H8.2z',
  lifesteal: 'M12 2C9 7 6 10.5 6 14a6 6 0 0 0 12 0c0-3.5-3-7-6-12z',
  deathtouch: 'M12 2a8 8 0 0 0-8 8c0 2.6 1.3 4.6 3 5.8V19a1 1 0 0 0 1 1h1v2h2v-2h2v2h2v-2h1a1 1 0 0 0 1-1v-3.2c1.7-1.2 3-3.2 3-5.8a8 8 0 0 0-8-8zM8.5 13a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm7 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z',
  trample: 'M3 5l7 7-7 7V5zm8 0l7 7-7 7V5zm8 0h2v14h-2z',
  ward: 'M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5l-8-3z',
  lastWill: 'M12 2c1.5 2 3 3.5 3 5.5A3 3 0 0 1 12 10a3 3 0 0 1-3-2.5C9 5.5 10.5 4 12 2zM9 11h6v11H9z',
};
function markSvg(k) {
  const span = el('span');
  span.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${MARK[k] ?? ''}"/></svg>`;
  return span.firstChild;
}

/** カード面を作る（全面イラスト＋英語名）。stats を渡すとクリーチャーの攻撃力・HPを差し替えて表示する */
function buildCard(card, stats = null, opts = {}) {
  const node = el('div', `card ${card.type} r-${card.rarity} cid-${card.id}`);
  const art = el('div', 'c-art');
  if (ART[card.id]) {
    const img = el('img');
    img.src = ART[card.id];
    img.alt = '';
    img.draggable = false;
    art.append(img);
    node.classList.add('has-art');
  } else {
    art.append(el('div', 'c-glyph', GLYPH[card.id] ?? ''));
  }
  const title = el('div', 'c-title');
  const en = card.nameEn ?? card.name;
  const longestWord = Math.max(...en.split(' ').map((w) => w.length));
  const size = longestWord >= 12 ? ' xlong' : longestWord >= 9 || en.length > 13 ? ' long' : '';
  title.append(el('div', `c-en${size}`, en));
  if (card.type === 'spell') title.append(el('div', 'c-type', 'SPELL'));
  node.append(art, el('div', 'c-shade'), el('div', 'c-corners'), title);
  // 場のクリーチャーは加護の状態を反映（使い切ったら薄く、呪文で得たら追加）
  const kws = [...(card.keywords ?? [])];
  if (stats?.shield && !kws.includes('ward')) kws.push('ward');
  if (kws.length) {
    const marks = el('div', 'c-marks');
    for (const k of kws) {
      const m = el('span', `mark kw-${k}${k === 'ward' && stats && !stats.shield ? ' spent' : ''}`);
      m.append(markSvg(k));
      m.setAttribute('aria-label', KEYWORDS[k].name);
      marks.append(m);
    }
    node.append(marks);
  }
  const costNow = opts.cost ?? card.cost;
  node.append(el('div', `gem cost${costNow < card.cost ? ' discount' : ''}`, String(costNow)));
  if (card.type === 'creature') {
    const s = stats ?? { atk: card.attack, hp: card.hp, atkCls: '', hpCls: '' };
    node.append(el('div', `gem atk ${s.atkCls}`, String(s.atk)), el('div', `gem hp ${s.hpCls}`, String(s.hp)));
  }
  node.setAttribute('aria-label', `${card.name}（${en}）コスト${card.cost}`);
  attachPreview(node, card, stats);
  return node;
}

// --- カード詳細（マウスオーバー／長押しで、大きなカード＋日本語名・能力・効果） ---
let previewTimer = null;
let suppressClick = false;
function showPreview(card, stats) {
  const pv = $('#preview');
  pv.textContent = '';
  const info = el('div', 'info');
  info.append(el('div', 'ja', card.name), el('div', 'en', card.nameEn ?? ''));
  info.append(el('div', 'meta', `${RARITIES[card.rarity].name}・${card.type === 'creature' ? 'クリーチャー' : 'スペル'}・コスト${card.cost}`));
  if (card.type === 'creature') {
    const s = stats ?? { atk: card.attack, hp: card.hp };
    info.append(el('div', 'stat-line', `攻撃力 ${s.atk}／HP ${s.hp}${stats && (s.atk !== card.attack || s.hp !== card.hp) ? `（元は ${card.attack}／${card.hp}）` : ''}`));
  }
  for (const k of card.keywords ?? []) {
    const row = el('div', 'kw');
    const txt = el('div');
    txt.append(el('b', '', KEYWORDS[k].name), document.createTextNode(`：${KEYWORDS[k].text}`));
    row.append(markSvg(k), txt);
    info.append(row);
  }
  if (card.text) info.append(el('div', 'effect', card.text));
  pv.append(buildCardStatic(card, stats), info);
  pv.hidden = false;
}
function hidePreview() { $('#preview').hidden = true; }
// 画面が切り替わったときに詳細表示が残らないようにする
document.addEventListener('click', () => { if (!suppressClick) hidePreview(); });
function attachPreview(node, card, stats) {
  if (previewDisabled) return;
  node.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) showPreview(card, stats); });
  node.addEventListener('mouseleave', hidePreview);
  node.addEventListener('touchstart', () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { suppressClick = true; showPreview(card, stats); }, 450);
  }, { passive: true });
  const end = () => { clearTimeout(previewTimer); if (suppressClick) setTimeout(hidePreview, 1200); };
  node.addEventListener('touchend', end);
  node.addEventListener('touchmove', () => clearTimeout(previewTimer), { passive: true });
  node.addEventListener('click', (e) => { if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); suppressClick = false; } }, true);
}
/** プレビュー・一覧用（詳細表示のイベントを付けない） */
let previewDisabled = false;
function buildCardStatic(card, stats = null) {
  previewDisabled = true;
  try { return buildCard(card, stats); } finally { previewDisabled = false; }
}

function renderHandCard(pi, cardId, handIndex) {
  const card = getCard(cardId);
  const node = buildCard(card, null, { cost: effectiveCost(game, pi, card) });
  // 同じカードが複数あっても区別できるよう「何枚目か」を含めたキーにする
  const nth = game.players[pi].hand.slice(0, handIndex).filter((id) => id === cardId).length;
  node.dataset.key = `h${pi}-${cardId}-${nth}`;
  node.dataset.kind = card.type;
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
      lastPlayed = { rect: node.getBoundingClientRect(), owner: pi };
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
  const left = c.hp - c.damage;
  const node = buildCard(card, {
    atk: c.attack, hp: left, shield: !!c.shield,
    atkCls: c.attack > card.attack ? 'buffed' : '',
    hpCls: `${c.damage ? 'damaged' : ''} ${c.hp > card.hp ? 'buffed' : ''}`,
  });
  if (fresh.has(c.uid)) node.classList.add('fresh');
  node.dataset.key = `u${c.uid}`;
  node.dataset.owner = String(c.owner);

  const status = [];
  if (c.tempAttack || c.tempHp) status.push(`+${c.tempAttack}/+${c.tempHp}`);
  if (c.exhausted) status.push('行動済み');
  else if (c.summoningSick && c.owner === game.activePlayer && !hasKeyword(card, 'haste')) status.push('召喚酔い');
  if (c.damage) status.push(`-${c.damage}`);

  const aw = game.awaiting;
  const isAttacking = !!game.combat?.attackers.includes(c.uid);
  if (c.exhausted && !isAttacking) node.classList.add('exhausted');
  if (isAttacking) {
    node.classList.add('attacking');
    const ex = status.indexOf('行動済み');
    if (ex >= 0) status.splice(ex, 1);
    const by = ui.blocks.get(c.uid) ?? game.combat.blocks[c.uid];
    if (by !== undefined) status.unshift(`${creatureByUid(by)?.name ?? '?'}が防ぐ`);
    else status.unshift('⚔ 攻撃中');
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
    msg.textContent = '決着';
  } else if (!isHumanTurn()) {
    msg.textContent = `${nm(aw.player)}が考えています`;
    msg.classList.add('thinking');
  } else if (ui.targeting !== null) {
    msg.textContent = `${getCard(game.players[me].hand[ui.targeting]).name}：対象を選んでください`;
    sub.textContent = '金色に光っているものが選べます。';
    actions.append(button('やめる', () => { ui.targeting = null; render(); }));
  } else if (aw.step === 'mulligan') {
    msg.textContent = '最初の手札です。引き直すカードを選んでください';
    sub.textContent = (game.firstPlayer === aw.player ? 'あなたは先攻です。' : `あなたは後攻です。${game.config.secondPlayerBonusCard ? '開始時に「マナの雫」を受け取ります。' : ''}`) + '引き直しは1回だけ。';
    const n = ui.mulligan.size;
    actions.append(button(n ? `${n}枚引き直す` : 'このまま始める', () => act({ type: 'mulligan', handIndices: [...ui.mulligan] }), 'btn-gold'));
  } else if (aw.step === 'response') {
    const n = game.combat.attackers.length;
    const mine = game.activePlayer === aw.player;
    if (aw.window === 'attack') {
      msg.textContent = `${nm(game.activePlayer)}が${n}体で攻撃してきた`;
      sub.textContent = 'ブロックの前に瞬発カードを使える（何枚でも）。瞬発クリーチャーを呼べば、そのままブロックに使える。相手のターン中はコスト−1。';
    } else if (mine) {
      msg.textContent = 'ブロックが決まった。ダメージの前に瞬発カードを使える';
      sub.textContent = '攻撃しているクリーチャーを強化するなら今。';
    } else {
      msg.textContent = 'ダメージの前に瞬発カードを使える';
      sub.textContent = 'ブロックしたクリーチャーを守る・強化するなら今。相手のターン中はコスト−1。';
    }
    actions.append(button('見送る', () => act({ type: 'pass' }), 'btn-gold'));
  } else if (aw.step === 'main') {
    const ready = game.players[aw.player].board.filter((c) => canAttack(game, c));
    msg.textContent = ui.attackers.size ? `${ui.attackers.size}体で攻撃する` : 'あなたのターン';
    sub.textContent = ready.length
      ? '光っている手札を使う／攻撃するクリーチャーを選ぶ'
      : '光っている手札を使ってから、ターンを終了';
    if (game.players[aw.player].hand.some((id) => hasKeyword(getCard(id), 'quick'))) sub.textContent += '（瞬発カードはマナを残すと相手の攻撃時にも使える）';
    const all = button('全員で攻撃', () => { ready.forEach((c) => ui.attackers.add(c.uid)); render(); });
    all.disabled = ready.length === 0 || ui.attackers.size === ready.length;
    const atk = button(ui.attackers.size ? `攻撃する（${ui.attackers.size}体）` : '攻撃する', () => act({ type: 'attack', attackers: [...ui.attackers] }), 'btn-crimson');
    atk.disabled = ui.attackers.size === 0;
    actions.append(all, atk, button('ターン終了', () => act({ type: 'endTurn' }), ui.attackers.size ? '' : 'btn-gold'));
  } else if (aw.step === 'block') {
    const blocks = [...ui.blocks].map(([attacker, blocker]) => ({ attacker, blocker }));
    const incoming = game.combat.attackers.filter((uid) => !ui.blocks.has(uid)).reduce((s, uid) => s + (creatureByUid(uid)?.attack ?? 0), 0);
    msg.textContent = ui.blocker === null ? 'ブロックするクリーチャーを選ぶ' : '止める相手（金色）を選ぶ';
    sub.textContent = `このままだと${incoming}ダメージを受ける（ライフ${game.players[aw.player].life}）。天翔は天翔でしか止められない。`;
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
  ov.onclick = null;
  if (game.winner === null) { ov.hidden = true; return; }
  ov.textContent = '';
  const won = game.winner === 0;
  const box = el('div', `result ${mode === 'hotseat' || won ? 'win' : 'lose'}`);
  const title = game.winner === 'draw' ? '引き分け' : mode === 'hotseat' ? `${game.players[game.winner].name}の勝利` : won ? '勝利' : '敗北';
  box.append(el('h2', '', title));
  box.append(el('p', '', mode === 'cpu' && won ? '見事な勝利だ。' : mode === 'cpu' ? 'CPUの勝ち。次の一局で。' : '見事な戦いだった。'));
  box.append(el('p', '', `${Math.ceil(game.turn / 2)}ターンで決着　あなた：${deckNames[0]}／相手：${deckNames[1]}`));
  if (mode === 'cpu') {
    if (!resultRecorded) { lastStreak = recordStreak(level, won); resultRecorded = true; }
    const { before, after } = lastStreak;
    const line = won
      ? `${LEVEL_NAME[level]}で${after.cur}連勝${after.cur > before.best ? '（最高記録更新！）' : `（最高 ${after.best}）`}`
      : before.cur > 0 ? `連勝は${before.cur}で途切れた（最高 ${after.best}）` : `${LEVEL_NAME[level]}の最高記録：${after.best}連勝`;
    box.append(el('p', `streak${won && after.cur > before.best ? ' record' : ''}`, line));
  }
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
    case 'summon': return e.token ? `${nm(e.player)}：${e.name}が現れた` : `${nm(e.player)}：${e.name}を召喚`;
    case 'castSpell': return `${nm(e.player)}：${e.name}を使用${e.response ? '（瞬発）' : ''}`;
    case 'attack': return `${nm(e.player)}：${e.attackers.length}体で攻撃`;
    case 'blocks': return e.blocks.length ? `${nm(e.player)}：${e.blocks.length}体でブロック` : `${nm(e.player)}：ブロックしない`;
    case 'damage': return `${e.sourceName ? `${e.sourceName}→` : ''}${nm(e.owner)}の${e.targetName}に${e.amount}ダメージ`;
    case 'playerDamage': return `${e.sourceName ? `${e.sourceName}→` : ''}${nm(e.player)}に${e.amount}ダメージ`;
    case 'heal': return `${nm(e.owner)}の${e.targetName}のダメージを${e.amount}回復`;
    case 'buff': return `${nm(e.owner)}の${e.targetName}が+${e.attack}/+${e.hp}${e.temporary ? '（このターン）' : ''}`;
    case 'buffAll': return `${nm(e.player)}のクリーチャーすべてが+${e.attack}/+${e.hp}（このターン）`;
    case 'lifeGain': return `${e.sourceName ? `${e.sourceName}→` : ''}${nm(e.player)}のライフが${e.amount}回復`;
    case 'shieldBroken': return `${nm(e.owner)}の${e.targetName}の加護がダメージを防いだ`;
    case 'deathtouch': return `${e.sourceName}の必殺で${nm(e.owner)}の${e.targetName}が倒れる`;
    case 'lastWill': return `${nm(e.owner)}の${e.name}の遺志が発動`;
    case 'exhausted': return `${nm(e.owner)}の${e.targetName}は行動済みになった`;
    case 'destroyAllEffect': return '断罪：場のクリーチャーがすべて破壊される';
    case 'destroyEffect': return `${nm(e.owner)}の${e.targetName}を破壊`;
    case 'shieldGranted': return `${nm(e.owner)}の${e.targetName}に加護`;
    case 'bounced': return `${nm(e.owner)}の${e.targetName}が手札に戻った`;
    case 'gainMana': return `${nm(e.player)}：マナを${e.amount}得た`;
    case 'bonusCard': return `${nm(e.player)}は後攻なので「マナの雫」を受け取った`;
    case 'destroyed': return `${nm(e.owner)}の${e.name}は破壊された`;
    case 'mulligan': return e.count ? `${nm(e.player)}：${e.count}枚引き直した` : `${nm(e.player)}：手札をそのままにした`;
    case 'pass': return `${nm(e.player)}：瞬発を見送った`;
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

// --- カード一覧 ---
function showGallery() {
  const ov = $('#overlay');
  ov.textContent = '';
  const box = el('div', 'gallery');
  const head = el('div', 'gallery-head');
  head.append(el('h2', '', 'カード一覧'), button('閉じる', () => { ov.hidden = true; }));
  box.append(head, el('p', 'hint', 'カーソルを合わせる（スマホは長押し）と日本語名と効果が見られます。縁の色はレア度。'));
  const inDecks = new Set(Object.values(DECKS).flatMap((d) => Object.keys(d.counts)));
  const all = Object.values(CARDS).filter((c) => inDecks.has(c.id) || c.token);
  for (const r of Object.keys(RARITIES).sort((a, b) => RARITIES[b].order - RARITIES[a].order)) {
    const cards = all.filter((c) => c.rarity === r).sort((a, b) => a.cost - b.cost);
    if (!cards.length) continue;
    box.append(el('h3', '', `${RARITIES[r].name}（${cards.length}）`));
    const grid = el('div', 'gallery-grid');
    for (const c of cards) {
      const cell = el('div');
      cell.append(buildCard(c));
      grid.append(cell);
    }
    box.append(grid);
  }
  ov.append(box);
  ov.hidden = false;
  ov.onclick = (e) => { if (e.target === ov) ov.hidden = true; };
}

buildTitle();
$('#galleryBtn').addEventListener('click', showGallery);
for (const b of document.querySelectorAll('.sound-toggle')) b.addEventListener('click', toggleSound);
refreshSoundButtons();
// 最初の操作で音を使えるようにし、ボタンには軽いクリック音を付ける
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(ev, unlockAudio, { passive: true, capture: true });
document.addEventListener('click', (e) => { if (e.target.closest('button:not(.sound-toggle)')) sfx('click'); });
// カードの長押しで画像保存などのメニューを出さない
document.addEventListener('contextmenu', (e) => { if (e.target.closest('.card, .preview, .gallery')) e.preventDefault(); });
document.addEventListener('dragstart', (e) => { if (e.target.closest('.card')) e.preventDefault(); });
$('#menuBtn').addEventListener('click', leaveGame);
for (const r of document.querySelectorAll('#setup input[name=level], #setup input[name=mode]')) r.addEventListener('change', renderStreakInfo);
renderStreakInfo();
$('#logBtn').addEventListener('click', () => { $('#logPanel').hidden = !$('#logPanel').hidden; renderLog(); });
$('#logClose').addEventListener('click', () => { $('#logPanel').hidden = true; });
showTitle();
