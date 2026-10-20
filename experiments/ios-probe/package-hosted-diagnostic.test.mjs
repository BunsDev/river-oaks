import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageDiagnostic, diagnosticConfig } from './package-hosted-diagnostic.mjs';
import { protectedGameAsset } from '../../server/game-assets.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ios-diagnostic-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const normal = join(root, 'normal'), diagnostic = join(root, 'diagnostic');
  for (const path of [join(normal, 'assets'), join(normal, 'play'), join(diagnostic, 'assets')]) await mkdir(path, { recursive: true });
  await writeFile(join(normal, 'play/index.html'), 'normal play');
  await writeFile(join(normal, 'index.html'), 'landing');
  await writeFile(join(normal, 'assets/main-normal01.js'), 'normal world');
  await writeFile(join(diagnostic, 'index.html'), '<script type="module" src="/assets/index-audit001.js"></script>');
  await writeFile(join(diagnostic, 'assets/index-audit001.js'), 'auth entry');
  await writeFile(join(diagnostic, 'assets/main-audit001.js'), 'diagnostic world');
  return { normal, diagnostic };
}
test('adds a separate entry while preserving existing play/assets and auth path classification', async t => {
  const paths = await fixture(t); const receipt = await packageDiagnostic(paths);
  assert.equal(await readFile(join(paths.normal, 'play/index.html'), 'utf8'), 'normal play');
  assert.equal(await readFile(join(paths.normal, 'index.html'), 'utf8'), 'landing');
  assert.equal(await readFile(join(paths.normal, 'assets/main-normal01.js'), 'utf8'), 'normal world');
  assert.equal(await readFile(join(paths.normal, 'ios-probe/index.html'), 'utf8'), await readFile(join(paths.diagnostic, 'index.html'), 'utf8'));
  assert.equal(protectedGameAsset('/assets/index-audit001.js'), false);
  assert.equal(protectedGameAsset('/assets/main-audit001.js'), true);
  assert.equal(receipt.added.length, 3);
});
test('fails before mutation on a differing filename collision and is idempotent for identical files', async t => {
  const paths = await fixture(t);
  await writeFile(join(paths.normal, 'assets/main-audit001.js'), 'different bytes');
  await assert.rejects(packageDiagnostic(paths), /collision/);
  await assert.rejects(readFile(join(paths.normal, 'ios-probe/index.html')), { code: 'ENOENT' });
  await writeFile(join(paths.normal, 'assets/main-audit001.js'), 'diagnostic world');
  await packageDiagnostic(paths);
  assert.equal((await packageDiagnostic(paths)).added.length, 0);
});
test('refuses aliases and creates a per-command config preserving all existing deployment boundaries', async t => {
  const paths = await fixture(t);
  await assert.rejects(packageDiagnostic({ normal: paths.normal, diagnostic: paths.normal }), /separate/);
  const config = { buildCommand: 'normal', headers: [{ source: '/assets/(.*)', headers: [{ key: 'test', value: 'preserve' }] }], rewrites: [{ source: '/auth', destination: '/api' }] };
  const updated = diagnosticConfig(config);
  assert.deepEqual(updated.headers, config.headers); assert.deepEqual(updated.rewrites, config.rewrites);
  assert.equal(config.buildCommand, 'normal');
  assert.match(updated.buildCommand, /^corepack pnpm run build && /);
});

test('rejects destination directory links before writing outside the build', async t => {
  for (const directory of ['assets', 'ios-probe']) {
    const paths = await fixture(t);
    const outside = join(paths.diagnostic, 'outside');
    await mkdir(outside);
    await rm(join(paths.normal, directory), { recursive: true, force: true });
    await symlink(outside, join(paths.normal, directory));
    await assert.rejects(packageDiagnostic(paths), /directory/);
    await assert.rejects(readFile(join(outside, directory === 'assets' ? 'index-audit001.js' : 'index.html')), { code: 'ENOENT' });
  }
});
