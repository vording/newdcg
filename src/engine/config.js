// ゲームルールの調整可能パラメータ。
// 仕様書 v0.3 で「暫定」とされている値や、仕様上「未確定」の項目はすべてここに集約する。
// 未確定項目のデフォルト値は「仮置き」であり、docs/open-questions.md で確認待ちとしている。

export const DEFAULT_CONFIG = Object.freeze({
  // --- 仕様書 §3 基本パラメータ ---
  deckSize: 30, // 暫定
  maxCopiesPerCard: 3, // 暫定
  startingLife: 20,
  openingHandFirst: 4,
  openingHandSecond: 5,
  drawPerTurn: 1,
  maxMana: 20,
  // 毎ターンの最大マナの増え方。先攻の1ターン目だけ別の値にできる（null = 同じ）
  manaPerTurn: 2,
  firstPlayerFirstTurnMana: 1, // 先攻は奇数（1,3,5…）、後攻は偶数（2,4,6…）のマナで戦う
  boardLimit: 5, // 暫定

  // --- 確認済みのルール（docs/open-questions.md 参照） ---

  // Q1【確定】ブロックしたクリーチャーは行動済みになる
  blockerExhaustsOnBlock: true,
  // Q2【確定】行動済み（攻撃した）クリーチャーはブロックできない
  exhaustedCanBlock: false,
  // Q6【確定】先攻も1ターン目にドローする
  firstPlayerDrawsOnFirstTurn: true,
  // Q8【確定】ドローできなくなった時点で敗北: 'lose'（他に 'skip' | 'fatigue' も選択可）
  deckOutRule: 'lose',

  // クリーチャーのダメージ: true = 毎ターン終了時に全回復（MTG方式） / false = 蓄積する（仕様書v0.3 §8）
  damageResetsAtTurnEnd: true,
  // 後攻がゲーム開始時（マリガン後）に受け取るカード（null = なし）。先攻有利の補正。
  secondPlayerBonusCard: null,
  // 後攻の初期ライフへの上乗せ（先攻有利の補正）
  secondPlayerLifeBonus: 0,
  // 構え：相手のターン中に使う瞬発カードのコスト軽減量
  quickDiscount: 1,
  // ライフの上限（null = 上限なし。回復・吸命で初期ライフを超えて増やせる）
  lifeCap: null,
  // Q9【決定】手札上限10枚。超えて引いたカードは墓地へ（null = 上限なし）
  handLimit: 10,
  // Q10【決定】ゲーム開始時に1回、好きな枚数を引き直せる
  mulligan: true,
});

export function makeConfig(overrides = {}) {
  return Object.freeze({ ...DEFAULT_CONFIG, ...overrides });
}
