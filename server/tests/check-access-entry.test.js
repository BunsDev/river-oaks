import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// scripts/check-access-entry.mjs runs after every build: the sign-in page must load
// only files the asset gate serves before sign-in. A synthetic build stands in for
// dist/preview so the cases do not depend on what Vite happens to split today.
const script = fileURLToPath(new URL('../../scripts/check-access-entry.mjs', import.meta.url));

async function site(t, html, files) {
  const root = await mkdtemp(join(tmpdir(), 'river-access-entry-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'play'), { recursive: true }); await mkdir(join(root, 'assets'), { recursive: true });
  await writeFile(join(root, 'play/index.html'), html);
  for (const [name, code] of Object.entries(files)) { await mkdir(dirname(join(root, 'assets', name)), { recursive: true }); await writeFile(join(root, 'assets', name), code); }
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
}

test('the sign-in page check refuses a gated chunk reached by a static import, whatever the tag case', async t => {
  const result = await site(t, '<!doctype html><HEAD><SCRIPT TYPE=module SRC=/assets/index-abc.js></SCRIPT><LINK REL="modulepreload" HREF=\'/assets/preload-helper-x1.js\'></HEAD>', {
    'index-abc.js': 'import{t as e}from"./resident-names-x9.js";import"./index-abc.css";const go=()=>import("./main-y7.js");export{e as n};',
    'resident-names-x9.js': 'export const t=1;', 'index-abc.css': '', 'preload-helper-x1.js': '', 'main-y7.js': '',
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /\/assets\/resident-names-x9\.js/);
  assert.doesNotMatch(result.stderr, /main-y7/, 'a dynamic import loads after approval and is not followed');
  assert.doesNotMatch(result.stderr, /index-abc|preload-helper/, 'the access entry and preload helper are served before sign-in');
});

test('the sign-in page check passes when everything it loads is served before sign-in', async t => {
  const result = await site(t, '<script type="module" crossorigin src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index-abc.css">', {
    'index-abc.js': 'import"./debug-report-q2.js";const go=()=>import("./main-y7.js");', 'debug-report-q2.js': '', 'index-abc.css': '',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Sign-in page: 3 files, all served before sign-in/);
});

// The first-paint boot script is a classic <script src> in <head> (#297): it runs on the
// sign-in page, so the check follows classic scripts too, and the gate must serve it.
test('the sign-in page check covers classic scripts: the first-paint boot script passes, another refuses', async t => {
  const page = boot => `<script src="${boot}"></script><script type="module" src="/assets/index-abc.js"></script>`;
  const passing = await site(t, page('/assets/boot/first-paint.js'), { 'boot/first-paint.js': '(()=>{})();', 'index-abc.js': '' });
  assert.equal(passing.status, 0, passing.stderr);
  assert.match(passing.stdout, /Sign-in page: 2 files, all served before sign-in/);
  const refused = await site(t, page('/assets/boot/other.js'), { 'boot/other.js': '', 'index-abc.js': '' });
  assert.equal(refused.status, 1, refused.stdout);
  assert.match(refused.stderr, /\/assets\/boot\/other\.js/);
  // A page with only a classic script still has no access entry.
  assert.equal((await site(t, '<script src="/assets/boot/first-paint.js"></script>', { 'boot/first-paint.js': '' })).status, 1);
});

test('the sign-in page check follows a lazy import the gate serves before sign-in, not one it gates', async t => {
  // The problem report loads lazily on the sign-in page; a shared chunk it imports is
  // refused there (#modal-outside-dismiss, 2026-10-13). The game chunk loads after approval.
  const result = await site(t, '<script type="module" src="/assets/index-abc.js"></script>', {
    'index-abc.js': 'const report=async()=>{let{openReportDialog:e}=await import(`./debug-report-ui-r1.js`);return e};const game=()=>import("./main-y7.js");',
    'debug-report-ui-r1.js': 'import{d as e}from"./modal-dismiss-m4.js";export{e};', 'modal-dismiss-m4.js': '', 'main-y7.js': 'import"./three-z9.js";', 'three-z9.js': '',
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /\/assets\/modal-dismiss-m4\.js/);
  assert.doesNotMatch(result.stderr, /main-y7|three-z9|debug-report-ui/, 'the game loads after approval; the report chunk itself is served');
});
