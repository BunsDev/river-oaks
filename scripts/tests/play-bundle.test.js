// The play-only build target (#286): the Vite config's target selection, and the
// manifest that classifies and checks what a packaged play client would carry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BUILD_TARGET_ENV, buildInputs, buildOutDir, buildTarget } from '../../preview/build-target.js';
import { buildManifest, cacheRules, classifyPath, devTargetsIn, excludedReason, main } from '../play-bundle-manifest.mjs';

test('the build target comes from the environment and defaults to the deployed site', () => {
  assert.equal(buildTarget({}), 'web');
  assert.equal(buildTarget({ [BUILD_TARGET_ENV]: '' }), 'web');
  assert.equal(buildTarget({ [BUILD_TARGET_ENV]: 'web' }), 'web');
  assert.equal(buildTarget({ [BUILD_TARGET_ENV]: 'play' }), 'play');
  assert.throws(() => buildTarget({ [BUILD_TARGET_ENV]: 'ios' }), /RIVER_OAKS_BUILD_TARGET must be one of web, play/);
});

test('the play target builds the play entry alone into its own directory', () => {
  const root = new URL('file:///repo/preview/');
  assert.deepEqual(Object.keys(buildInputs('web', root)), ['index', 'studio']);
  assert.deepEqual(Object.keys(buildInputs('play', root)), ['index']);
  assert.match(buildInputs('play', root).index, /[\\/]preview[\\/]index\.html$/);
  assert.equal(buildOutDir('web'), '../dist/preview');
  assert.equal(buildOutDir('play'), '../dist/play');
  assert.notEqual(buildOutDir('play'), buildOutDir('web'), 'a play build never overwrites the deployed site build');
  assert.throws(() => buildInputs('ios', root), /Unknown build target/);
  assert.throws(() => buildOutDir('ios'), /Unknown build target/);
});

test('bundle paths are classified exactly as the deployed site serves them', () => {
  const rules = cacheRules();
  assert.ok(rules.length >= 3, 'vercel.json has Cache-Control rules');
  const c = path => classifyPath(path, rules);
  // Served before sign-in: the play page, the boot script, the access entry and its helpers.
  assert.deepEqual(c('/index.html'), { gated: false, cache: null });
  assert.deepEqual(c('/assets/boot/first-paint.js'), { gated: false, cache: 'private, no-store' });
  assert.equal(c('/assets/index-CNRjY3SK.js').gated, false);
  assert.equal(c('/assets/preload-helper-BLdHbfdN.js').gated, false);
  assert.equal(c('/assets/debug-report-ui-C06plHs6.js').gated, false);
  // Game code and world data need an approved account.
  assert.deepEqual(c('/assets/main-EuGl3Tsb.js'), { gated: true, cache: 'private, no-store' });
  assert.deepEqual(c('/assets/three-DuRrnEmi.js'), { gated: true, cache: 'private, no-store' });
  assert.deepEqual(c('/assets/main-CTUOkb_X.css'), { gated: true, cache: 'private, no-store' });
  assert.deepEqual(c('/data/district.json'), { gated: true, cache: 'private, no-store' });
  assert.equal(c('/data/building-interiors/x.json').gated, true);
  // Models, textures and the approved films are public and cached for an hour.
  assert.deepEqual(c('/assets/characters/jevica.glb'), { gated: false, cache: 'public, max-age=3600, stale-while-revalidate=86400' });
  assert.equal(c('/assets/landscape/sky.hdr').cache, 'public, max-age=3600, stale-while-revalidate=86400');
  assert.equal(c('/assets/login/jev-jevica-modest-standing.jpg').cache, 'public, max-age=3600, stale-while-revalidate=86400');
  assert.equal(c('/assets/ipic/screening/two-seats.mp4').cache, 'public, max-age=3600, stale-while-revalidate=86400');
  // Other asset files are not gated but are never cached publicly.
  assert.deepEqual(c('/assets/characters/sources.json'), { gated: false, cache: 'private, no-store' });
  assert.deepEqual(c('/assets/login/jev-jevica-modest-standing.mp4'), { gated: false, cache: 'private, no-store' });
  assert.deepEqual(c('/fonts/typesafe/x.woff2'), { gated: false, cache: null });
});

test('a packaged play client must not carry the site around the game, or a dev proxy target', () => {
  assert.equal(excludedReason('/landing-page/index.html'), 'landing page');
  assert.equal(excludedReason('/studio.html'), 'studio');
  assert.equal(excludedReason('/assets/studio-Cd-Jtsfe.js'), 'studio');
  assert.equal(excludedReason('/desktop/main.js'), 'Electron');
  assert.equal(excludedReason('/assets/electron-preload.js'), 'Electron');
  assert.equal(excludedReason('/src/river_oaks/decision.py'), 'Python');
  assert.equal(excludedReason('/.runtime/agent/core.json'), 'runtime state');
  assert.equal(excludedReason('/.env'), 'environment file');
  assert.equal(excludedReason('/preview/.env.local'), 'environment file');
  assert.equal(excludedReason('/server/app.js'), 'server source');
  assert.equal(excludedReason('/assets/main-abc.js.map'), 'source map');
  assert.equal(excludedReason('/index.html'), null);
  assert.equal(excludedReason('/assets/main-EuGl3Tsb.js'), null);
  assert.equal(excludedReason('/assets/characters/jevica.glb'), null);
  assert.equal(excludedReason('/data/district.json'), null);
  assert.deepEqual(devTargetsIn('fetch("/api/multiplayer/ticket")'), []);
  // Hostname lists in the client (loopback detection) are not dev targets.
  assert.deepEqual(devTargetsIn('["127.0.0.1","localhost","[::1]"]'), []);
  assert.deepEqual(devTargetsIn('const town = "http://127.0.0.1:8787";'), ['127.0.0.1:8787']);
  assert.deepEqual(devTargetsIn('new WebSocket("ws://127.0.0.1:8787/multiplayer")'), ['127.0.0.1:8787', 'ws://127.0.0.1:']);
});

function bundle(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'river-play-bundle-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test('the manifest records every file with its size, hash and classification', t => {
  const dir = bundle(t, {
    'index.html': '<!doctype html><script type="module" src="/assets/index-abc123.js"></script>',
    'assets/index-abc123.js': 'import("./main-def456.js")',
    'assets/main-def456.js': 'export const world = 1;',
    'assets/boot/first-paint.js': 'document.documentElement.dataset.returning = "1";',
    'assets/characters/jevica.glb': Buffer.from([0x67, 0x6c, 0x54, 0x46]),
    'data/district.json': '{"blocks":[]}',
  });
  const manifest = buildManifest(dir);
  assert.equal(manifest.target, 'play');
  assert.deepEqual(manifest.problems, []);
  assert.deepEqual(manifest.files.map(f => f.path), ['/assets/boot/first-paint.js', '/assets/characters/jevica.glb', '/assets/index-abc123.js', '/assets/main-def456.js', '/data/district.json', '/index.html']);
  const main = manifest.files.find(f => f.path === '/assets/main-def456.js');
  assert.equal(main.bytes, 'export const world = 1;'.length);
  assert.equal(main.sha256, createHash('sha256').update('export const world = 1;').digest('hex'));
  assert.equal(main.gated, true);
  assert.equal(manifest.files.find(f => f.path === '/assets/index-abc123.js').gated, false);
  assert.equal(manifest.files.find(f => f.path === '/data/district.json').gated, true);
  assert.equal(manifest.totals.files, 6);
  assert.equal(manifest.totals.bytes, manifest.files.reduce((sum, f) => sum + f.bytes, 0));
  assert.deepEqual(manifest.totals.gated, { files: 2, bytes: main.bytes + '{"blocks":[]}'.length });
  assert.equal(manifest.totals.cache['public, max-age=3600, stale-while-revalidate=86400'].files, 1);
});

test('the check refuses a bundle with the site around the game, dev targets or no entry', t => {
  const dir = bundle(t, {
    'index.html': '<!doctype html>',
    'assets/index-abc123.js': 'const town = "http://127.0.0.1:8787";',
    'assets/studio-xyz.js': '',
    'landing-page/index.html': '<!doctype html>',
    'studio.html': '<!doctype html>',
    '.runtime/agent/core.json': '{}',
    'src/river_oaks/decision.py': 'print(1)',
  });
  const manifest = buildManifest(dir);
  assert.deepEqual(manifest.problems, [
    { path: '/.runtime/agent/core.json', problem: 'runtime state' },
    { path: '/assets/index-abc123.js', problem: 'dev target 127.0.0.1:8787' },
    { path: '/assets/studio-xyz.js', problem: 'studio' },
    { path: '/landing-page/index.html', problem: 'landing page' },
    { path: '/src/river_oaks/decision.py', problem: 'Python' },
    { path: '/studio.html', problem: 'studio' },
  ]);
  assert.deepEqual(buildManifest(bundle(t, { 'assets/main-abc.js': '' })).problems, [
    { path: '/index.html', problem: 'missing play entry' },
    { path: '/assets/index-*.js', problem: 'missing access entry chunk' },
  ]);
  // The command writes the manifest either way and fails only with --check.
  const out = join(dir, '..', `river-play-manifest-${process.pid}.json`);
  t.after(() => rmSync(out, { force: true }));
  const logs = [], errors = [];
  t.mock.method(console, 'log', message => logs.push(message));
  t.mock.method(console, 'error', message => errors.push(message));
  assert.equal(main([dir, '--out', out]), 0);
  assert.equal(main([dir, '--out', out, '--check']), 1);
  assert.match(errors[0], /studio\.html: studio/);
  assert.match(logs[0], /Play bundle: 7 files/);
  assert.throws(() => main([dir, '--bogus']), /Unknown option --bogus/);
});
