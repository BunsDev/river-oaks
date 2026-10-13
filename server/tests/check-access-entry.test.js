import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  for (const [name, code] of Object.entries(files)) await writeFile(join(root, 'assets', name), code);
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
