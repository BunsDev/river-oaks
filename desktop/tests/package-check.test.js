import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FuseState, FuseV1Options, FuseVersion } from '@electron/fuses';
import { DESKTOP_FUSES } from '../fuses.js';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from '../package-files.js';
import { expectedAsarFiles, fuseDrift, listAsar, packagedPaths } from '../package-check.js';

// Builds an asar the way @electron/asar frames it: a size pickle, then a header
// pickle holding the JSON directory, then the file contents.
async function writeAsar(path, header, contents = '') {
  const json = Buffer.from(JSON.stringify(header));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4);
  json.copy(padded);
  const headerPickle = Buffer.alloc(8 + padded.length);
  headerPickle.writeUInt32LE(4 + padded.length, 0);
  headerPickle.writeUInt32LE(json.length, 4);
  padded.copy(headerPickle, 8);
  const sizePickle = Buffer.alloc(8);
  sizePickle.writeUInt32LE(4, 0);
  sizePickle.writeUInt32LE(headerPickle.length, 4);
  await writeFile(path, Buffer.concat([sizePickle, headerPickle, Buffer.from(contents)]));
}

function wireFor(config) {
  const wire = { version: config.version };
  for (const fuse of Object.values(FuseV1Options).filter(value => typeof value === 'number')) wire[fuse] = config[fuse] ? FuseState.ENABLE : FuseState.DISABLE;
  return wire;
}

test('the asar listing walks nested directories from the archive header alone', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-asar-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const asar = join(dir, 'app.asar');
  await writeAsar(asar, { files: { 'package.json': { size: 2, offset: '0' }, desktop: { files: { 'main.js': { size: 3, offset: '2' }, nested: { files: { 'deep.cjs': { size: 0, offset: '5' } } } } } } }, '{}abc');
  assert.deepEqual(await listAsar(asar), ['desktop/main.js', 'desktop/nested/deep.cjs', 'package.json']);
  await writeFile(join(dir, 'not.asar'), 'plain text, not a pickle');
  await assert.rejects(listAsar(join(dir, 'not.asar')), /not an asar archive/);
});

test('the expected asar contents are the staged desktop files, the shared files, the world-design pack and package.json', () => {
  const expected = expectedAsarFiles();
  for (const file of DESKTOP_FILES) assert.ok(expected.includes(`desktop/${file}`), file);
  for (const file of DESKTOP_SHARED_FILES) assert.ok(expected.includes(file), file);
  assert.ok(expected.includes('desktop/world-design-pack.json') && expected.includes('package.json'));
  assert.equal(expected.length, DESKTOP_FILES.length + DESKTOP_SHARED_FILES.length + 2);
});

test('a fuse wire that matches desktop/fuses.js has no drift', () => {
  assert.deepEqual(fuseDrift(wireFor(DESKTOP_FUSES)), []);
});

test('a flipped, missing, undecided or differently versioned fuse is drift', () => {
  const flipped = { ...wireFor(DESKTOP_FUSES), [FuseV1Options.RunAsNode]: FuseState.ENABLE };
  assert.deepEqual(fuseDrift(flipped), ['RunAsNode: ENABLE (expected DISABLE)']);
  const missing = wireFor(DESKTOP_FUSES);
  delete missing[FuseV1Options.OnlyLoadAppFromAsar];
  assert.deepEqual(fuseDrift(missing), ['OnlyLoadAppFromAsar: missing (expected ENABLE)']);
  const undecided = { ...wireFor(DESKTOP_FUSES), 42: FuseState.ENABLE };
  assert.deepEqual(fuseDrift(undecided), ['undecided fuse 42: ENABLE']);
  const version = { ...wireFor(DESKTOP_FUSES), version: '2' };
  assert.deepEqual(fuseDrift(version), [`version 2 (expected ${FuseVersion.V1})`]);
});

test('the packaged paths follow desktop/package.js on each platform', () => {
  const mac = packagedPaths('/r', 'darwin', 'arm64');
  assert.equal(mac.binary, '/r/dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app');
  assert.equal(mac.asar, '/r/dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app/Contents/Resources/app.asar');
  const win = packagedPaths('/r', 'win32', 'x64');
  assert.equal(win.binary, '/r/dist/desktop/TypeSafe Place-win32-x64/TypeSafe Place.exe');
  assert.equal(win.asar, '/r/dist/desktop/TypeSafe Place-win32-x64/resources/app.asar');
  const linux = packagedPaths('/r', 'linux', 'x64');
  assert.equal(linux.binary, '/r/dist/desktop/TypeSafe Place-linux-x64/TypeSafe Place');
  assert.equal(linux.asar, '/r/dist/desktop/TypeSafe Place-linux-x64/resources/app.asar');
});
