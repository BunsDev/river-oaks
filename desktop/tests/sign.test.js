import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ENTITLEMENTS, entitlementKeys, notaryArgs, parseAssessment, parseSignature, readSignature, signOptions, validateIdentity, validateProfile, verifySignature } from '../sign.js';

const run = promisify(execFile);
const IDENTITY = 'Developer ID Application: Example Studio LLC (ABCDE12345)';

test('the signed app may use JIT and the microphone, and nothing else', async () => {
  assert.deepEqual(entitlementKeys(await readFile(ENTITLEMENTS, 'utf8')), ['com.apple.security.cs.allow-jit', 'com.apple.security.device.audio-input']);
});

test('only a Developer ID Application certificate, by exact name or SHA-1, can sign a release', () => {
  assert.equal(validateIdentity(IDENTITY), IDENTITY);
  assert.equal(validateIdentity('ee732df3f48d7535561af54d3fffc4b44daf3e7f'), 'EE732DF3F48D7535561AF54D3FFFC4B44DAF3E7F');
  for (const identity of [undefined, '-', 'Apple Development: Someone (ABCDE12345)', 'Developer ID Application: Example Studio LLC',
    `Developer ID Application: Example\nStudio (ABCDE12345)`, 'Developer ID Installer: Example Studio LLC (ABCDE12345)'])
    assert.throws(() => validateIdentity(identity), /Developer ID Application/);
});

test('our entitlements reach the app and its plain helper; Chromium helpers keep their own', () => {
  const app = '/build/TypeSafe Place.app', { optionsForFile, ...options } = signOptions({ app, identity: IDENTITY });
  assert.deepEqual(options, { app, identity: IDENTITY, platform: 'darwin', type: 'distribution', preAutoEntitlements: false, strictVerify: true });
  const frameworks = `${app}/Contents/Frameworks`;
  for (const path of [app, `${frameworks}/TypeSafe Place Helper.app`, `${frameworks}/Electron Framework.framework/Versions/A/Electron Framework`])
    assert.deepEqual(optionsForFile(path), { entitlements: ENTITLEMENTS, hardenedRuntime: true }, path);
  for (const kind of ['GPU', 'Renderer', 'Plugin']) {
    assert.equal(optionsForFile(`${frameworks}/TypeSafe Place Helper (${kind}).app`), null);
    assert.equal(optionsForFile(`${frameworks}/TypeSafe Place Helper (${kind}).app/Contents/MacOS/TypeSafe Place Helper (${kind})`), null);
  }
});

test('notarization reads a stored keychain profile and is never handed a credential', () => {
  const args = notaryArgs('/tmp/TypeSafe Place.zip', 'river-oaks-notary');
  assert.deepEqual(args, ['notarytool', 'submit', '/tmp/TypeSafe Place.zip', '--keychain-profile', 'river-oaks-notary', '--wait', '--output-format', 'json']);
  for (const flag of ['--key', '--key-id', '--issuer', '--apple-id', '--password', '--team-id']) assert.ok(!args.includes(flag), flag);
  for (const profile of [undefined, '', '--key', 'two words', 'a'.repeat(65), 'profile;rm']) assert.throws(() => validateProfile(profile), /keychain profile/);
});

test('codesign and Gatekeeper output is read field by field', () => {
  const signature = parseSignature(['Executable=/build/TypeSafe Place.app/Contents/MacOS/TypeSafe Place', 'Identifier=works.jev.river-oaks',
    'CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=28+7 location=embedded', 'Authority=Developer ID Application: Example Studio LLC (ABCDE12345)',
    'Authority=Developer ID Certification Authority', 'Authority=Apple Root CA', 'Timestamp=15 Oct 2026 at 21:00:00', 'TeamIdentifier=ABCDE12345'].join('\n'));
  assert.deepEqual(signature, { identifier: 'works.jev.river-oaks', authority: ['Developer ID Application: Example Studio LLC (ABCDE12345)',
    'Developer ID Certification Authority', 'Apple Root CA'], team: 'ABCDE12345', timestamp: '15 Oct 2026 at 21:00:00', runtime: true, adhoc: false });
  assert.deepEqual(parseAssessment('/build/TypeSafe Place.app: accepted\nsource=Notarized Developer ID\norigin=Developer ID Application: Example Studio LLC (ABCDE12345)\n'),
    { accepted: true, source: 'Notarized Developer ID', origin: 'Developer ID Application: Example Studio LLC (ABCDE12345)' });
  assert.deepEqual(parseAssessment('/build/TypeSafe Place.app: rejected\nsource=Unnotarized Developer ID\n'), { accepted: false, source: 'Unnotarized Developer ID', origin: null });
});

// Real codesign, ad-hoc, on a one-binary bundle: the entitlements file is valid for
// codesign, the readback finds the runtime flag and the keys, and the release check
// refuses anything that is not a timestamped Developer ID signature.
test('an ad-hoc signature with our entitlements reads back, and is refused for release', { skip: process.platform !== 'darwin' && 'codesign is macOS only' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-sign-'));
  try {
    const app = join(dir, 'Demo.app');
    await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
    await writeFile(join(app, 'Contents/Info.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict><key>CFBundleExecutable</key><string>demo</string>'
      + '<key>CFBundleIdentifier</key><string>works.jev.sign-test</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>\n');
    await copyFile('/usr/bin/true', join(app, 'Contents/MacOS/demo'));
    await run('codesign', ['--sign', '-', '--force', '--options', 'runtime', '--entitlements', ENTITLEMENTS, app]);
    const signature = await readSignature(app);
    assert.equal(signature.identifier, 'works.jev.sign-test');
    assert.equal(signature.runtime, true);
    assert.equal(signature.adhoc, true);
    assert.deepEqual(signature.entitlements, ['com.apple.security.cs.allow-jit', 'com.apple.security.device.audio-input']);
    await assert.rejects(verifySignature(app), /signed by an ad-hoc signature; no secure timestamp/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
