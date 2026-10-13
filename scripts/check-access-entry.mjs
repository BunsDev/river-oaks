// The access gate is the page a signed-out visitor sees, so everything it loads must
// be served before sign-in. The asset gate (server/game-assets.js, used by
// middleware.js and server/app.js) refuses game chunks until an account is approved.
// A module the access entry shares with game code is split into a chunk of its own,
// refused, and the sign-in page never starts. That happened on 2026-10-13 (#314),
// when the access entry imported resident-names.js. This walks the built /play
// page's module graph (module scripts, module preloads and stylesheets, then each
// chunk's static imports) and asks the asset gate about every file.
// Classic scripts (the first-paint boot script in <head>) are roots too: they run on
// the sign-in page, so they must be served before sign-in as well. Dynamic imports
// load after approval and are not followed.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { protectedGameAsset } from '../server/game-assets.js';

// The built site (dist/preview by default; a directory argument for tests).
const dist = process.argv[2] ? pathToFileURL(`${process.argv[2].replace(/\/$/, '')}/`) : new URL('../dist/preview/', import.meta.url);
const html = await readFile(new URL('play/index.html', dist), 'utf8');
// HTML tag and attribute names ignore case, and values may use either quote or none.
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] : null;
};
const roots = [];
let modules = 0;
for (const [tag, element] of html.matchAll(/<(script|link)\b[^>]*>/gi)) {
  const kind = element.toLowerCase(), type = attribute(tag, 'type')?.toLowerCase(), rel = attribute(tag, 'rel')?.toLowerCase();
  if (kind === 'script' && attribute(tag, 'src')) { roots.push(attribute(tag, 'src')); if (type === 'module') modules++; }
  if (kind === 'link' && ['modulepreload', 'stylesheet'].includes(rel) && attribute(tag, 'href')) roots.push(attribute(tag, 'href'));
}
if (!modules) throw new Error('check-access-entry: no module script found in dist/preview/play/index.html');

const seen = new Set(), refused = [];
async function visit(path) {
  if (!path.startsWith('/') || seen.has(path)) return;
  seen.add(path);
  if (protectedGameAsset(path)) refused.push(path);
  if (!path.endsWith('.js')) return;
  const code = await readFile(new URL(`.${path}`, dist), 'utf8');
  // Static `import … from "./x.js"`, bare `import "./x.js"` and `export … from "./x.js"`;
  // never `import("./x.js")`.
  for (const [, specifier] of code.matchAll(/\b(?:import|export)\s*(?:[^'"()]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g)) {
    await visit(new URL(specifier, `http://dist${path}`).pathname);
  }
}
for (const root of roots) await visit(root);

if (refused.length) {
  console.error(`The sign-in page loads files the asset gate refuses before sign-in:\n${refused.map(path => `  ${path}`).join('\n')}`);
  console.error('Keep modules the access entry imports out of game code (or import-free and access-only) so they stay in its own chunk; do not widen the asset gate to make this pass.');
  process.exit(1);
}
console.log(`Sign-in page: ${seen.size} files, all served before sign-in.`);
