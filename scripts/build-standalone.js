// ブラウザUIを1つのHTMLファイルにまとめる（配布・公開用）。
// 使い方:
//   node scripts/build-standalone.js [出力先=dist/dcg.html]          … 本文のみ（Claude Artifact 用）
//   node scripts/build-standalone.js --full [出力先=index.html]     … 完全なHTML文書（GitHub Pages 用）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { buildArt } from './build-art.js';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const full = args.includes('--full');
const outArg = args.find((a) => a !== '--full');
const out = outArg ?? (full ? `${root}index.html` : `${root}dist/dcg.html`);
const read = (p) => readFileSync(root + p, 'utf8');

buildArt();

// 依存順。各モジュールの import / export を取り除いて1つのモジュールスコープに連結する。
const modules = [
  'src/engine/config.js', 'src/engine/cards.js', 'src/engine/state.js', 'src/engine/effects.js',
  'src/engine/game.js', 'src/ai/simple-ai.js', 'src/ui/art-data.js', 'src/ui/sound.js', 'src/ui/ui.js',
];
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(?=(const|function|let|class|async)\b)/gm, '');
const js = modules.map((m) => `// ---- ${m} ----\n${strip(read(m))}`).join('\n');

// 1つのスコープに連結するので、モジュール間でトップレベルの名前が重複すると後の定義が前を上書きしてしまう。
// 重複があればビルドを失敗させる。
const owner = new Map();
for (const m of modules) {
  for (const [, name] of strip(read(m)).matchAll(/^(?:async\s+)?(?:function\*?|const|let|class|var)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (owner.has(name)) throw new Error(`トップレベルの名前 "${name}" が ${owner.get(name)} と ${m} で重複しています`);
    owner.set(name, m);
  }
}

const html = read('src/ui/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="ui.js"><\/script>/, '');

const head = full
  ? `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>カードバトル（タイトル未定）</title>`
  : `<title>カードバトル（タイトル未定）</title>
<meta name="claude:viewport-fit-sides" content="cover">`;
// ビルド識別子（どの版が表示されているか画面で確認するため）
const css = read('src/ui/style.css');
const rev = createHash('sha256').update(js + css + body).digest('hex').slice(0, 7);
const buildId = `v0.3 build ${rev}`;

// 実行時エラーを画面に表示する（真っ白・テキストだけになる問題の切り分け用）
const errorHandler = `<script>
window.addEventListener('error', function (e) {
  var t = document.body;
  var p = document.createElement('p');
  p.className = 'fatal';
  p.textContent = 'エラーが発生しました: ' + (e.message || e) + (e.lineno ? ' (line ' + e.lineno + ')' : '');
  t.appendChild(p);
});
</script>`;

const page = `${head}
<style>
${css}
</style>
${full ? '</head>\n<body>\n' : ''}${body.trim()}
${errorHandler}
<script>
(function () {
'use strict';
${js}
document.getElementById('build').textContent = ${JSON.stringify(buildId)};
})();
</script>
${full ? '</body>\n</html>\n' : ''}`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${page.length} bytes)`);
