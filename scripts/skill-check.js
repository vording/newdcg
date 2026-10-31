// 戦略性の確認: 評価型AIと「合法手からランダムに選ぶAI」を対戦させる。
// 実力差が勝敗に反映されるか（運ゲーになっていないか）を見る。
import { applyAction, canAttack, canBlockAttacker, createGame, DECKS, deckList, playability, targetsForHandCard } from '../src/engine/index.js';
import { chooseAction } from '../src/ai/simple-ai.js';

const N = Number(process.argv[2] ?? 100);
let rng = 12345;
const rand = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pickOne = (a) => a[Math.floor(rand() * a.length)];

function randomAction(s) {
  const me = s.awaiting.player;
  const p = s.players[me];
  if (s.awaiting.step === 'mulligan') return { type: 'mulligan', handIndices: [] };
  if (s.awaiting.step === 'block') {
    const atk = s.players[s.activePlayer].board.filter((c) => s.combat.attackers.includes(c.uid));
    const used = new Set(); const blocks = [];
    for (const a of atk) {
      const b = pickOne([null, ...p.board.filter((x) => !used.has(x.uid) && canBlockAttacker(s, x, a))]);
      if (b) { used.add(b.uid); blocks.push({ attacker: a.uid, blocker: b.uid }); }
    }
    return { type: 'declareBlocks', blocks };
  }
  const plays = [];
  p.hand.forEach((_, i) => { if (playability(s, me, i).ok) for (const t of targetsForHandCard(s, me, i)) plays.push({ type: 'playCard', handIndex: i, target: t }); });
  if (s.awaiting.step === 'response') return plays.length && rand() < 0.5 ? pickOne(plays) : { type: 'pass' };
  if (plays.length && rand() < 0.8) return pickOne(plays);
  const ready = p.board.filter((c) => canAttack(s, c)).filter(() => rand() < 0.6).map((c) => c.uid);
  return ready.length ? { type: 'attack', attackers: ready } : { type: 'endTurn' };
}

let smartWins = 0, games = 0;
const ids = Object.keys(DECKS);
for (let i = 0; i < N; i++) {
  const d = ids[i % ids.length];
  const s = createGame({ decks: [deckList(d), deckList(d)], seed: i + 7 });
  const smart = i % 2;
  let n = 0;
  while (s.winner === null && n++ < 3000) {
    const pl = s.awaiting.player;
    applyAction(s, pl, pl === smart ? chooseAction(s) : randomAction(s));
  }
  games++;
  if (s.winner === smart) smartWins++;
}
console.log(`評価型AI vs ランダムAI（同デッキ）: 評価型の勝率 ${((smartWins / games) * 100).toFixed(1)}% (${games}戦)`);

// ふつう vs やさしい
let normalWins = 0;
for (let i = 0; i < N; i++) {
  const d = ids[i % ids.length];
  const s = createGame({ decks: [deckList(d), deckList(d)], seed: i + 99 });
  const normal = i % 2;
  let n = 0;
  while (s.winner === null && n++ < 3000) {
    const pl = s.awaiting.player;
    applyAction(s, pl, chooseAction(s, { level: pl === normal ? 'normal' : 'easy', random: rand }));
  }
  if (s.winner === normal) normalWins++;
}
console.log(`ふつう vs やさしい（同デッキ）: ふつうの勝率 ${((normalWins / N) * 100).toFixed(1)}% (${N}戦)`);
