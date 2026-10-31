import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('公開用 index.html が最新のソースからビルドされている（古ければ npm run build:pages）', () => {
  const tmp = `${root}dist/.index.check.html`;
  execFileSync(process.execPath, [`${root}scripts/build-standalone.js`, '--full', tmp]);
  assert.equal(readFileSync(`${root}index.html`, 'utf8'), readFileSync(tmp, 'utf8'));
});
