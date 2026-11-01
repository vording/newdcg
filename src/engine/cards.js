// カードデータ定義（テスト用の最小セット）。
// カードはデータのみで記述し、効果の処理は effects.js のレジストリ側で実装する。
//
// フィールド:
//   id        : 一意なカードID
//   name      : 日本語名
//   nameEn    : 英語名（カード上では英語名を大きく、日本語名を小さく表示）
//   type      : 'creature' | 'spell'
//   cost      : マナコスト
//   attack/hp : クリーチャーのみ
//   keywords  : 能力キーワード（'haste' = 速攻, 'quick' = 瞬発）
//   effect    : スペルの効果 { type, ...params }（effects.js のキー）
//   triggers  : 誘発能力 [{ on: 'summon' | 'turnStart' | 'turnEnd', effect }]
//   rarity    : レア度（表示用）'common' | 'rare' | 'epic' | 'legendary'。強いカードほど高い
//   text      : ルールテキスト（表示用）

export const RARITIES = Object.freeze({
  common: { name: 'コモン', order: 0 },
  rare: { name: 'レア', order: 1 },
  epic: { name: 'エピック', order: 2 },
  legendary: { name: 'レジェンド', order: 3 },
});

export const KEYWORDS = Object.freeze({
  haste: { name: '速攻', text: '召喚したターンから攻撃できる。' },
  flying: { name: '天翔', text: '天翔を持つクリーチャーでしかブロックできない。' },
  firstStrike: { name: '先制攻撃', text: '戦闘で、先制攻撃を持たないクリーチャーより先にダメージを与える。' },
  vigilance: { name: '番人', text: '攻撃しても行動済みにならない（相手のターンにブロックできる）。' },
  quick: { name: '瞬発', text: '戦闘中にも使える（攻撃宣言の後／ブロック宣言の後）。相手のターン中に使うとコストが1下がる。瞬発クリーチャーは相手の攻撃に合わせて呼び出し、ブロックに使える。' },
  lifesteal: { name: '吸命', text: 'このクリーチャーが与えたダメージと同じだけ、自分のライフを回復する。' },
  deathtouch: { name: '必殺', text: 'このクリーチャーからダメージを受けたクリーチャーは破壊される。' },
  trample: { name: '蹂躙', text: '攻撃してブロックされても、ブロックしたクリーチャーを倒して余ったダメージを相手プレイヤーに与える。' },
  ward: { name: '加護', text: '次に受けるダメージを1回だけ無効にする。' },
  lastWill: { name: '遺志', text: '破壊されたときに効果が発動する。' },
});

// effect.target を持つクリーチャーは「召喚時：対象を選んで効果」。対象がいなければ不発で召喚できる。
const CARD_LIST = [
  // --- クリーチャー ---
  { id: 'c_apprentice', name: '見習い剣士', nameEn: 'Squire', rarity: 'common', type: 'creature', cost: 1, attack: 1, hp: 2 },
  { id: 'c_scout', name: '森の斥候', nameEn: 'Forest Scout', rarity: 'common', type: 'creature', cost: 1, attack: 2, hp: 2, keywords: ['haste'] },
  { id: 'c_shield', name: '盾持ちの兵', nameEn: 'Shieldbearer', rarity: 'common', type: 'creature', cost: 2, attack: 1, hp: 3 },
  { id: 'c_wolf', name: '迅雷の狼', nameEn: 'Thunder Wolf', rarity: 'common', type: 'creature', cost: 2, attack: 3, hp: 2, keywords: ['haste'] },
  {
    id: 'c_messenger', name: '伝令の鳥', nameEn: 'Herald Bird', rarity: 'rare', type: 'creature', cost: 2, attack: 1, hp: 1, keywords: ['flying'],
    triggers: [{ on: 'summon', effect: { type: 'draw', amount: 1 } }],
    text: '召喚時：カードを1枚引く。',
  },
  { id: 'c_warrior', name: '鉄槌の戦士', nameEn: 'Hammer Warrior', rarity: 'common', type: 'creature', cost: 3, attack: 3, hp: 3 },
  { id: 'c_rider', name: '疾風の騎手', nameEn: 'Gale Rider', rarity: 'rare', type: 'creature', cost: 3, attack: 3, hp: 3, keywords: ['haste'] },
  { id: 'c_pikeman', name: '槍衾の衛兵', nameEn: 'Pike Guard', rarity: 'rare', type: 'creature', cost: 3, attack: 2, hp: 3, keywords: ['firstStrike'] },
  { id: 'c_hawk', name: '嵐の鷹', nameEn: 'Storm Hawk', rarity: 'rare', type: 'creature', cost: 3, attack: 3, hp: 2, keywords: ['flying'] },
  {
    id: 'c_salamander', name: '火吹きトカゲ', nameEn: 'Fire Salamander', rarity: 'rare', type: 'creature', cost: 3, attack: 2, hp: 2,
    effect: { type: 'damage', amount: 1, target: 'character' },
    text: '召喚時：クリーチャー1体かプレイヤー1人に1ダメージ。',
  },
  { id: 'c_golem', name: '岩の巨人', nameEn: 'Stone Giant', rarity: 'common', type: 'creature', cost: 4, attack: 2, hp: 5 },
  { id: 'c_knight', name: '番犬の騎士', nameEn: 'Watchdog Knight', rarity: 'rare', type: 'creature', cost: 4, attack: 3, hp: 3, keywords: ['vigilance'] },
  {
    id: 'c_general', name: '戦場の将軍', nameEn: 'Field General', rarity: 'epic', type: 'creature', cost: 5, attack: 3, hp: 3,
    triggers: [{ on: 'summon', effect: { type: 'buffOthers', attack: 1, hp: 1 } }],
    text: '召喚時：自分の他のクリーチャーすべてに+1/+1。',
  },
  { id: 'c_dragon', name: '古竜', nameEn: 'Elder Dragon', rarity: 'legendary', type: 'creature', cost: 7, attack: 6, hp: 6, keywords: ['flying'] },
  // --- スペル ---
  {
    id: 's_arrow', name: '迎撃の矢', nameEn: 'Intercept Arrow', rarity: 'rare', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'damage', amount: 2, target: 'attackingCreature' },
    text: '攻撃している相手のクリーチャー1体に2ダメージを与える。',
  },
  {
    id: 's_might', name: '剛力の薬', nameEn: 'Potion of Might', rarity: 'rare', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'buffTemp', attack: 2, hp: 2, target: 'friendlyCreature' },
    text: '自分のクリーチャー1体はターン終了時まで+2/+2。',
  },
  {
    id: 's_rally', name: '鬨の声', nameEn: 'War Cry', rarity: 'epic', type: 'spell', cost: 2,
    effect: { type: 'buffTempAll', attack: 2, hp: 0 },
    text: '自分のクリーチャーすべてはターン終了時まで+2/+0。',
  },
  {
    id: 's_fireball', name: '火球', nameEn: 'Fireball', rarity: 'epic', type: 'spell', cost: 3,
    effect: { type: 'damage', amount: 3, target: 'character' },
    text: 'クリーチャー1体かプレイヤー1人に3ダメージを与える。',
  },
  {
    id: 's_insight', name: '知識の泉', nameEn: 'Font of Insight', rarity: 'rare', type: 'spell', cost: 3,
    effect: { type: 'draw', amount: 2 },
    text: 'カードを2枚引く。',
  },
  {
    id: 's_wave', name: '炎の波', nameEn: 'Wave of Flame', rarity: 'epic', type: 'spell', cost: 4,
    effect: { type: 'damageAllEnemies', amount: 2 },
    text: '相手のクリーチャーすべてに2ダメージを与える。',
  },
  {
    id: 's_coin', name: 'マナの雫', nameEn: 'Mana Drop', rarity: 'common', type: 'spell', cost: 0, token: true,
    effect: { type: 'gainMana', amount: 1, draw: 1 },
    text: 'このターン、マナを1得る。カードを1枚引く。（後攻がゲーム開始時に1枚受け取る。デッキには入れられない）',
  },
  // --- 拡張（v0.4） ---
  { id: 'c_imp', name: '爆ぜる小鬼', nameEn: 'Ember Imp', rarity: 'common', type: 'creature', cost: 1, attack: 2, hp: 1, keywords: ['lastWill'],
    triggers: [{ on: 'death', effect: { type: 'damageOpponent', amount: 1 } }], text: '遺志：相手プレイヤーに1ダメージ。' },
  { id: 'c_bat', name: '夜霧の蝙蝠', nameEn: 'Mist Bat', rarity: 'rare', type: 'creature', cost: 2, attack: 1, hp: 2, keywords: ['flying', 'lifesteal'] },
  { id: 'c_viper', name: '毒牙の蛇', nameEn: 'Fang Viper', rarity: 'rare', type: 'creature', cost: 2, attack: 1, hp: 2, keywords: ['deathtouch'] },
  { id: 'c_sister', name: '祈りの修道女', nameEn: 'Chapel Sister', rarity: 'common', type: 'creature', cost: 2, attack: 1, hp: 3,
    triggers: [{ on: 'summon', effect: { type: 'gainLife', amount: 2 } }], text: '召喚時：自分のライフを2回復する。' },
  { id: 'c_gravekeeper', name: '墓守の老人', nameEn: 'Old Gravekeeper', rarity: 'common', type: 'creature', cost: 3, attack: 2, hp: 2, keywords: ['lastWill'],
    triggers: [{ on: 'death', effect: { type: 'draw', amount: 1 } }], text: '遺志：カードを1枚引く。' },
  { id: 'c_archer', name: '見張り塔の弓兵', nameEn: 'Tower Archer', rarity: 'common', type: 'creature', cost: 2, attack: 2, hp: 1,
    effect: { type: 'damage', amount: 1, target: 'enemyCreature' }, text: '召喚時：相手のクリーチャー1体に1ダメージ。' },
  { id: 'c_boar', name: '突進する猪', nameEn: 'Charging Boar', rarity: 'common', type: 'creature', cost: 3, attack: 4, hp: 2, keywords: ['trample'] },
  { id: 'c_duelist', name: '毒刃の剣士', nameEn: 'Venomblade', rarity: 'rare', type: 'creature', cost: 3, attack: 2, hp: 2, keywords: ['firstStrike', 'deathtouch'] },
  { id: 'c_assassin', name: '影の暗殺者', nameEn: 'Shadow Assassin', rarity: 'rare', type: 'creature', cost: 3, attack: 2, hp: 1, keywords: ['haste', 'deathtouch'] },
  { id: 'c_packleader', name: '群れの長', nameEn: 'Pack Leader', rarity: 'rare', type: 'creature', cost: 4, attack: 2, hp: 3,
    triggers: [{ on: 'summon', effect: { type: 'summonToken', cardId: 't_pup', count: 2 } }], text: '召喚時：狼の子（1/1・速攻）を2体呼び出す。' },
  { id: 'c_paladin', name: '誓いの聖騎士', nameEn: 'Oathsworn Paladin', rarity: 'rare', type: 'creature', cost: 5, attack: 3, hp: 4, keywords: ['lifesteal'] },
  { id: 'c_warden', name: '森の守り手', nameEn: 'Grove Warden', rarity: 'rare', type: 'creature', cost: 5, attack: 3, hp: 6, keywords: ['ward'] },
  { id: 'c_phoenix', name: '不死鳥', nameEn: 'Phoenix', rarity: 'epic', type: 'creature', cost: 5, attack: 4, hp: 3, keywords: ['flying', 'lastWill'],
    triggers: [{ on: 'death', effect: { type: 'summonToken', cardId: 't_ash', count: 1 } }], text: '遺志：灰の雛（2/2・天翔）を呼び出す。' },
  { id: 'c_bloodlord', name: '吸血公', nameEn: 'Blood Lord', rarity: 'epic', type: 'creature', cost: 6, attack: 4, hp: 4, keywords: ['lifesteal'] },
  { id: 'c_colossus', name: '鋼鉄の巨像', nameEn: 'Iron Colossus', rarity: 'rare', type: 'creature', cost: 6, attack: 6, hp: 6, keywords: ['trample'] },
  { id: 'c_lionking', name: '巨獣ベヒモス', nameEn: 'Behemoth', rarity: 'legendary', type: 'creature', cost: 8, attack: 7, hp: 7, keywords: ['trample', 'ward'] },
  // スペル
  { id: 's_snare', name: '足止めの網', nameEn: 'Snare Net', rarity: 'common', type: 'spell', cost: 1,
    effect: { type: 'exhaust', target: 'enemyCreature' }, text: '相手のクリーチャー1体を行動済みにする（このターン、ブロックできない）。' },
  { id: 's_ward', name: '守護の祝福', nameEn: 'Blessing of Ward', rarity: 'rare', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'grantShield', target: 'friendlyCreature' }, text: '自分のクリーチャー1体に加護を与える。' },
  { id: 's_lance', name: '雷の槍', nameEn: 'Thunder Lance', rarity: 'common', type: 'spell', cost: 2, keywords: ['quick'],
    effect: { type: 'damage', amount: 2, target: 'enemyCreature' }, text: '相手のクリーチャー1体に2ダメージを与える。' },
  { id: 's_recall', name: '送還の風', nameEn: 'Recall Wind', rarity: 'rare', type: 'spell', cost: 2,
    effect: { type: 'bounce', target: 'creature' }, text: 'クリーチャー1体を持ち主の手札に戻す。' },
  { id: 's_prayer', name: '癒しの祈り', nameEn: 'Healing Prayer', rarity: 'common', type: 'spell', cost: 3,
    effect: { type: 'gainLife', amount: 4, draw: 1 }, text: '自分のライフを4回復し、カードを1枚引く。' },
  { id: 's_judgment', name: '断罪の剣', nameEn: 'Sword of Judgment', rarity: 'legendary', type: 'spell', cost: 6,
    effect: { type: 'destroyAll' }, text: '場のクリーチャーをすべて破壊する（自分のクリーチャーも。加護も無視する）。' },
  // --- 瞬発（v0.5） ---
  { id: 'c_ambusher', name: '伏兵の槍兵', nameEn: 'Ambush Spearman', rarity: 'common', type: 'creature', cost: 2, attack: 2, hp: 3, keywords: ['quick'] },
  { id: 'c_owl', name: '夜番の梟', nameEn: 'Night Owl', rarity: 'rare', type: 'creature', cost: 3, attack: 2, hp: 3, keywords: ['quick', 'flying'] },
  { id: 'c_stalker', name: '闇潜みの刺客', nameEn: 'Gloom Stalker', rarity: 'epic', type: 'creature', cost: 3, attack: 2, hp: 2, keywords: ['quick', 'deathtouch'] },
  { id: 's_riposte', name: '返し刃', nameEn: 'Riposte', rarity: 'common', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'buffTemp', attack: 3, hp: 0, target: 'friendlyCreature' }, text: '自分のクリーチャー1体はターン終了時まで+3/+0。' },
  { id: 's_sidestep', name: '見切り', nameEn: 'Sidestep', rarity: 'rare', type: 'spell', cost: 2, keywords: ['quick'],
    effect: { type: 'bounce', target: 'attackingCreature' }, text: '攻撃している相手のクリーチャー1体を持ち主の手札に戻す。' },
  { id: 's_veil', name: '霧隠れ', nameEn: 'Mist Veil', rarity: 'common', type: 'spell', cost: 1, keywords: ['quick'],
    effect: { type: 'bounce', target: 'friendlyCreature' }, text: '自分のクリーチャー1体を手札に戻す。' },
  // トークン（効果で呼び出されるだけで、デッキには入れられない）
  { id: 't_pup', name: '狼の子', nameEn: 'Wolf Pup', rarity: 'common', type: 'creature', cost: 1, attack: 1, hp: 1, keywords: ['haste'], token: true },
  { id: 't_ash', name: '灰の雛', nameEn: 'Ash Hatchling', rarity: 'common', type: 'creature', cost: 2, attack: 2, hp: 2, keywords: ['flying'], token: true },
  // 旧テストカード（デッキには入れていない。テスト用に残す）
  {
    id: 's_mend', name: '癒しの光', nameEn: 'Mending Light', rarity: 'common', type: 'spell', cost: 1, keywords: ['quick'],
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
    text: '速攻と天翔、蹂躙で一気にライフを削る。',
    counts: {
      c_scout: 3, c_wolf: 3, c_warrior: 2, c_rider: 3, c_hawk: 3, c_boar: 3,
      c_assassin: 2, c_packleader: 2, c_general: 1, s_rally: 2, c_imp: 2, s_fireball: 3, s_snare: 1,
    },
  },
  fortress: {
    name: '城塞（防御型）',
    text: '加護と除去で耐え、古竜とベヒモスで決める。',
    counts: {
      c_shield: 2, c_sister: 3, c_viper: 2, c_pikeman: 3, c_knight: 2, c_warden: 3, c_dragon: 2, c_lionking: 1,
      s_arrow: 3, s_ward: 2, s_lance: 2, s_wave: 2, s_judgment: 1, s_insight: 2,
    },
  },
  balance: {
    name: '均衡（標準型）',
    text: '序盤から終盤まで満遍なく戦える。',
    counts: {
      c_apprentice: 2, c_archer: 3, c_messenger: 2, c_warrior: 3, c_duelist: 2, c_salamander: 2,
      c_golem: 3, c_paladin: 1, c_general: 2, c_colossus: 2, c_dragon: 1,
      s_lance: 3, s_might: 1, s_recall: 1, s_fireball: 2,
    },
  },
  night: {
    name: '冥夜（遺志・吸命型）',
    text: '倒れても力を残す遺志と、ライフを奪う吸命でじわじわ押し切る。',
    counts: {
      c_imp: 2, c_gravekeeper: 3, c_bat: 3, c_messenger: 2, c_salamander: 2, c_warrior: 1,
      c_phoenix: 2, c_paladin: 2, c_bloodlord: 1, c_assassin: 1, c_archer: 1,
      s_prayer: 1, s_lance: 3, s_recall: 2, s_ward: 2, s_judgment: 1, s_insight: 1,
    },
  },
  shadow: {
    name: '影刃（瞬発型）',
    text: 'マナを残して構え、相手の攻撃に瞬発で切り返す。',
    counts: {
      c_ambusher: 3, c_owl: 3, c_stalker: 2, c_pikeman: 2, c_messenger: 2, c_knight: 2, c_dragon: 1, c_apprentice: 1,
      s_arrow: 3, s_riposte: 3, s_sidestep: 3, s_lance: 3, s_ward: 2,
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
