import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { FuseV1Options } from '@electron/fuses';
import { DESKTOP_FUSES } from '../fuses.js';
import { expectedAsarFiles } from '../package-check.js';
import {
  ARTIFACT_SIGNING_VARIABLES, TOOLS, artifactSigningMetadata, buildInstallers, buildManifest, debControl, desktopEntry,
  fetchTool, installerNames, normalizeModes, nuspecAdditionalFiles, preflight, signingParams, sumsFile, verifyDownload,
} from '../installers.js';
import { ELECTRON_DEFAULT_FUSES, executable, writeBuild } from './fixtures/synthetic-build.js';

const exists = path => access(path).then(() => true, () => false);
const sha256 = data => createHash('sha256').update(data).digest('hex');

async function tempRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'river-oaks-installers-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('installer files are named for the release assets', () => {
  assert.deepEqual(installerNames('0.1.6', 'x64'), {
    setup: 'TypeSafe-Place-0.1.6-windows-x64-Setup.exe',
    appImage: 'TypeSafe-Place-0.1.6-linux-x64.AppImage',
    deb: 'TypeSafe-Place-0.1.6-linux-x64.deb',
  });
});

test('a build that passes the package check is accepted for Windows and Linux x64', async t => {
  for (const platform of ['linux', 'win32']) {
    const root = await tempRoot(t);
    await writeBuild(root, { platform });
    const check = await preflight(root, platform, 'x64');
    assert.deepEqual(check.problems, [], platform);
    assert.equal(check.ok, true);
    assert.equal(check.app.version, '0.1.6');
  }
});

// Each refusal stops before the output folder is touched.
async function refuses(t, build, pattern, { platform = 'linux', arch = 'x64' } = {}) {
  const root = await tempRoot(t);
  if (build) await writeBuild(root, { platform, arch, ...build });
  else await writeFile(join(root, 'package.json'), JSON.stringify({ version: '0.1.6' }));
  const out = join(root, 'dist/installers');
  await assert.rejects(buildInstallers({ root, platform, arch, out }), error => {
    assert.match(error.message, /^Refusing to build installers/);
    assert.match(error.message, pattern);
    return true;
  });
  assert.equal(await exists(out), false, 'nothing was written');
}

test('an unflipped binary (Electron\'s own fuse wire) is refused', async t => {
  await refuses(t, { binary: executable({ format: 'elf', fuses: ELECTRON_DEFAULT_FUSES }) }, /fuse RunAsNode: ENABLE \(expected DISABLE\)/);
  await refuses(t, { binary: executable({ format: 'elf', fuses: ELECTRON_DEFAULT_FUSES }) }, /fuse OnlyLoadAppFromAsar: DISABLE \(expected ENABLE\)/);
});

test('a binary with one fuse drifted from desktop/fuses.js is refused', async t => {
  const drifted = { ...DESKTOP_FUSES, [FuseV1Options.EnableNodeCliInspectArguments]: true };
  await refuses(t, { binary: executable({ format: 'pe', fuses: drifted }), platform: 'win32' }, /fuse EnableNodeCliInspectArguments: ENABLE \(expected DISABLE\)/, { platform: 'win32' });
});

test('an unknown binary is refused: not an executable, or an executable with no Electron fuse wire', async t => {
  await refuses(t, { binary: executable({ format: 'script' }) }, /binary is unknown unknown, expected elf x64 for linux/);
  await refuses(t, { binary: executable({ format: 'elf', fuses: null }) }, /fuse wire: Could not find sentinel/);
  await refuses(t, null, /binary: missing .*typesafe-place/);
});

test('a binary for another platform or arch is refused', async t => {
  await refuses(t, { binary: executable({ format: 'pe' }) }, /binary is pe x64, expected elf x64 for linux/);
  await refuses(t, { binary: executable({ format: 'elf', arch: 'arm64' }) }, /binary is elf arm64, expected elf x64 for linux/);
  await refuses(t, { binary: executable({ format: 'elf' }), platform: 'win32' }, /binary is elf x64, expected pe x64 for win32/, { platform: 'win32' });
});

test('an asar that is not exactly the staged files, or another version of the app, is refused', async t => {
  await refuses(t, { appVersion: '0.1.5' }, /app version 0\.1\.5, expected 0\.1\.6/);
  await refuses(t, { files: [...expectedAsarFiles(), 'desktop/dev.js'] }, /asar has unexpected desktop\/dev\.js/);
  await refuses(t, { files: expectedAsarFiles().filter(file => file !== 'desktop/main.js') }, /asar is missing desktop\/main\.js/);
});

test('targets without an installer are refused', async t => {
  await refuses(t, null, /no installer is built for darwin-arm64/, { platform: 'darwin', arch: 'arm64' });
  await refuses(t, { platform: 'win32', arch: 'arm64' }, /no installer is built for win32-arm64/, { platform: 'win32', arch: 'arm64' });
});

test('every downloaded tool is pinned to a release and a SHA-256', () => {
  for (const [name, tool] of Object.entries(TOOLS)) {
    assert.match(tool.url, /^https:\/\//, name);
    assert.ok(tool.url.includes(tool.version) && !/continuous|latest/.test(tool.url), `${name} names its version, not a moving tag`);
    assert.match(tool.sha256, /^[0-9a-f]{64}$/, name);
    assert.ok(tool.url.endsWith(tool.file), name);
  }
});

test('a download is refused unless its SHA-256 matches the pin, and a tampered cache is replaced', async t => {
  const cache = await tempRoot(t);
  const good = Buffer.from('pinned tool bytes');
  const tool = { version: '1.0', file: 'tool', url: 'https://example.invalid/1.0/tool', sha256: sha256(good), executable: true };
  const serve = body => async url => { assert.equal(url, tool.url); return new Response(body); };
  await assert.rejects(fetchTool(tool, cache, { fetchImpl: serve('other bytes') }), /Refusing tool 1\.0: SHA-256 [0-9a-f]{64} does not match the pinned/);
  assert.equal(await exists(join(cache, '1.0', 'tool')), false);
  assert.equal(await exists(join(cache, '1.0', 'tool.download')), false, 'no partial download is left');
  const path = await fetchTool(tool, cache, { fetchImpl: serve(good) });
  assert.deepEqual(await readFile(path), good);
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o111, 0o111, 'executable tools are made executable');
  assert.equal(await fetchTool(tool, cache, { fetchImpl: () => assert.fail('a verified cache is reused') }), path);
  await writeFile(path, 'tampered');
  await assert.rejects(verifyDownload(path, tool), /does not match the pinned/);
  assert.deepEqual(await readFile(await fetchTool(tool, cache, { fetchImpl: serve(good) })), good);
  await assert.rejects(fetchTool({ ...tool, version: '2.0' }, cache, { fetchImpl: async () => new Response('gone', { status: 404 }) }), /tool 2\.0 failed: HTTP 404/);
});

test('SHA256SUMS uses the sha256sum -c layout', () => {
  assert.equal(sumsFile([{ name: 'a.AppImage', sha256: 'ab'.repeat(32) }, { name: 'b.deb', sha256: 'cd'.repeat(32) }]), `${'ab'.repeat(32)}  a.AppImage\n${'cd'.repeat(32)}  b.deb\n`);
});

test('the build manifest lists every file with its hash and mode, and symlinks as links', async t => {
  const dir = await tempRoot(t);
  await mkdir(join(dir, 'resources'));
  await writeFile(join(dir, 'resources/app.asar'), 'asar');
  await writeFile(join(dir, 'typesafe-place'), 'bin', { mode: 0o755 });
  // Windows may refuse an unprivileged symlink; the Linux builds are where links occur.
  const linked = await symlink('typesafe-place', join(dir, 'launcher')).then(() => true, error => { if (process.platform === 'win32') return false; throw error; });
  const files = await buildManifest(dir);
  assert.deepEqual(files.map(file => file.path), [...(linked ? ['launcher'] : []), 'resources/app.asar', 'typesafe-place']);
  if (linked) assert.deepEqual(files[0], { path: 'launcher', link: 'typesafe-place' });
  assert.equal(files.at(-2).sha256, sha256('asar'));
  if (process.platform !== 'win32') assert.equal(files.at(-1).mode, '755');
});

test('the Linux desktop entry and Debian control describe the installed binary', () => {
  const entry = desktopEntry();
  for (const line of ['[Desktop Entry]', 'Type=Application', 'Name=TypeSafe Place', 'Exec=typesafe-place', 'Icon=typesafe-place', 'Categories=Game;AdventureGame;', 'Terminal=false', 'StartupWMClass=TypeSafe Place']) assert.ok(entry.split('\n').includes(line), line);
  assert.ok(!entry.includes('no-sandbox'));
  assert.ok(desktopEntry({ appImage: true, version: '0.1.6' }).includes('X-AppImage-Version=0.1.6\n'));
  const control = debControl({ version: '0.1.6', arch: 'x64', installedSize: 321 });
  for (const line of ['Package: typesafe-place', 'Version: 0.1.6', 'Architecture: amd64', 'Installed-Size: 321', 'Section: games']) assert.ok(control.split('\n').includes(line), line);
  assert.match(control, /^Depends: .*libnss3.*libasound2/m);
  assert.match(control, /^Maintainer: .+ <.+@.+>$/m);
  assert.match(control, /\nDescription: [^\n]+\n( [^\n]+\n)+$/, 'the long description lines start with a space');
  assert.throws(() => debControl({ version: '0.1.6', arch: 'ia32', installedSize: 1 }), /no Debian architecture/);
});

test('the AppArmor profile attaches to the binary the .deb installs, and the scripts install it from there', async () => {
  const linux = fileURLToPath(new URL('../linux/', import.meta.url));
  const profile = await readFile(join(linux, 'apparmor-profile'), 'utf8');
  assert.match(profile, /^profile typesafe-place \/usr\/lib\/typesafe-place\/typesafe-place flags=\(unconfined\) \{\n\s+userns,$/m);
  assert.match(profile, /^abi <abi\/4\.0>,$/m);
  const postinst = await readFile(join(linux, 'postinst'), 'utf8'), postrm = await readFile(join(linux, 'postrm'), 'utf8');
  assert.match(postinst, /PROFILE_SOURCE=\/usr\/share\/typesafe-place\/apparmor-profile/);
  for (const script of [postinst, postrm]) assert.match(script, /PROFILE_TARGET=\/etc\/apparmor\.d\/typesafe-place/);
  if (process.platform !== 'win32') for (const script of ['postinst', 'postrm']) await promisify(execFile)('sh', ['-n', join(linux, script)]);
});

test('files the nuspec template would drop are added, so the install matches the build', async t => {
  const dir = await tempRoot(t);
  // Electron 44's win32-x64 build, plus a folder a later Electron might add.
  for (const file of ['chrome_100_percent.pak', 'd3dcompiler_47.dll', 'dxcompiler.dll', 'icudtl.dat', 'LICENSE', 'LICENSES.chromium.html', 'resources.pak', 'snapshot_blob.bin', 'TypeSafe Place.exe', 'v8_context_snapshot.bin', 'version', 'vk_swiftshader_icd.json', 'vk_swiftshader.dll']) await writeFile(join(dir, file), '');
  for (const folder of ['locales', 'resources', 'future']) await mkdir(join(dir, folder));
  assert.deepEqual(await nuspecAdditionalFiles(dir), [
    { src: 'future\\**', target: 'lib\\net45\\future' },
    { src: 'LICENSES.chromium.html', target: 'lib\\net45\\LICENSES.chromium.html' },
    { src: 'version', target: 'lib\\net45\\version' },
  ]);
});

test('signing parameters: Artifact Signing through signtool\'s dlib, or a test certificate by thumbprint', () => {
  const artifact = signingParams('artifact', { dlib: 'D:\\a\\_temp\\as\\bin\\x64\\Azure.CodeSigning.Dlib.dll', metadata: 'D:\\a\\_temp\\metadata.json' });
  assert.equal(artifact, '/v /fd SHA256 /tr http://timestamp.acs.microsoft.com /td SHA256 /dlib "D:\\a\\_temp\\as\\bin\\x64\\Azure.CodeSigning.Dlib.dll" /dmdf "D:\\a\\_temp\\metadata.json"');
  assert.equal(signingParams('test', { thumbprint: 'AB'.repeat(20) }), `/v /fd SHA256 /sha1 ${'AB'.repeat(20)}`);
  assert.throws(() => signingParams('test', { thumbprint: 'nope' }), /RIVER_OAKS_TEST_SIGNING_THUMBPRINT/);
  assert.throws(() => signingParams('artifact', {}), /dlib and metadata\.json/);
  assert.throws(() => signingParams('pfx', {}), /Unknown signing mode pfx/);
});

test('Artifact Signing metadata names what is missing without echoing values, and uses only the Azure CLI credential', () => {
  assert.throws(() => artifactSigningMetadata({}), error => error.message === `Artifact Signing is not configured: ${ARTIFACT_SIGNING_VARIABLES.join(', ')} unset`);
  const env = { RIVER_OAKS_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net', RIVER_OAKS_SIGNING_ACCOUNT: 'acct-value', RIVER_OAKS_SIGNING_PROFILE: 'profile-value' };
  assert.throws(() => artifactSigningMetadata({ ...env, RIVER_OAKS_SIGNING_PROFILE: '' }), error => /RIVER_OAKS_SIGNING_PROFILE unset/.test(error.message) && !error.message.includes('acct-value'));
  assert.throws(() => artifactSigningMetadata({ ...env, RIVER_OAKS_SIGNING_ENDPOINT: 'https://evil.example/' }), /regional/);
  const metadata = artifactSigningMetadata(env);
  assert.deepEqual([metadata.Endpoint, metadata.CodeSigningAccountName, metadata.CertificateProfileName], ['https://eus.codesigning.azure.net', 'acct-value', 'profile-value']);
  assert.ok(!metadata.ExcludeCredentials.includes('AzureCliCredential'));
  assert.ok(metadata.ExcludeCredentials.includes('InteractiveBrowserCredential') && metadata.ExcludeCredentials.includes('EnvironmentCredential'));
});

test('signing is Windows-only', async t => {
  const root = await tempRoot(t);
  await writeBuild(root);
  await assert.rejects(buildInstallers({ root, platform: 'linux', arch: 'x64', out: join(root, 'out'), sign: 'test' }), /--sign applies to the Windows installer only/);
});

test('staged Linux files are readable by every user: the packager\'s 0700 folder becomes 0755', { skip: process.platform === 'win32' && 'POSIX modes' }, async t => {
  const dir = join(await tempRoot(t), 'TypeSafe Place-linux-x64');
  await mkdir(join(dir, 'resources'), { recursive: true });
  await writeFile(join(dir, 'typesafe-place'), 'bin');
  await writeFile(join(dir, 'resources/app.asar'), 'asar');
  await writeFile(join(dir, 'open.txt'), 'x');
  await chmod(join(dir, 'typesafe-place'), 0o700);
  await chmod(join(dir, 'resources/app.asar'), 0o600);
  await chmod(join(dir, 'open.txt'), 0o666);
  await chmod(join(dir, 'resources'), 0o700);
  await chmod(dir, 0o700);
  await normalizeModes(dir);
  const mode = async path => ((await stat(join(dir, path))).mode & 0o7777).toString(8);
  assert.deepEqual(await Promise.all(['.', 'resources', 'typesafe-place', 'resources/app.asar', 'open.txt'].map(mode)), ['755', '755', '755', '644', '644']);
});
