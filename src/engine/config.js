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
  maxMana: 10,
  boardLimit: 5, // 暫定

  // --- 仕様書で未確定の項目（仮置き。docs/open-questions.md 参照） ---

  // Q1: ブロックしたクリーチャーを行動済みにするか（§7 で未確定と明記）
  blockerExhaustsOnBlock: false,
  // Q2: 行動済み（攻撃した）クリーチャーがブロックできるか
  exhaustedCanBlock: false,
  // Q3: 先攻1ターン目にドローするか（仕様書の記述どおりなら true）
  firstPlayerDrawsOnFirstTurn: true,
  // Q4: デッキ切れでドローできないときの扱い: 'skip'（何もしない） | 'lose'（敗北） | 'fatigue'（ダメージ）
  deckOutRule: 'skip',
  // Q5: 手札上限（null = 上限なし）
  handLimit: null,
});

export function makeConfig(overrides = {}) {
  return Object.freeze({ ...DEFAULT_CONFIG, ...overrides });
}
