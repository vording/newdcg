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
  flying: { name: '飛行', text: '飛行を持つクリーチャーでしかブロックできない。' },
  firstStrike: { name: '先制', text: '戦闘で、先制を持たないクリーチャーより先にダメージを与える。' },
  vigilance: { name: '警戒', text: '攻撃しても行動済みにならない（相手のターンにブロックできる）。' },
  quick: { name: '対応', text: '相手の攻撃宣言後、ブロック宣言の前にも使える。' },
});

// effect.target を持つクリーチャーは「召喚時：対象を選んで効果」。対象がいなければ不発で召喚できる。
const CARD_LIST = [
  // --- クリーチャー ---
  { id: 'c_apprentice', name: '見習い剣士', type: 'creature', cost: 1, attack: 1, hp: 2 },
  { id: 'c_scout', name: '森の斥候', type: 'creature', cost: 1, attack: 2, hp: 1, keywords: ['haste'] },
  { id: 'c_shield', name: '盾持ちの兵', type: 'creature', cost: 2, attack: 1, hp: 3 },
  { id: 'c_wolf', name: '迅雷の狼', type: 'creature', cost: 2, attack: 3, hp: 1, keywords: ['haste'] },
  {
    id: 'c_messenger', name: '伝令の鳥', type: 'creature', cost: 2, attack: 1, hp: 1, keywords: ['flying'],
    triggers: [{ on: 'summon', effect: { type: 'draw', amount: 1 } }],
    text: '召喚時：カードを1枚引く。',
  },
  { id: 'c_warrior', name: '鉄槌の戦士', type: 'creature', cost: 3, attack: 3, hp: 3 },
  { id: 'c_rider', name: '疾風の騎手', type: 'creature', cost: 3, attack: 3, hp: 2, keywords: ['haste'] },
  { id: 'c_pikeman', name: '槍衾の衛兵', type: 'creature', cost: 3, attack: 2, hp: 3, keywords: ['firstStrike'] },
  { id: 'c_hawk', name: '嵐の鷹', type: 'creature', cost: 3, attack: 3, hp: 2, keywords: ['flying'] },
  {
    id: 'c_salamander', name: '火吹きトカゲ', type: 'creature', cost: 3, attack: 2, hp: 2,
    effect: { type: 'damage', amount: 1, target: 'character' },
    text: '召喚時：クリーチャー1体かプレイヤー1人に1ダメージ。',
  },
  { id: 'c_golem', name: '岩の巨人', type: 'creature', cost: 4, attack: 2, hp: 5 },
  { id: 'c_knight', name: '番犬の騎士', type: 'creature', cost: 4, attack: 3, hp: 3, keywords: ['vigilance'] },
  {
    id: 'c_general', name: '戦場の将軍', type: 'creature', cost: 5, attack: 3, hp: 3,
    triggers: [{ on: 'summon', effect: { type: 'buffOthers', attack: 1, hp: 1 } }],
    text: '召喚時：自分の他のクリーチャーすべてに+1/+1。',
  },
  { id: 'c_dragon', name: '古竜', type: 'creature', cost: 7, attack: 6, hp: 6, keywords: ['flying'] },
  // --- スペル ---
  {
    id: 's_arrow', name: '迎撃の矢', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'damage', amount: 2, target: 'attackingCreature' },
    text: '攻撃している相手のクリーチャー1体に2ダメージを与える。',
  },
  {
    id: 's_might', name: '剛力の薬', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'buffTemp', attack: 2, hp: 2, target: 'friendlyCreature' },
    text: '自分のクリーチャー1体はターン終了時まで+2/+2。',
  },
  {
    id: 's_rally', name: '鬨の声', type: 'spell', cost: 2,
    effect: { type: 'buffTempAll', attack: 2, hp: 0 },
    text: '自分のクリーチャーすべてはターン終了時まで+2/+0。',
  },
  {
    id: 's_fireball', name: '火球', type: 'spell', cost: 3,
    effect: { type: 'damage', amount: 3, target: 'character' },
    text: 'クリーチャー1体かプレイヤー1人に3ダメージを与える。',
  },
  {
    id: 's_insight', name: '知識の泉', type: 'spell', cost: 3,
    effect: { type: 'draw', amount: 2 },
    text: 'カードを2枚引く。',
  },
  {
    id: 's_wave', name: '炎の波', type: 'spell', cost: 4,
    effect: { type: 'damageAllEnemies', amount: 2 },
    text: '相手のクリーチャーすべてに2ダメージを与える。',
  },
  {
    id: 's_coin', name: 'マナの雫', type: 'spell', cost: 0, token: true,
    effect: { type: 'gainMana', amount: 1, draw: 1 },
    text: 'このターン、マナを1得る。カードを1枚引く。（後攻がゲーム開始時に1枚受け取る。デッキには入れられない）',
  },
  // 旧テストカード（デッキには入れていない。テスト用に残す）
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

/** 構築済みデッキ（各30枚） */
export const DECKS = Object.freeze({
  swift: {
    name: '疾風（速攻型）',
    text: '低コストのクリーチャーと速攻・飛行で一気にライフを削る。',
    counts: {
      c_rider: 3, c_scout: 3, c_wolf: 3, c_messenger: 2, c_warrior: 3, c_hawk: 3,
      c_pikeman: 1, c_salamander: 2, c_general: 2, s_fireball: 3, s_might: 3, s_rally: 2,
    },
  },
  fortress: {
    name: '城塞（防御型）',
    text: '硬いクリーチャーと除去で耐え、古竜で決める。',
    counts: {
      c_shield: 3, c_pikeman: 3, c_messenger: 2, c_golem: 3, c_knight: 3, c_dragon: 3,
      c_salamander: 3, s_arrow: 3, s_insight: 2, s_wave: 2, s_fireball: 3,
    },
  },
  balance: {
    name: '均衡（標準型）',
    text: '序盤から終盤まで満遍なく戦える。',
    counts: {
      c_apprentice: 3, c_wolf: 2, c_messenger: 2, c_warrior: 3, c_pikeman: 2, c_hawk: 2,
      c_salamander: 2, c_golem: 2, c_knight: 2, c_general: 2, c_dragon: 1,
      s_fireball: 3, s_arrow: 2, s_might: 2,
    },
  },
});

export function deckList(deckId) {
  const d = DECKS[deckId];
  if (!d) throw new Error(`Unknown deck: ${deckId}`);
  return Object.entries(d.counts).flatMap(([id, n]) => Array(n).fill(id));
}

/** テスト用の標準デッキ */
export function testDeck() {
  return deckList('balance');
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
    else if (CARDS[id].token) errors.push(`${CARDS[id].name} はデッキに入れられません`);
    counts[id] = (counts[id] || 0) + 1;
  }
  for (const [id, n] of Object.entries(counts)) {
    if (n > config.maxCopiesPerCard) {
      errors.push(`${CARDS[id]?.name ?? id} は${config.maxCopiesPerCard}枚までです（${n}枚）`);
    }
  }
  return errors;
}
