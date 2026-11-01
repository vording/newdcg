import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/engine/index.js';
import { chooseAction } from '../src/ai/simple-ai.js';
import { newGame, ok, passResponses, put, setHand } from './helpers.js';

/** プレイヤー0が攻撃し、プレイヤー1（CPU）のブロック判断まで進める */
function lethalAttack(setup) {
  const s = newGame();
  setHand(s, 0, []); setHand(s, 1, []);
  const uids = setup(s);
  ok(applyAction(s, 0, { type: 'attack', attackers: uids }));
  passResponses(s);
  assert.equal(s.awaiting.step, 'block');
  return s;
}

for (const level of ['easy', 'normal', 'hard']) {
  test(`CPU（${level}）はブロックしないと負ける攻撃を必ずブロックする`, () => {
    for (let i = 0; i < 30; i++) {
      const s = lethalAttack((st) => {
        st.players[1].life = 3;
        put(st, 1, 'c_apprentice');
        return [put(st, 0, 'c_warrior').uid];
      });
      const action = chooseAction(s, { level, random: Math.random });
      assert.equal(action.blocks.length, 1, `${level}: ブロックしなかった`);
    }
  });
}

test('蹂躙のはみ出しで死ぬ場合は、HPの高いブロッカーで止める', () => {
  const s = lethalAttack((st) => {
    st.players[1].life = 3;
    put(st, 1, 'c_imp'); // 2/1：これで止めると 6-1=5 通って負け
    put(st, 1, 'c_golem'); // 2/5：これなら 1 しか通らない
    return [put(st, 0, 'c_colossus').uid];
  });
  for (const level of ['normal', 'hard']) {
    const action = chooseAction(s, { level, random: Math.random });
    const blocker = s.players[1].board.find((c) => c.uid === action.blocks[0]?.blocker);
    assert.equal(blocker?.cardId, 'c_golem', level);
  }
});
