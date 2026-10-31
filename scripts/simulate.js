// AI同士の自動対戦で、ルールエンジンの安定性と先攻・後攻の勝率を確認する。
// 使い方: node scripts/simulate.js [対戦数=1000] [設定JSON]
//   例: node scripts/simulate.js 2000 '{"exhaustedCanBlock":true}'
import { createGame, testDeck } from '../src/engine/index.js';
import { step } from '../src/ai/simple-ai.js';

const games = Number(process.argv[2] ?? 1000);
const config = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const MAX_ACTIONS = 2000;

let firstWins = 0, secondWins = 0, draws = 0, stalled = 0, totalTurns = 0;
for (let i = 0; i < games; i++) {
  const s = createGame({ decks: [testDeck(), testDeck()], seed: i + 1, config });
  let n = 0;
  while (s.winner === null && n++ < MAX_ACTIONS) step(s);
  if (s.winner === null) { stalled++; continue; }
  totalTurns += s.turn;
  if (s.winner === 'draw') draws++;
  else if (s.winner === s.firstPlayer) firstWins++;
  else secondWins++;
}
const pct = (x) => `${((x / games) * 100).toFixed(1)}%`;
console.log(`設定: ${JSON.stringify(config)}`);
console.log(`対戦数: ${games}`);
console.log(`先攻勝利: ${firstWins} (${pct(firstWins)})`);
console.log(`後攻勝利: ${secondWins} (${pct(secondWins)})`);
console.log(`引き分け: ${draws} / 未決着: ${stalled}`);
console.log(`平均ターン数（両者合計）: ${(totalTurns / Math.max(1, games - stalled)).toFixed(1)}`);
