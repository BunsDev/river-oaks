import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, dirname } from 'node:path';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from '../package-files.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Static and bare imports, dynamic import(), require() and the preload path given to Electron.
const SPECIFIERS = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
// A computed specifier cannot be followed statically, so it is refused outright.
const COMPUTED = /(?:import|require)\s*\(\s*`/;

test('the packaged app includes every desktop module main.js loads', async () => {
  const seen = new Set(), queue = ['desktop/main.js'], staged=new Set([...DESKTOP_FILES.map(file=>`desktop/${file}`),...DESKTOP_SHARED_FILES]);
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(staged.has(file),`package.js would omit: ${file}`);
    const source = await readFile(join(root, file), 'utf8');
    assert.doesNotMatch(source, COMPUTED, `${file} uses a computed import the package check cannot follow`);
    for (const [, specifier] of source.matchAll(SPECIFIERS)) {
      const target = normalize(join(dirname(file), specifier));
      if (/\.(c?js)$/.test(target)) queue.push(target);
    }
  }
  const missing = [...seen].filter(file => !staged.has(file));
  assert.deepEqual(missing, [], `package.js would omit: ${missing.join(', ')}`);
  assert.ok(seen.has('desktop/studio-agent-host.js') && seen.has('desktop/studio-preload.cjs') && seen.has('shared/studio-space-catalog.js'), 'the walk reached the agent host and preload');
});
