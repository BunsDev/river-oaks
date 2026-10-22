import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {bakeInputPaths, collectBakeProvenance, verifyBakeProvenance} from '../lib/bake-provenance.mjs';

const bake = 'skirt-seat';
const outputPath = 'preview/src/skirt-seat-morph-data.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'garment-provenance-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const root = pathToFileURL(directory + '/');
  const put = async (path, value) => {
    const target = new URL(path, root);
    await mkdir(dirname(fileURLToPath(target)), {recursive: true});
    await writeFile(target, value);
  };
  for (const path of bakeInputPaths(bake)) await put(path, `fixture source: ${path}\n`);
  await put(outputPath, 'export const data = [0, 1, 2];\n');
  await put('package.json', JSON.stringify({dependencies: {three: '0.186.1', other: '1.0.0'}}));
  await put('pnpm-lock.yaml', 'fixture lock version one\n');
  await put('node_modules/three/package.json', JSON.stringify({name: 'three', version: '0.186.1'}));
  await put('node_modules/three/index.js', 'export const core = 1;\n');
  await put('node_modules/three/build/three.module.js', 'export const implementation = 1;\n');
  await put('node_modules/three/examples/jsm/loaders/GLTFLoader.js', 'export const loader = 1;\n');
  await put('node_modules/three/src/math/Vector3.js', 'export const math = 1;\n');
  const receipt = {version: 2, ...await collectBakeProvenance({root, bake}),
    outputSha256: hash(await readFile(new URL(outputPath, root)))};
  return {directory, root, put, receipt, verify: (value = receipt) => verifyBakeProvenance({root, bake, receipt: value})};
}

test('unrelated dependency and lockfile changes preserve the existing receipt without rebaking', async t => {
  const f = await fixture(t);
  await f.verify();
  await f.put('package.json', JSON.stringify({dependencies: {three: '0.186.1', other: '2.0.0'}}));
  await f.put('pnpm-lock.yaml', 'completely different unrelated lockfile bytes\n');
  await f.put('node_modules/other/index.js', 'updated unrelated package');
  await f.verify();
});

test('a real toolchain version change invalidates the receipt even after its declaration agrees', async t => {
  const f = await fixture(t);
  await f.put('package.json', JSON.stringify({dependencies: {three: '0.186.2'}}));
  await f.put('node_modules/three/package.json', JSON.stringify({name: 'three', version: '0.186.2'}));
  await assert.rejects(f.verify(), /toolchain.*three/i);
});

for (const path of ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'src/math/Vector3.js']) {
  test(`same-version package implementation changes invalidate the receipt: ${path}`, async t => {
    const f = await fixture(t);
    await f.put(`node_modules/three/${path}`, 'changed implementation\n');
    await assert.rejects(f.verify(), /toolchain.*three/i);
  });
}

for (const path of ['preview/src/avatars.js', 'preview/src/upper-body-gait.js',
  'preview/src/packed-morph-data.js',
  'preview/public/assets/characters/jevica.glb', 'preview/public/assets/characters/jevica.sources.json',
  'scripts/lib/bake-provenance.mjs']) {
  test(`changed source, rig or license input is detected: ${path}`, async t => {
    const f = await fixture(t);
    await f.put(path, 'changed input bytes\n');
    await assert.rejects(f.verify(), /input.*changed|changed.*input/i);
  });
}

test('changed generated output cannot pass with a matching toolchain', async t => {
  const f = await fixture(t);
  await f.put(outputPath, 'export const data = [99];\n');
  await assert.rejects(f.verify(), /output/i);
});

test('missing required inputs fail instead of reading a host checkout', async t => {
  const f = await fixture(t);
  await rm(new URL('preview/src/avatars.js', f.root));
  await assert.rejects(f.verify(), /avatars\.js/);
});

test('missing local Three.js cannot fall back to this test runner dependency', async t => {
  const f = await fixture(t);
  await rm(new URL('node_modules/three', f.root), {recursive: true});
  await assert.rejects(f.verify(), /three/);
});

test('installed Three.js must match the exact declared version', async t => {
  const f = await fixture(t);
  await f.put('package.json', JSON.stringify({dependencies: {three: '0.186.2'}}));
  await assert.rejects(f.verify(), /declar|install|version/i);
});

test('new runtime package dependencies require a fresh audit instead of being omitted', async t => {
  const f = await fixture(t);
  await f.put('node_modules/three/package.json', JSON.stringify({name: 'three', version: '0.186.1', dependencies: {unreviewed: '1.0.0'}}));
  await assert.rejects(f.verify(), /dependenc.*audit|audit.*dependenc/i);
});

test('unsupported or incomplete receipt shapes cannot drop integrity checks', async t => {
  const f = await fixture(t);
  for (const bad of [null, {}, {...f.receipt, version: 1}, {...f.receipt, inputs: {}},
    {...f.receipt, toolchain: {}}, {...f.receipt, outputSha256: 'bad'},
    {...f.receipt, inputs: {...f.receipt.inputs, '../foreign': '0'.repeat(64)}}]) {
    await assert.rejects(f.verify(bad), /receipt|schema|input|toolchain|output/i);
  }
  const missing = structuredClone(f.receipt);
  delete missing.inputs['preview/src/avatars.js'];
  await assert.rejects(f.verify(missing), /input/i);
});

test('identical checkouts and pnpm-style root symlinks have path-independent identity', async t => {
  const a = await fixture(t), b = await fixture(t);
  assert.deepEqual(a.receipt, b.receipt);
  await mkdir(new URL('store/', b.root));
  const {rename} = await import('node:fs/promises');
  await rename(new URL('node_modules/three', b.root), new URL('store/package', b.root));
  await symlink('../store/package', new URL('node_modules/three', b.root), 'dir');
  await b.verify(a.receipt);
});

test('internal package symlinks are refused rather than silently omitted', async t => {
  const f = await fixture(t);
  await symlink('three.module.js', new URL('node_modules/three/build/alias.js', f.root));
  await assert.rejects(f.verify(), /symlink/i);
});

test('unknown bake names are refused', async t => {
  const f = await fixture(t);
  await assert.rejects(verifyBakeProvenance({root: f.root, bake: '../elsewhere', receipt: f.receipt}), /bake/i);
});

test('a root without a directory slash fails promptly instead of escaping or looping', async t => {
  const f = await fixture(t);
  // Isolate the negative control: a broken ancestor walk would otherwise keep
  // the test worker alive indefinitely. This deadline is not a performance gate.
  const script = `import {collectBakeProvenance} from ${JSON.stringify(new URL('../lib/bake-provenance.mjs', import.meta.url).href)};
    try {
      await collectBakeProvenance({root: new URL(${JSON.stringify(new URL('not-a-directory', f.root).href)}), bake: 'skirt-seat'});
      throw new Error('invalid root accepted');
    } catch (error) { if (!/directory URL/.test(error.message)) throw error; }`;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], {timeout: 5000});
});

// Without resolution checks a nested install could execute different bytes than
// those named in an otherwise valid root-package fingerprint.
test('a nested Three.js install cannot shadow the audited package for a bake', async t => {
  const f = await fixture(t);
  await f.put('scripts/node_modules/three/package.json', JSON.stringify({name: 'three', version: '0.186.1'}));
  await f.put('scripts/node_modules/three/index.js', 'different math implementation');
  await assert.rejects(f.verify(), /resolv|shadow/i);
});
