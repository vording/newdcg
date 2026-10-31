// カードデータ定義（テスト用の最小セット）。
// カードはデータのみで記述し、効果の処理は effects.js のレジストリ側で実装する。
//
// フィールド:
//   id        : 一意なカードID
//   name      : 表示名
//   type      : 'creature' | 'spell'
//   cost      : マナコスト
//   attack/hp : クリーチャーのみ
//   keywords  : 能力キーワード（'haste' = 速攻, 'quick' = 対応）
//   effect    : スペルの効果 { type, ...params }（effects.js のキー）
//   triggers  : 誘発能力 [{ on: 'summon' | 'turnStart' | 'turnEnd', effect }]
//   text      : ルールテキスト（表示用）

export const KEYWORDS = Object.freeze({
  haste: { name: '速攻', text: '召喚したターンから攻撃できる。' },
  quick: { name: '対応', text: '相手の攻撃宣言後、ブロック宣言の前にも使える。' },
});

const CARD_LIST = [
  { id: 'c_apprentice', name: '見習い剣士', type: 'creature', cost: 1, attack: 1, hp: 2 },
  { id: 'c_scout', name: '森の斥候', type: 'creature', cost: 1, attack: 2, hp: 1 },
  { id: 'c_shield', name: '盾持ちの兵', type: 'creature', cost: 2, attack: 1, hp: 4 },
  { id: 'c_wolf', name: '迅雷の狼', type: 'creature', cost: 2, attack: 2, hp: 1, keywords: ['haste'] },
  {
    id: 'c_messenger', name: '伝令の鳥', type: 'creature', cost: 2, attack: 1, hp: 1,
    triggers: [{ on: 'summon', effect: { type: 'draw', amount: 1 } }],
    text: '召喚時：カードを1枚引く。',
  },
  { id: 'c_warrior', name: '鉄槌の戦士', type: 'creature', cost: 3, attack: 3, hp: 3 },
  { id: 'c_golem', name: '岩の巨人', type: 'creature', cost: 4, attack: 3, hp: 6 },
  { id: 'c_dragon', name: '古竜', type: 'creature', cost: 6, attack: 6, hp: 6 },
  {
    id: 's_fireball', name: '火球', type: 'spell', cost: 2,
    effect: { type: 'damage', amount: 3, target: 'character' },
    text: 'クリーチャー1体かプレイヤー1人に3ダメージを与える。',
  },
  {
    id: 's_arrow', name: '迎撃の矢', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'damage', amount: 2, target: 'enemyCreature' },
    text: '相手のクリーチャー1体に2ダメージを与える。',
  },
  {
    id: 's_mend', name: '癒しの光', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'healAll', target: 'friendlyCreature' },
    text: '自分のクリーチャー1体のダメージをすべて回復する。',
  },
];

export const CARDS = Object.freeze(Object.fromEntries(CARD_LIST.map((c) => [c.id, Object.freeze(c)])));

export function getCard(id) {
  const card = CARDS[id];
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export function hasKeyword(card, kw) {
  return Array.isArray(card.keywords) && card.keywords.includes(kw);
}

/** 30枚のテストデッキ */
const TEST_DECK_COUNTS = {
  c_apprentice: 2, c_scout: 2, c_shield: 3, c_wolf: 3, c_messenger: 2, c_warrior: 3,
  c_golem: 3, c_dragon: 3, s_fireball: 3, s_arrow: 3, s_mend: 3,
};
export function testDeck() {
  return Object.entries(TEST_DECK_COUNTS).flatMap(([id, n]) => Array(n).fill(id));
}

/** デッキ構築ルールの検証。問題があればエラーメッセージの配列を返す。 */
export function validateDeck(deck, config) {
  const errors = [];
  if (deck.length !== config.deckSize) {
    errors.push(`デッキ枚数は${config.deckSize}枚である必要があります（現在${deck.length}枚）`);
  }
  const counts = {};
  for (const id of deck) {
    if (!CARDS[id]) errors.push(`存在しないカード: ${id}`);
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) {
    if (n > config.maxCopiesPerCard) {
      errors.push(`${CARDS[id]?.name ?? id} は${config.maxCopiesPerCard}枚までです（${n}枚）`);
    }
  }
  return errors;
}
