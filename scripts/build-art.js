// src/ui/art/ のカードイラストを読み込み、src/ui/art-data.js（data URI の一覧）を作る。
// ファイル名はカードID（例: c_dragon.webp）。対応形式: webp / png / jpg / jpeg
// build-standalone.js から自動で呼ばれる。単体でも実行可: node scripts/build-art.js
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../src/engine/cards.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = `${root}src/ui/art/`;
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

export function buildArt() {
  const entries = [];
  const files = existsSync(dir) ? readdirSync(dir).sort() : [];
  for (const f of files) {
    const mime = MIME[extname(f).toLowerCase()];
    if (!mime) continue;
    const id = basename(f, extname(f));
    if (!CARDS[id]) throw new Error(`src/ui/art/${f}: カードID "${id}" は存在しません`);
    const b64 = readFileSync(dir + f).toString('base64');
    entries.push(`  ${id}: 'data:${mime};base64,${b64}',`);
  }
  const js = `// 自動生成（scripts/build-art.js）。直接編集しないこと。\n// カードIDごとのイラスト（data URI）。\nexport const ART = {\n${entries.join('\n')}\n};\n`;
  writeFileSync(`${root}src/ui/art-data.js`, js);
  return entries.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`イラスト ${buildArt()} 枚を src/ui/art-data.js に書き出しました`);
}
