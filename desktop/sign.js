import { sign } from '@electron/osx-sign';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packagedPaths } from './package-check.js';

// Signs the macOS app built by desktop/package.js with a Developer ID certificate
// and the hardened runtime, then, given a notary profile, notarizes and staples it.
// Run it after desktop:package and desktop:package:check: flipping the fuses
// rewrites the binary, so signing has to come last.
//
//   pnpm run desktop:sign --identity <certificate SHA-1 or "Developer ID Application: Name (TEAMID)">
//     [--notary-profile <name>] [--app <path to .app>] [--receipt <file>]
//
// Credentials stay in the keychain. The identity is a certificate name or hash, and
// notarytool reads a profile stored once with `xcrun notarytool store-credentials`.
// This script never takes a password, key or issuer.

const run = promisify(execFile);
export const ENTITLEMENTS = fileURLToPath(new URL('./entitlements.mac.plist', import.meta.url));
// Chromium's GPU, renderer and plugin helpers keep the entitlements @electron/osx-sign
// ships for them (Chromium's own). The app and every other helper get ours.
const CHROMIUM_HELPER = /\((GPU|Renderer|Plugin)\)\.app(\/|$)/;

// A name with two certificates behind it makes codesign refuse as ambiguous, so the
// SHA-1 of one certificate is accepted too. Only Developer ID can be notarized.
export function validateIdentity(identity) {
  if (typeof identity !== 'string') throw new Error('Pass --identity: a Developer ID Application certificate name or its SHA-1.');
  if (/^[0-9A-F]{40}$/i.test(identity)) return identity.toUpperCase();
  if (/^Developer ID Application: [^\n\r()]+ \([A-Z0-9]{10}\)$/.test(identity)) return identity;
  throw new Error(`Not a Developer ID Application identity: ${identity}`);
}

export function validateProfile(profile) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(profile ?? '')) throw new Error(`Not a notarytool keychain profile name: ${profile}`);
  return profile;
}

export function signOptions({ app, identity }) {
  return { app, identity: validateIdentity(identity), platform: 'darwin', type: 'distribution', preAutoEntitlements: false, strictVerify: true,
    optionsForFile: path => CHROMIUM_HELPER.test(path) ? null : { entitlements: ENTITLEMENTS, hardenedRuntime: true } };
}

export const notaryArgs = (zip, profile) => ['notarytool', 'submit', zip, '--keychain-profile', validateProfile(profile), '--wait', '--output-format', 'json'];

// `codesign -dvv` prints to stderr, one `Key=value` per line; Authority repeats down the chain.
export function parseSignature(text) {
  const lines = text.split('\n'), value = key => lines.find(line => line.startsWith(`${key}=`))?.slice(key.length + 1) ?? null;
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(text)?.[1].split(',') ?? [];
  return { identifier: value('Identifier'), authority: lines.filter(line => line.startsWith('Authority=')).map(line => line.slice(10)),
    team: value('TeamIdentifier'), timestamp: value('Timestamp'), runtime: flags.includes('runtime'), adhoc: flags.includes('adhoc') };
}

export const entitlementKeys = xml => [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map(match => match[1]).sort();

// `spctl -a -vvv` prints `<path>: accepted|rejected`, then source= and origin= lines.
export function parseAssessment(text) {
  const value = key => new RegExp(`^${key}=(.*)$`, 'm').exec(text)?.[1] ?? null;
  return { accepted: /: accepted$/m.test(text), source: value('source'), origin: value('origin') };
}

const output = async (command, args) => {
  try { const { stdout, stderr } = await run(command, args, { maxBuffer: 16 * 1024 * 1024 }); return { ok: true, stdout, stderr }; }
  catch (error) { return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error) }; }
};

export async function readSignature(app) {
  const details = await output('codesign', ['-dvv', app]);
  const entitlements = await output('codesign', ['-d', '--entitlements', '-', '--xml', app]);
  return { ...parseSignature(details.stderr), entitlements: entitlementKeys(entitlements.stdout) };
}

export async function verifySignature(app) {
  const expected = entitlementKeys(await readFile(ENTITLEMENTS, 'utf8'));
  const verify = await output('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  if (!verify.ok) throw new Error(`codesign --verify failed:\n${verify.stderr}`);
  const signature = await readSignature(app);
  const problems = [];
  if (!signature.authority[0]?.startsWith('Developer ID Application: ')) problems.push(`signed by ${signature.authority[0] ?? (signature.adhoc ? 'an ad-hoc signature' : 'nobody')}`);
  if (!signature.runtime) problems.push('hardened runtime is off');
  if (!signature.timestamp) problems.push('no secure timestamp');
  if (signature.entitlements.join() !== expected.join()) problems.push(`entitlements ${signature.entitlements.join(', ') || 'none'} (expected ${expected.join(', ')})`);
  if (problems.length) throw new Error(`The signature is not a releasable Developer ID signature: ${problems.join('; ')}`);
  return signature;
}

export async function notarize(app, profile) {
  const dir = await mkdtemp(join(tmpdir(), 'river-oaks-notarize-'));
  try {
    const zip = join(dir, `${basename(app, '.app')}.zip`);
    const archive = await output('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
    if (!archive.ok) throw new Error(`ditto failed:\n${archive.stderr}`);
    const submit = await output('xcrun', notaryArgs(zip, profile));
    let result = null;
    try { result = JSON.parse(submit.stdout); } catch { throw new Error(`notarytool submit failed:\n${submit.stderr || submit.stdout}`); }
    if (result.status !== 'Accepted') {
      const log = result.id ? await output('xcrun', ['notarytool', 'log', result.id, '--keychain-profile', profile]) : null;
      throw new Error(`Notarization ${result.status ?? 'failed'} (${result.id ?? 'no submission id'}): ${result.message ?? ''}\n${log?.stdout ?? ''}`);
    }
    for (const args of [['stapler', 'staple', app], ['stapler', 'validate', app]]) {
      const step = await output('xcrun', args);
      if (!step.ok) throw new Error(`xcrun ${args.slice(0, 2).join(' ')} failed:\n${step.stderr || step.stdout}`);
    }
    return { id: result.id, status: result.status };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

export async function assess(app) {
  const result = await output('spctl', ['--assess', '--type', 'execute', '-vvv', app]);
  return parseAssessment(`${result.stdout}\n${result.stderr}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `pnpm run desktop:sign -- --identity …` passes the `--` through; parseArgs would read everything after it as positional.
  const args = process.argv.slice(2), { values } = parseArgs({ args: args[0] === '--' ? args.slice(1) : args, options: { identity: { type: 'string' }, 'notary-profile': { type: 'string' }, app: { type: 'string' }, receipt: { type: 'string' } } });
  if (process.platform !== 'darwin') throw new Error('desktop:sign signs the macOS app and runs on macOS only.');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const app = resolve(values.app ?? packagedPaths(root, 'darwin', process.arch).binary);
  if (!(await stat(app)).isDirectory()) throw new Error(`No app bundle at ${app}. Run pnpm run desktop:package first.`);
  const profile = values['notary-profile'] === undefined ? null : validateProfile(values['notary-profile']);
  await sign(signOptions({ app, identity: values.identity }));
  const signature = await verifySignature(app);
  const notarization = profile ? await notarize(app, profile) : null;
  const gatekeeper = await assess(app);
  if (profile && !(gatekeeper.accepted && gatekeeper.source === 'Notarized Developer ID')) throw new Error(`Gatekeeper did not accept the notarized app: ${JSON.stringify(gatekeeper)}`);
  const receipt = { app, signedAt: new Date().toISOString(), signature, notarization, gatekeeper };
  if (values.receipt) await writeFile(values.receipt, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt, null, 2));
}
