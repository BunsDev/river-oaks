import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, dirname } from 'node:path';
import { DESKTOP_FILES } from '../package-files.js';

const desktop = fileURLToPath(new URL('../', import.meta.url));
// Static and bare imports, dynamic import(), require() and the preload path given to Electron.
const SPECIFIERS = /(?:from\s+|import\s+|import\s*\(\s*|require\s*\(\s*|new URL\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
// A computed specifier cannot be followed statically, so it is refused outright.
const COMPUTED = /(?:import|require)\s*\(\s*`/;

test('the packaged app includes every desktop module main.js loads', async () => {
  const seen = new Set(), queue = ['main.js'];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = await readFile(join(desktop, file), 'utf8');
    assert.doesNotMatch(source, COMPUTED, `${file} uses a computed import the package check cannot follow`);
    for (const [, specifier] of source.matchAll(SPECIFIERS)) {
      const target = normalize(join(dirname(file), specifier));
      // Files outside desktop/ (scripts/studio-skill-pack.js) are staged separately by package.js.
      if (!target.startsWith('..') && /\.(c?js)$/.test(target)) queue.push(target);
    }
  }
  const missing = [...seen].filter(file => !DESKTOP_FILES.includes(file));
  assert.deepEqual(missing, [], `package.js would omit: ${missing.join(', ')}`);
  assert.ok(seen.has('studio-agent-host.js') && seen.has('studio-preload.cjs'), 'the walk reached the agent host and preload');
});
