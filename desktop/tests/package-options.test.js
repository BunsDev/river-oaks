import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packagerOptions, packagedBinary, ICON_BASE, ICON_PNG_SIZES } from '../package-options.js';
import { APP_NAME, APP_BUNDLE_ID, APP_USER_MODEL_ID, LINUX_EXECUTABLE } from '../identity.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = { version: '9.9.9', devDependencies: { electron: '44.0.0' } };
const options = platform => packagerOptions({ root, stage: '/stage', pkg, platform, arch: 'x64' });
const pngSize = buffer => {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
};

test('every platform packages the committed TypeSafe Place icon, derived from one source', async () => {
  const base = join(root, ICON_BASE);
  await stat(`${base}.svg`);
  for (const size of ICON_PNG_SIZES) {
    const [width, height] = pngSize(await readFile(join(root, 'desktop/icon/png', `${size}.png`)));
    assert.deepEqual([width, height], [size, size], `png/${size}.png is ${size}×${size}`);
  }
  // .icns: 'icns' magic, total length, then typed PNG entries covering the standard sizes.
  const icns = await readFile(`${base}.icns`);
  assert.equal(icns.subarray(0, 4).toString('latin1'), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length, 'icns length header matches the file');
  const types = [];
  for (let offset = 8; offset < icns.length;) {
    const type = icns.subarray(offset, offset + 4).toString('latin1'), length = icns.readUInt32BE(offset + 4);
    types.push(type); pngSize(icns.subarray(offset + 8, offset + length)); offset += length;
  }
  for (const type of ['icp4', 'icp5', 'ic07', 'ic08', 'ic09', 'ic13', 'ic14']) assert.ok(types.includes(type), `icns carries ${type}`);
  // .ico: reserved 0, type 1, PNG-compressed entries whose declared sizes match their images.
  const ico = await readFile(`${base}.ico`);
  assert.equal(ico.readUInt16LE(0), 0); assert.equal(ico.readUInt16LE(2), 1);
  const count = ico.readUInt16LE(4);
  const sizes = [];
  for (let index = 0; index < count; index++) {
    const entry = 6 + index * 16, declared = ico[entry] || 256, bytes = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    const [width, height] = pngSize(ico.subarray(offset, offset + bytes));
    assert.deepEqual([width, height], [declared, declared]); sizes.push(declared);
  }
  for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `ico carries ${size}`);
  // The packager completes the extension per platform, so every platform gets the same base path.
  for (const platform of ['darwin', 'win32', 'linux']) assert.equal((await options(platform)).icon, base);
  // Assets stay small enough to commit.
  const total = (await stat(`${base}.icns`)).size + (await stat(`${base}.ico`)).size;
  assert.ok(total < 400 * 1024, `icns + ico stay under 400 KiB (${total})`);
});

test('a missing icon fails packaging review before the packager runs', async () => {
  await assert.rejects(packagerOptions({ root: '/nonexistent', stage: '/stage', pkg, platform: 'darwin', arch: 'arm64' }), /icon/i);
});

test('Windows builds carry file metadata and the app user model ID is stable', async () => {
  const { win32metadata } = await options('win32');
  assert.deepEqual(win32metadata, { CompanyName: 'Jev Works', ProductName: APP_NAME, FileDescription: APP_NAME, InternalName: 'TypeSafePlace', OriginalFilename: 'TypeSafe Place.exe' });
  assert.match(APP_USER_MODEL_ID, /^[A-Za-z0-9.-]{1,128}$/, 'no spaces, at most 128 characters');
  assert.equal(packagedBinary('/out/TypeSafe Place-win32-x64', 'win32'), join('/out/TypeSafe Place-win32-x64', 'TypeSafe Place.exe'));
});

test('macOS identity is unchanged', async () => {
  const mac = await options('darwin');
  assert.equal(mac.appBundleId, APP_BUNDLE_ID); assert.equal(APP_BUNDLE_ID, 'works.jev.river-oaks');
  assert.equal(mac.appCategoryType, 'public.app-category.adventure-games');
  assert.match(mac.extendInfo.NSMicrophoneUsageDescription, /microphone/);
  assert.equal(mac.name, APP_NAME); assert.equal(mac.executableName, APP_NAME);
  assert.equal(mac.win32metadata, undefined);
  assert.equal(packagedBinary('/out/TypeSafe Place-darwin-arm64', 'darwin'), join('/out/TypeSafe Place-darwin-arm64', 'TypeSafe Place.app'));
});

test('Linux keeps the product name but uses a space-free executable name', async () => {
  const linux = await options('linux');
  assert.equal(linux.name, APP_NAME);
  assert.equal(linux.executableName, LINUX_EXECUTABLE); assert.equal(LINUX_EXECUTABLE, 'typesafe-place');
  assert.equal(packagedBinary('/out/TypeSafe Place-linux-x64', 'linux'), join('/out/TypeSafe Place-linux-x64', 'typesafe-place'));
});

test('every platform shares the staged app, Electron version, asar and overwrite settings', async () => {
  for (const platform of ['darwin', 'win32', 'linux']) {
    const built = await options(platform);
    assert.equal(built.dir, '/stage'); assert.equal(built.out, join(root, 'dist/desktop'));
    assert.equal(built.electronVersion, '44.0.0'); assert.equal(built.platform, platform); assert.equal(built.arch, 'x64');
    assert.deepEqual([built.asar, built.overwrite, built.prune], [true, true, false]);
  }
});
