import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FuseState, FuseV1Options, FuseVersion } from '@electron/fuses';
import { executable, writeAsar, wireFor } from './fixtures/synthetic-build.js';
import { DESKTOP_FUSES } from '../fuses.js';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from '../package-files.js';
import { binaryFormat, expectedAsarFiles, fuseDrift, listAsar, packagedPaths, readAsarFile } from '../package-check.js';
import { packagedBinary } from '../package-options.js';

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
  // join() uses the host separator; compare with forward slashes on every host.
  const posix = paths => Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, path.replaceAll('\\', '/')]));
  for (const [platform, arch] of [['darwin', 'arm64'], ['win32', 'x64'], ['linux', 'x64']]) {
    const paths = packagedPaths('/r', platform, arch);
    assert.equal(paths.binary, packagedBinary(paths.dir, platform), `${platform} checks the binary package.js fuses`);
  }
  const mac = posix(packagedPaths('/r', 'darwin', 'arm64'));
  assert.equal(mac.binary, '/r/dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app');
  assert.equal(mac.asar, '/r/dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app/Contents/Resources/app.asar');
  const win = posix(packagedPaths('/r', 'win32', 'x64'));
  assert.equal(win.binary, '/r/dist/desktop/TypeSafe Place-win32-x64/TypeSafe Place.exe');
  assert.equal(win.asar, '/r/dist/desktop/TypeSafe Place-win32-x64/resources/app.asar');
  const linux = posix(packagedPaths('/r', 'linux', 'x64'));
  assert.equal(linux.binary, '/r/dist/desktop/TypeSafe Place-linux-x64/typesafe-place');
  assert.equal(linux.asar, '/r/dist/desktop/TypeSafe Place-linux-x64/resources/app.asar');
});

test('a file is read from the asar at the offset its header records', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-asar-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const asar = join(dir, 'app.asar');
  await writeAsar(asar, { files: { 'package.json': { size: 15, offset: '3' }, desktop: { files: { 'main.js': { size: 3, offset: '0' } } } } }, 'abc{"version":"1"}');
  assert.equal((await readAsarFile(asar, 'package.json')).toString(), '{"version":"1"}');
  assert.equal((await readAsarFile(asar, 'desktop/main.js')).toString(), 'abc');
  await assert.rejects(readAsarFile(asar, 'desktop'), /has no file desktop/);
  await assert.rejects(readAsarFile(asar, 'missing.js'), /has no file missing\.js/);
});

test('the binary header names its format and machine', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-binary-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cases = [[{ format: 'pe', arch: 'x64' }, { format: 'pe', arch: 'x64' }], [{ format: 'pe', arch: 'arm64' }, { format: 'pe', arch: 'arm64' }],
    [{ format: 'elf', arch: 'x64' }, { format: 'elf', arch: 'x64' }], [{ format: 'elf', arch: 'arm64' }, { format: 'elf', arch: 'arm64' }],
    [{ format: 'script' }, { format: 'unknown', arch: 'unknown' }]];
  for (const [index, [input, expected]] of cases.entries()) {
    await writeFile(join(dir, `${index}`), executable(input));
    assert.deepEqual(await binaryFormat(join(dir, `${index}`)), expected, JSON.stringify(input));
  }
  const macho = Buffer.alloc(32);
  macho.writeUInt32LE(0xfeedfacf, 0); macho.writeUInt32LE(0x0100000c, 4);
  await writeFile(join(dir, 'macho'), macho);
  assert.deepEqual(await binaryFormat(join(dir, 'macho')), { format: 'macho', arch: 'arm64' });
});
