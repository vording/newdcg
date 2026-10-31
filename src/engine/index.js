// エンジンの公開API
export * from './game.js';
export { DEFAULT_CONFIG, makeConfig } from './config.js';
export { CARDS, DECKS, KEYWORDS, RARITIES, deckList, getCard, hasKeyword, testDeck, validateDeck } from './cards.js';
export { legalTargets, sameTarget, EFFECTS } from './effects.js';
export { remainingHp, opponentOf } from './state.js';
