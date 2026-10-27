import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { packagerOptions, packagedBinary, isTransientNetworkError, withNetworkRetry, ICON_BASE, ICON_PNG_SIZES } from '../package-options.js';
import { APP_NAME, APP_BUNDLE_ID, APP_USER_MODEL_ID, LINUX_EXECUTABLE } from '../identity.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
// The Electron that pnpm installed, so its checksums.json lists this version's zips.
const installed = JSON.parse(await readFile(join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const pkg = { version: '9.9.9', devDependencies: { electron: installed } };
const options = (platform, env = {}) => packagerOptions({ root, stage: '/stage', pkg, platform, arch: 'x64', env });
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
    assert.equal(built.electronVersion, installed); assert.equal(built.platform, platform); assert.equal(built.arch, 'x64');
    assert.deepEqual([built.asar, built.overwrite, built.prune], [true, true, false]);
  }
});

test('packaging verifies the Electron zip against the lockfile-pinned checksums, not a SHASUMS256.txt fetched from github.com', async () => {
  const bundled = JSON.parse(await readFile(join(root, 'node_modules/electron/checksums.json'), 'utf8'));
  for (const platform of ['darwin', 'win32', 'linux']) {
    const { download } = await options(platform);
    assert.deepEqual(download.checksums, bundled, 'the checksums electron\'s own install.js verifies with');
    assert.match(download.checksums[`electron-v${installed}-${platform}-x64.zip`], /^[0-9a-f]{64}$/);
    assert.equal(download.cacheRoot, undefined, 'the default @electron/get cache unless one is configured');
  }
  assert.equal((await options('linux', { electron_config_cache: '/runner/electron' })).download.cacheRoot, '/runner/electron',
    'the cache Electron\'s install.js also reads, so CI can restore it');
});

test('the packager\'s @electron/get, given these options, downloads the zip once with no checksum file, reuses the cache, and refuses a tampered zip', async () => {
  // The same @electron/get the packager calls, resolved from @electron/packager.
  const get = createRequire(import.meta.resolve('@electron/packager')).resolve('@electron/get');
  const { downloadArtifact } = await import(pathToFileURL(get));
  // A local mirror serves a stand-in zip; its checksum joins the installed list.
  const zip = Buffer.from('stand-in Electron zip'), name = `electron-v${installed}-linux-x64.zip`;
  const requests = [];
  const mirror = createHttpServer((request, response) => { requests.push(request.url); response.end(zip); });
  await new Promise(resolve => mirror.listen(0, '127.0.0.1', resolve));
  const cache = await mkdtemp(join(tmpdir(), 'river-oaks-electron-cache-'));
  try {
    const { download } = await options('linux', { electron_config_cache: cache });
    const details = { ...download, checksums: { ...download.checksums, [name]: createHash('sha256').update(zip).digest('hex') },
      version: installed, artifactName: 'electron', platform: 'linux', arch: 'x64', downloadOptions: { quiet: true },
      mirrorOptions: { mirror: `http://127.0.0.1:${mirror.address().port}/` } };
    const cached = await downloadArtifact(details);
    assert.ok(cached.startsWith(cache), 'the zip lands in electron_config_cache');
    assert.deepEqual(requests, [`/v${installed}/${name}`], 'one request, for the zip; no SHASUMS256.txt');
    requests.length = 0;
    assert.equal(await downloadArtifact(details), cached);
    assert.deepEqual(requests, [], 'a warm cache needs no network');
    await writeFile(cached, 'tampered');
    assert.deepEqual(await readFile(await downloadArtifact(details)), zip, 'a tampered cached zip is replaced');
    assert.deepEqual(requests, [`/v${installed}/${name}`]);
    const wrong = { ...details, cacheRoot: join(cache, 'other'), checksums: { ...details.checksums, [name]: 'f'.repeat(64) } };
    const mismatch = await downloadArtifact(wrong).then(() => null, error => error);
    assert.match(mismatch?.message ?? '', /checksum/i, 'a zip that matches no checksum is refused');
    assert.equal(isTransientNetworkError(mismatch), false, 'and never retried');
  } finally {
    await new Promise(resolve => mirror.close(resolve));
    await rm(cache, { recursive: true, force: true });
  }
});

test('a package.json Electron the installed checksums do not cover is refused before anything downloads', async () => {
  const stale = { ...pkg, devDependencies: { electron: '44.0.0' } };
  await assert.rejects(packagerOptions({ root, stage: '/stage', pkg: stale, platform: 'linux', arch: 'x64', env: {} }),
    /electron-v44\.0\.0-linux-x64\.zip.*pnpm install/s);
});

test('only network failures and server errors are retried, a bounded number of times', async () => {
  const connectTimeout = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' }) });
  const serverError = Object.assign(new Error('Response code 503'), { name: 'HTTPError', response: { status: 503 } });
  const missing = Object.assign(new Error('Response code 404'), { name: 'HTTPError', response: { status: 404 } });
  const mismatch = new Error('Generated checksum for "electron-v44.9.1-linux-x64.zip" did not match expected checksum.');
  for (const error of [connectTimeout, serverError]) assert.equal(isTransientNetworkError(error), true, error.message);
  for (const error of [missing, mismatch, new Error('fetch failed')]) assert.equal(isTransientNetworkError(error), false, error.message);

  const waits = [], warnings = [];
  let calls = 0;
  const flaky = () => { calls++; if (calls < 3) throw connectTimeout; return 'packaged'; };
  assert.equal(await withNetworkRetry(flaky, { delays: [10, 30], sleep: async ms => waits.push(ms), warn: line => warnings.push(line) }), 'packaged');
  assert.deepEqual([calls, waits], [3, [10, 30]]);
  assert.match(warnings[0], /UND_ERR_CONNECT_TIMEOUT.*retrying in 0\.01 s \(1\/2\)/);

  calls = 0;
  await assert.rejects(withNetworkRetry(() => { calls++; throw connectTimeout; }, { delays: [10, 30], sleep: async () => {}, warn() {} }), /fetch failed/);
  assert.equal(calls, 3, 'gives up after the last delay');
  calls = 0;
  await assert.rejects(withNetworkRetry(() => { calls++; throw mismatch; }, { delays: [10, 30], sleep: async () => {}, warn() {} }), /did not match/);
  assert.equal(calls, 1, 'a checksum mismatch is never retried');
});

test('a real dropped connection is recognised as transient', async () => {
  const server = createServer(socket => socket.destroy());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const error = await fetch(`http://127.0.0.1:${server.address().port}/electron.zip`).then(() => null, failure => failure);
    assert.ok(error, 'the request failed');
    assert.equal(isTransientNetworkError(error), true, `${error.message} (${error.cause?.code})`);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
