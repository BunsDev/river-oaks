import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE, appImageProfile, classifySandbox, compareManifest, findBrowser, parseSigningChain, parseSums, renderersSandboxed } from '../installer-acceptance.js';

const hash = character => character.repeat(64);

test('SHA256SUMS lines parse, and a malformed line is refused', () => {
  const sums = parseSums(`${hash('a')}  TypeSafe-Place-0.1.6-linux-x64.AppImage\n${hash('b')}  TypeSafe-Place-0.1.6-linux-x64.deb\n`);
  assert.deepEqual([...sums], [['TypeSafe-Place-0.1.6-linux-x64.AppImage', hash('a')], ['TypeSafe-Place-0.1.6-linux-x64.deb', hash('b')]]);
  assert.throws(() => parseSums(`${hash('a')} one-space.deb\n`), /Malformed SHA256SUMS line/);
});

test('an installed copy matches the build only with every file, byte and mode, plus the allowed differences', () => {
  const build = [
    { path: 'chrome-sandbox', size: 1, mode: '755', sha256: hash('1') },
    { path: 'resources/app.asar', size: 2, mode: '644', sha256: hash('2') },
    { path: 'TypeSafe Place.exe', size: 3, mode: '755', sha256: hash('3') },
    { path: 'libvulkan.so', link: 'libvulkan.so.1' },
  ];
  assert.equal(compareManifest(build, build).ok, true);
  const installed = build.map(file => file.path === 'chrome-sandbox' ? { ...file, mode: '4755' } : file);
  assert.deepEqual(compareManifest(build, installed).changed, ['chrome-sandbox: mode 4755 (expected 755)']);
  assert.equal(compareManifest(build, installed, { modes: { 'chrome-sandbox': '4755' } }).ok, true, 'the .deb\'s setuid helper is a declared change');
  const result = compareManifest(build, [...installed.filter(file => file.path !== 'resources/app.asar'), { path: 'squirrel.exe', sha256: hash('9'), mode: '644' }, { path: 'libvulkan.so', link: 'elsewhere' }], { modes: { 'chrome-sandbox': '4755' } });
  assert.deepEqual([result.missing, result.extra], [['resources/app.asar'], ['squirrel.exe']]);
  assert.ok(result.changed.includes('libvulkan.so: link elsewhere (expected libvulkan.so.1)'));
  assert.equal(compareManifest(build, [...build, { path: 'squirrel.exe', sha256: hash('9') }], { allowExtra: ['squirrel.exe'] }).ok, true);
  const resigned = build.map(file => file.path.endsWith('.exe') ? { ...file, sha256: hash('f') } : file);
  assert.deepEqual(compareManifest(build, resigned).changed, ['TypeSafe Place.exe: content differs']);
  const signed = compareManifest(build, resigned, { resigned: path => path.endsWith('.exe') });
  assert.deepEqual([signed.ok, signed.signed], [true, ['TypeSafe Place.exe']], 'signing may change only the files it signs');
  assert.equal(compareManifest(build, build.map(file => ({ ...file, mode: '666' })), { compareModes: false }).ok, true, 'Windows has no POSIX modes');
});

test('the zygote\'s namespaces tell the namespace sandbox from the setuid helper and from none', () => {
  const browser = { cmd: '/usr/lib/typesafe-place/typesafe-place --proxy-server=127.0.0.1:9', nspid: [100], uidMap: '0 0 4294967295' };
  const unsandboxed = { cmd: '/usr/lib/typesafe-place/typesafe-place --type=zygote --no-zygote-sandbox', nspid: [101], uidMap: '0 0 4294967295' };
  const zygote = fields => ({ cmd: '/usr/lib/typesafe-place/typesafe-place --type=zygote --enable-crash-reporter', ...fields });
  assert.equal(classifySandbox([browser, unsandboxed, zygote({ nspid: [102, 1], uidMap: '1001 1001 1' })]), 'userns');
  assert.equal(classifySandbox([browser, unsandboxed, zygote({ nspid: [102, 1], uidMap: '0 0 4294967295' })]), 'setuid');
  assert.equal(classifySandbox([browser, unsandboxed, zygote({ nspid: [102], uidMap: '0 0 4294967295' })]), 'none');
  assert.equal(classifySandbox([browser, unsandboxed]), 'unknown', 'only the unsandboxed zygote is not evidence');
  assert.equal(classifySandbox([browser, zygote({ nspid: [102, 1], uidMap: null })]), 'setuid', 'an unreadable uid_map falls back to the PID namespace');
});

test('launches stay offline and never turn the sandbox off', () => {
  assert.equal(OFFLINE, '--proxy-server=127.0.0.1:9');
  assert.ok(!OFFLINE.includes('sandbox'));
});

test('the documented AppImage profile grants user namespaces to that one path', () => {
  assert.equal(appImageProfile('/home/resident/Applications/TypeSafe-Place-0.1.6-linux-x64.AppImage'),
    'abi <abi/4.0>,\ninclude <tunables/global>\n\nprofile typesafe-place-appimage /home/resident/Applications/TypeSafe-Place-0.1.6-linux-x64.AppImage flags=(unconfined) {\n  userns,\n}\n');
});

test('the signer is the last certificate of signtool\'s signing chain, not the root or the timestamp authority', () => {
  const output = [
    'Verifying: D:\\a\\TypeSafe Place.exe', '', 'Signature Index: 0 (Primary Signature)', 'Hash of file (sha256): 00', '', 'Signing Certificate Chain:',
    '    Issued to: Microsoft Identity Verification Root Certificate Authority 2020', '    Issued by: Microsoft Identity Verification Root Certificate Authority 2020', '    SHA1 hash: F40042E2E5F7E8EF8189FED15519AECE42C3BFA2', '',
    '        Issued to: Microsoft ID Verified CS EOC CA 01', '        SHA1 hash: 0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A0A', '',
    '            Issued to: Jev Works', '            Issued by: Microsoft ID Verified CS EOC CA 01', '            SHA1 hash: 1111111111111111111111111111111111111111', '',
    'The signature is timestamped: Thu Oct 15 05:14:00 2026', 'Timestamp Verified by:', '    Issued to: Microsoft Root Certificate Authority 2010', '    SHA1 hash: 3B1EFD3A66EA28B16697394703A72CA340A05BD5', '',
    'Successfully verified: D:\\a\\TypeSafe Place.exe',
  ].join('\r\n');
  const chain = parseSigningChain(output);
  assert.deepEqual(chain.map(link => link.issuedTo), ['Microsoft Identity Verification Root Certificate Authority 2020', 'Microsoft ID Verified CS EOC CA 01', 'Jev Works']);
  assert.equal(chain.at(-1).sha1, '1111111111111111111111111111111111111111');
  assert.deepEqual(parseSigningChain('SignTool Error: No signature found.'), []);
});

// The AppImage launch measured on ubuntu-24.04 (diag run 38685366911): the
// runtime starts the browser with argv[0] set to the AppImage's own path.
const APPIMAGE = '/home/runner/Applications/TypeSafe-Place-0.1.6-linux-x64.AppImage';
const LIB = '/tmp/.mount_TypeSaX/usr/lib/typesafe-place/typesafe-place';
const measured = [
  { pid: 3236, ppid: 3230, cmd: `${APPIMAGE} --proxy-server=127.0.0.1:9`, nspid: [3236], seccomp: 0, uidMap: '0 0 4294967295' },
  { pid: 3245, ppid: 3236, cmd: `${LIB} --type=zygote --no-zygote-sandbox`, nspid: [3245], seccomp: 0, uidMap: '0 0 4294967295' },
  { pid: 3246, ppid: 3236, cmd: `${LIB} --type=zygote`, nspid: [3246, 1], seccomp: 0, uidMap: '1001 1001 1' },
  { pid: 3248, ppid: 3246, cmd: `${LIB} --type=zygote`, nspid: [3248, 3], seccomp: 0, uidMap: '1001 1001 1' },
  { pid: 3269, ppid: 3236, cmd: `${LIB} --type=gpu-process`, nspid: [3269], seccomp: 0, uidMap: '0 0 4294967295' },
  { pid: 3283, ppid: 3248, cmd: `${LIB} --type=renderer`, nspid: [3283, 4, 1], seccomp: 2, uidMap: '1001 1001 1' },
];

test('the browser is the zygotes\' untyped ancestor, whatever its argv[0] says', () => {
  assert.equal(findBrowser(measured)?.pid, 3236);
  assert.equal(classifySandbox(measured), 'userns');
  assert.equal(findBrowser(measured.filter(proc => !proc.cmd.includes('--type=zygote'))), null, 'no zygote, no started browser');
});

test('renderers count as sandboxed only under seccomp-bpf in a nested PID namespace', () => {
  assert.deepEqual(renderersSandboxed(measured), { renderers: 1, sandboxed: true });
  assert.deepEqual(renderersSandboxed(measured.map(proc => proc.pid === 3283 ? { ...proc, seccomp: 0 } : proc)), { renderers: 1, sandboxed: false });
  assert.deepEqual(renderersSandboxed(measured.map(proc => proc.pid === 3283 ? { ...proc, nspid: [3283] } : proc)), { renderers: 1, sandboxed: false });
});
