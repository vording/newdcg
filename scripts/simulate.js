// AI同士の自動対戦で、バランスと「ゲーム体験」の指標を計測する。
// 使い方: node scripts/simulate.js [1組あたりの対戦数=200] [設定JSON]
//   例: node scripts/simulate.js 300 '{"startingLife":25}'
import { createGame, DECKS, deckList } from '../src/engine/index.js';
import { step } from '../src/ai/simple-ai.js';

const perPair = Number(process.argv[2] ?? 200);
const config = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const deckIds = Object.keys(DECKS);
const MAX_ACTIONS = 3000;

function playOne(deckA, deckB, seed) {
  const s = createGame({ decks: [deckList(deckA), deckList(deckB)], seed, config });
  let n = 0;
  const lifeAt = {};
  while (s.winner === null && n++ < MAX_ACTIONS) {
    step(s);
    if (!(s.turn in lifeAt)) lifeAt[s.turn] = s.players.map((p) => p.life);
  }
  return { s, lifeAt };
}

const total = { games: 0, first: 0, draws: 0, stalled: 0, turns: 0, close: 0, blowout: 0, winnerLife: 0, comeback: 0, comebackBase: 0, leadChanges: 0, responses: 0, blocks: 0, deaths: 0, burns: 0 };
const turnHist = {};
const cardStats = {}; // id → { played, playedByWinner }
const matchup = {}; // "a vs b" → wins of a

for (const a of deckIds) {
  for (const b of deckIds) {
    let winsA = 0;
    for (let i = 0; i < perPair; i++) {
      const { s, lifeAt } = playOne(a, b, 1000 * deckIds.indexOf(a) + 100000 * deckIds.indexOf(b) + i + 1);
      total.games++;
      if (s.winner === null) { total.stalled++; continue; }
      if (s.winner === 'draw') { total.draws++; continue; }
      if (s.winner === 0) winsA++;
      if (s.winner === s.firstPlayer) total.first++;
      const turnsEach = Math.ceil(s.turn / 2);
      total.turns += turnsEach;
      turnHist[turnsEach] = (turnHist[turnsEach] ?? 0) + 1;
      const wl = s.players[s.winner].life;
      total.winnerLife += wl;
      if (wl <= 5) total.close++;
      if (wl >= 15) total.blowout++;
      // 中盤（全体の半分のターン）時点でライフが少なかった側が勝った割合
      const mid = lifeAt[Math.max(2, Math.floor(s.turn / 2))];
      if (mid && mid[0] !== mid[1]) {
        total.comebackBase++;
        const behind = mid[0] < mid[1] ? 0 : 1;
        if (behind === s.winner) total.comeback++;
      }
      // ライフのリードが入れ替わった回数
      let prev = 0;
      for (const t of Object.keys(lifeAt).map(Number).sort((x, y) => x - y)) {
        const d = Math.sign(lifeAt[t][0] - lifeAt[t][1]);
        if (d !== 0 && prev !== 0 && d !== prev) total.leadChanges++;
        if (d !== 0) prev = d;
      }
      for (const e of s.log) {
        if (e.type === 'castSpell' && e.response) total.responses++;
        if (e.type === 'blocks') total.blocks += e.blocks.length;
        if (e.type === 'destroyed') total.deaths++;
        if (e.type === 'burn') total.burns++;
        if (e.type === 'summon' || e.type === 'castSpell') {
          const cs = (cardStats[e.name] ??= { played: 0, won: 0 });
          cs.played++;
          if (e.player === s.winner) cs.won++;
        }
      }
    }
    matchup[`${a} vs ${b}`] = winsA / perPair;
  }
}

const decided = total.games - total.stalled - total.draws;
const pct = (x, d = decided) => `${((x / d) * 100).toFixed(1)}%`;
console.log(`設定: ${JSON.stringify(config)}  対戦数: ${total.games}（1組${perPair}戦 × ${deckIds.length ** 2}組）`);
console.log(`先攻勝率            : ${pct(total.first)}`);
console.log(`引き分け/未決着      : ${total.draws} / ${total.stalled}`);
console.log(`平均ターン数（各自）  : ${(total.turns / decided).toFixed(1)}`);
console.log(`ターン数分布         : ${Object.entries(turnHist).sort((x, y) => x[0] - y[0]).map(([t, n]) => `${t}:${n}`).join(' ')}`);
console.log(`勝者の平均残りライフ   : ${(total.winnerLife / decided).toFixed(1)}`);
console.log(`接戦（勝者ライフ≤5）   : ${pct(total.close)}   圧勝（勝者ライフ≥15）: ${pct(total.blowout)}`);
console.log(`逆転勝ち（中盤劣勢から）: ${pct(total.comeback, total.comebackBase)}`);
console.log(`リード交代/試合       : ${(total.leadChanges / decided).toFixed(2)}`);
console.log(`対応使用/試合         : ${(total.responses / decided).toFixed(2)}`);
console.log(`ブロック/試合         : ${(total.blocks / decided).toFixed(2)}   破壊/試合: ${(total.deaths / decided).toFixed(2)}   手札超過: ${total.burns}`);
console.log('デッキ相性（行のデッキの勝率、先後ランダム）:');
for (const a of deckIds) {
  console.log(`  ${a.padEnd(9)} ${deckIds.map((b) => `${b}:${(matchup[`${a} vs ${b}`] * 100).toFixed(0)}%`).join('  ')}`);
}
console.log('カード別（使用回数 / 使った側の勝率）:');
for (const [name, cs] of Object.entries(cardStats).sort((x, y) => y[1].played - x[1].played)) {
  console.log(`  ${name.padEnd(8, '　')} ${String(cs.played).padStart(5)}  ${pct(cs.won, cs.played)}`);
}
