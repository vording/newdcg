// src/ui/art/ のカードイラストを読み込み、src/ui/art-data.js（data URI の一覧）を作る。
// ファイル名はカードID・日本語名・英語名のどれでもよい（例: c_dragon.webp / 古竜.png / Elder Dragon.jpg）。
// 対応形式: webp / png / jpg / jpeg
// build-standalone.js から自動で呼ばれる。単体でも実行可: node scripts/build-art.js
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../src/engine/cards.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = `${root}src/ui/art/`;
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// ファイル名 → カードID の対応（ID・日本語名・英語名。英語名は大文字小文字・空白・_・- を区別しない）
const norm = (t) => t.normalize('NFC').toLowerCase().replace(/[\s_\-・]/g, '');
const LOOKUP = new Map();
for (const c of Object.values(CARDS)) {
  for (const key of [c.id, c.name, c.nameEn]) if (key) LOOKUP.set(norm(key), c.id);
}

export function buildArt() {
  const entries = [];
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  for (const f of files) {
    const mime = MIME[extname(f).toLowerCase()];
    if (!mime) continue;
    const id = LOOKUP.get(norm(basename(f, extname(f))));
    if (!id) throw new Error(`src/ui/art/${f}: どのカードの絵か分かりません（カードID・日本語名・英語名のいずれかにしてください）`);
    if (entries.some((e) => e.startsWith(`  ${id}:`))) throw new Error(`src/ui/art/${f}: ${CARDS[id].name} の絵が2つあります`);
    const buf = readFileSync(dir + f);
    if (buf.length > 400 * 1024) console.warn(`注意: ${f} は ${Math.round(buf.length / 1024)}KB あります。公開ページが重くなるので、長辺1000px程度・WebP に縮小するのがおすすめです。`);
    const b64 = buf.toString('base64');
    entries.push(`  ${id}: 'data:${mime};base64,${b64}',`);
  }
  const js = `// 自動生成（scripts/build-art.js）。直接編集しないこと。\n// カードIDごとのイラスト（data URI）。\nexport const ART = {\n${entries.join('\n')}\n};\n`;
  writeFileSync(`${root}src/ui/art-data.js`, js);
  return entries.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`イラスト ${buildArt()} 枚を src/ui/art-data.js に書き出しました`);
}
