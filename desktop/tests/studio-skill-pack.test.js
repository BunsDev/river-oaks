import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['reference-board', 'blockout-builder', 'map-scale-blockout', 'player-path-collision',
  'blockout-review', 'room-logic', 'modular-kit-checker', 'camera-framing', 'developer-view',
  'shape-language-depth', 'reference-scene-comparison', 'lighting-pbr-diagnostics',
  'vegetation-placement-collision', 'world-workflow', 'studio-world-design'];
const hash = text => createHash('sha256').update(text).digest('hex');
async function fixture(t) {
  const base = path.join(root, '.runtime/tmp');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'studio-pack-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
async function api() {
  const module = await import('../../scripts/studio-skill-pack.js').catch(() => ({}));
  assert.equal(typeof module.buildWorldDesignPack, 'function', 'portable pack builder must exist');
  return module;
}
async function sourceFixture(t) {
  const directory = await fixture(t);
  for (const name of names) {
    const target = path.join(directory, '.agents/skills', name);
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, 'SKILL.md'), `---\nname: ${name}\n---\n# Guide\n[Contract](../../../docs/level-design-skills.md#contract)\n`);
  }
  await mkdir(path.join(directory, 'docs'));
  await writeFile(path.join(directory, 'docs/level-design-skills.md'), '# Contract\n[Details](details.md#details)\n[Source](../source.js)\n');
  await writeFile(path.join(directory, 'docs/details.md'), '# Details\n\n[external](https://example.com)\n');
  await writeFile(path.join(directory, 'source.js'), 'export const fixture = true;\n');
  return directory;
}

test('builds reproducible readable bundle of all fourteen workflows plus Studio role and linked guides', async () => {
  const { buildWorldDesignPack } = await api();
  const first = await buildWorldDesignPack(root), second = await buildWorldDesignPack(root);
  assert.deepEqual(first, second);
  assert.deepEqual(first.manifest.skills.map(item => item.name).sort(), [...names].sort());
  assert.equal(first.manifest.version, '1.0.0');
  assert.match(first.manifest.sha256, /^[a-f0-9]{64}$/);
  for (const name of names) {
    const entry = first.files.find(item => item.path === `.agents/skills/${name}/SKILL.md`);
    assert.ok(entry, name);
    assert.equal(entry.content, await readFile(path.join(root, entry.path), 'utf8'));
  }
  for (const entry of first.files) assert.equal(hash(entry.content), entry.sha256);
  assert.ok(first.files.some(item => item.path === 'docs/level-design/skill-suite-contract.md'));
  assert.ok(first.files.some(item => item.path === 'docs/world-studio.md'));
  assert.ok(first.manifest.repositoryReferences.some(item => item.path === 'preview/src/walking.js'));
  assert.equal(first.files.some(item => item.path === 'preview/src/walking.js'), false);
});

test('requires every named workflow, follows Markdown references and rejects missing files or anchors', async t => {
  const { buildWorldDesignPack } = await api(), source = await sourceFixture(t);
  const pack = await buildWorldDesignPack(source);
  assert.ok(pack.files.some(item => item.path === 'docs/details.md'));
  assert.match(pack.files.find(item => item.path === 'docs/level-design-skills.md').content, /https:\/\/github.com\/BunsDev\/river-oaks\/blob\//);
  await writeFile(path.join(source, 'docs/details.md'), '# Wrong anchor\n');
  await assert.rejects(buildWorldDesignPack(source), /anchor/i);
  await rm(path.join(source, 'docs/details.md'));
  await assert.rejects(buildWorldDesignPack(source), /missing|ENOENT/i);
  await rm(path.join(source, '.agents/skills/room-logic/SKILL.md'));
  await assert.rejects(buildWorldDesignPack(source), /missing|ENOENT/i);
});

test('rejects source links and symlinks escaping the source root', async t => {
  const { buildWorldDesignPack } = await api(), source = await sourceFixture(t), outside = await fixture(t);
  await writeFile(path.join(outside, 'secret.md'), '# Secret\n');
  await writeFile(path.join(source, 'docs/details.md'), '[Escape](../../secret.md)\n');
  await assert.rejects(buildWorldDesignPack(source), /escape|unsafe/i);
  await rm(path.join(source, 'docs/details.md'));
  await symlink(path.join(outside, 'secret.md'), path.join(source, 'docs/details.md'));
  await assert.rejects(buildWorldDesignPack(source), /symlink/i);
});

test('installs into a new fixture workspace, verifies hashes and allows identical reinstall', async t => {
  const { buildWorldDesignPack, installWorldDesignPack, verifyWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t));
  const destination = path.join(await fixture(t), 'workspace');
  const first = await installWorldDesignPack(pack, destination);
  assert.equal(first.ok, true);
  assert.equal(first.installed, pack.files.length);
  const second = await installWorldDesignPack(pack, destination);
  assert.equal(second.installed, 0);
  assert.equal(second.unchanged, pack.files.length);
  assert.equal((await verifyWorldDesignPack(pack, destination)).ok, true);
  const target = path.join(destination, pack.files[0].path);
  await writeFile(target, 'modified by host');
  const result = await verifyWorldDesignPack(pack, destination);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'hash-mismatch'));
  await assert.rejects(installWorldDesignPack(pack, destination), /different|mismatch/i);
  assert.equal(await readFile(target, 'utf8'), 'modified by host');
});

test('refuses unrelated existing workspaces and does not partially overwrite on conflict', async t => {
  const { buildWorldDesignPack, installWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), destination = await fixture(t);
  await writeFile(path.join(destination, 'IDENTITY.md'), 'Existing identity');
  await assert.rejects(installWorldDesignPack(pack, destination), /empty|new|existing/i);
  assert.deepEqual(await readdir(destination), ['IDENTITY.md']);
});

test('rejects tampered pack hashes or traversal paths before creating the destination', async t => {
  const { buildWorldDesignPack, installWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), directory = await fixture(t);
  for (const update of [{ content: 'tampered' }, { path: '../escaped.md' }, { path: '/absolute.md' }]) {
    const changed = structuredClone(pack);
    Object.assign(changed.files[0], update);
    await assert.rejects(installWorldDesignPack(changed, path.join(directory, 'new-workspace')), /hash|manifest|unsafe|path/i);
  }
  assert.deepEqual(await readdir(directory), []);
});

test('refuses symlink destinations, ancestors and installed file escapes without changing the target', async t => {
  const { buildWorldDesignPack, installWorldDesignPack, verifyWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), directory = await fixture(t), outside = await fixture(t);
  const link = path.join(directory, 'link');
  await symlink(outside, link);
  await assert.rejects(installWorldDesignPack(pack, link), /symlink/i);
  await assert.rejects(installWorldDesignPack(pack, path.join(link, 'child')), /symlink/i);
  const destination = path.join(directory, 'workspace');
  await installWorldDesignPack(pack, destination);
  const target = path.join(destination, pack.files[0].path), external = path.join(outside, 'external.md');
  await writeFile(external, 'leave intact');
  await rm(target);
  await symlink(external, target);
  await assert.rejects(installWorldDesignPack(pack, destination), /symlink/i);
  const verified = await verifyWorldDesignPack(pack, destination);
  assert.equal(verified.ok, false);
  assert.ok(verified.errors.some(error => error.code === 'unsafe-path'));
  assert.equal(await readFile(external, 'utf8'), 'leave intact');
});

test('verification reports missing installed content and manifest without repairing it', async t => {
  const { buildWorldDesignPack, installWorldDesignPack, verifyWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), destination = await fixture(t);
  await installWorldDesignPack(pack, destination);
  await rm(path.join(destination, pack.files[0].path));
  const result = await verifyWorldDesignPack(pack, destination);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'missing-file'));
  await rm(path.join(destination, '.world-design-pack.json'));
  assert.equal((await verifyWorldDesignPack(pack, destination)).ok, false);
});

test('includes repository-relative guides named in skill code spans and exposes stale secondary anchors', async t => {
  const { buildWorldDesignPack } = await api(), source = await sourceFixture(t);
  const entrypoint = path.join(source, '.agents/skills/world-workflow/SKILL.md');
  await writeFile(entrypoint, `${await readFile(entrypoint, 'utf8')}\nRead \`docs/routing.md\` for native routing.\n`);
  await writeFile(path.join(source, 'docs/routing.md'), '# Routing\n[Old reference](details.md#retired)\n');
  const pack = await buildWorldDesignPack(source);
  assert.ok(pack.files.some(item => item.path === 'docs/routing.md'));
  assert.ok(pack.manifest.linkWarnings.some(item => item.path === 'docs/details.md' && item.fragment === 'retired'));
  await rm(path.join(source, 'docs/routing.md'));
  await assert.rejects(buildWorldDesignPack(source), /missing|ENOENT/i);
});

test('repository references hash exact binary bytes without UTF-8 replacement', async t => {
  const { buildWorldDesignPack } = await api(), source = await sourceFixture(t);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0xc0, 0x80]);
  await writeFile(path.join(source, 'reference.png'), bytes);
  await writeFile(path.join(source, 'docs/details.md'), '# Details\n![Reference](../reference.png)\n');
  const pack = await buildWorldDesignPack(source);
  assert.equal(pack.manifest.repositoryReferences.find(item => item.path === 'reference.png').sha256, hash(bytes));
});

test('FIFO skill files and receipt are rejected without blocking verification or reinstall', async t => {
  const { buildWorldDesignPack, installWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), directory = await fixture(t);
  const packFile = path.join(directory, 'pack.json');
  await writeFile(packFile, JSON.stringify(pack));
  for (const [index, relative] of [pack.files[0].path, '.world-design-pack.json'].entries()) {
    const destination = path.join(directory, `workspace-${index}`);
    await installWorldDesignPack(pack, destination);
    const target = path.join(destination, relative);
    await rm(target);
    await run('mkfifo', [target], { timeout: 1500, killSignal: 'SIGKILL' });
    // A separate process bounds the regression even if an OS open() blocks a worker.
    // SIGKILL on timeout and awaiting execFile ensure no child survives the test.
    const checked = await run(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { readFile } from 'node:fs/promises';
      const { verifyWorldDesignPack, installWorldDesignPack } = await import(process.argv[1]);
      const pack = JSON.parse(await readFile(process.argv[2], 'utf8'));
      const result = await verifyWorldDesignPack(pack, process.argv[3]);
      assert.equal(result.ok, false);
      assert.ok(result.errors.some(error => error.code === 'unsafe-path' && /regular file/.test(error.message)));
      await assert.rejects(installWorldDesignPack(pack, process.argv[3]), /regular file/);
      console.log('rejected FIFO');
    `, new URL('../../scripts/studio-skill-pack.js', import.meta.url).href, packFile, destination],
    { timeout: 2000, killSignal: 'SIGKILL' });
    assert.equal(checked.stdout.trim(), 'rejected FIFO');
  }
});

test('retries an interrupted owned install by creating only verified missing files', async t => {
  const { buildWorldDesignPack, installWorldDesignPack, verifyWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), directory = await fixture(t);
  const packFile = path.join(directory, 'pack.json'), destination = path.join(directory, 'workspace');
  await writeFile(packFile, JSON.stringify(pack));
  // Inject one write failure in a child so the production install leaves real partial files.
  await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import fs from 'node:fs/promises';
    import { constants } from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    const pack = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
    const originalOpen = fs.open;
    fs.open = async (target, flags, ...args) => {
      if ((flags & constants.O_WRONLY) && target.endsWith(pack.files[1].path)) throw new Error('injected interrupted write');
      return originalOpen(target, flags, ...args);
    };
    syncBuiltinESMExports();
    const { installWorldDesignPack } = await import(process.argv[1]);
    await assert.rejects(installWorldDesignPack(pack, process.argv[3]), /injected interrupted write/);
  `, new URL('../../scripts/studio-skill-pack.js', import.meta.url).href, packFile, destination],
  { timeout: 3000, killSignal: 'SIGKILL' });
  assert.deepEqual(JSON.parse(await readFile(path.join(destination, '.world-design-pack.json'), 'utf8')), pack.manifest);
  assert.equal(await readFile(path.join(destination, pack.files[0].path), 'utf8'), pack.files[0].content);
  assert.equal((await verifyWorldDesignPack(pack, destination)).ok, false);
  const resumed = await installWorldDesignPack(pack, destination);
  assert.equal(resumed.ok, true);
  assert.equal(resumed.installed, pack.files.length - 1);
  assert.equal(resumed.unchanged, 1);
  assert.equal((await installWorldDesignPack(pack, destination)).installed, 0);
  assert.deepEqual((await readdir(directory)).sort(), ['pack.json', 'workspace']);
});

test('retry preflights changed and unrelated content before creating any missing files', async t => {
  const { buildWorldDesignPack, installWorldDesignPack } = await api();
  const pack = await buildWorldDesignPack(await sourceFixture(t)), destination = await fixture(t);
  await installWorldDesignPack(pack, destination);
  const missing = path.join(destination, pack.files[0].path), changed = path.join(destination, pack.files.at(-1).path);
  await rm(missing);
  await writeFile(changed, 'changed after interruption');
  await assert.rejects(installWorldDesignPack(pack, destination), /different|mismatch|differs/i);
  await assert.rejects(readFile(missing), { code: 'ENOENT' });
  await writeFile(changed, pack.files.at(-1).content);
  await writeFile(path.join(destination, 'IDENTITY.md'), 'unrelated identity');
  await assert.rejects(installWorldDesignPack(pack, destination), /unrelated|unexpected/i);
  await assert.rejects(readFile(missing), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(destination, 'IDENTITY.md'), 'utf8'), 'unrelated identity');
});
