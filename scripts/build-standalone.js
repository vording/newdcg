// ブラウザUIを1つのHTMLファイルにまとめる（配布・公開用）。
// 使い方: node scripts/build-standalone.js [出力先=dist/dcg.html]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.argv[2] ?? `${root}dist/dcg.html`;
const read = (p) => readFileSync(root + p, 'utf8');

// 依存順。各モジュールの import / export を取り除いて1つのモジュールスコープに連結する。
const modules = [
  'src/engine/config.js', 'src/engine/cards.js', 'src/engine/state.js', 'src/engine/effects.js',
  'src/engine/game.js', 'src/ai/simple-ai.js', 'src/ui/ui.js',
];
const strip = (src) => src
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
  .replace(/^export\s+(?=(const|function|let|class|async)\b)/gm, '');
const js = modules.map((m) => `// ---- ${m} ----\n${strip(read(m))}`).join('\n');

const html = read('src/ui/index.html');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module" src="ui.js"><\/script>/, '');

const page = `<title>DCG プロトタイプ</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${read('src/ui/style.css')}
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`wrote ${out} (${page.length} bytes)`);
