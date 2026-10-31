// ブラウザUI用の簡易静的サーバー（依存なし）。 node scripts/serve.js [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] ?? 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/') { res.writeHead(302, { location: '/src/ui/index.html' }).end(); return; }
  const file = normalize(join(root, path));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': `${types[extname(file)] ?? 'application/octet-stream'}; charset=utf-8` });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));
