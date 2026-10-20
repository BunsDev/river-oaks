import { getCurrentFuseWire, FuseState, FuseV1Options } from '@electron/fuses';
import { DESKTOP_FUSES } from './fuses.js';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from './package-files.js';
import { packagedBinary } from './package-options.js';
import { APP_NAME } from './identity.js';
import { open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Checks a build made by desktop/package.js: the fuse wire inside the binary
// must match desktop/fuses.js exactly, the asar must hold exactly the staged
// files, the binary must be an executable for the build's platform and arch, and
// the asar's package.json must carry the app's name and the expected version.
// Run after `pnpm run desktop:package` on the same host (CI does this on every
// platform in .github/workflows/desktop.yml). `--dir` runs the same checks on
// an installed copy, such as the one a Squirrel, AppImage or .deb install wrote
// (desktop/installers.js and desktop/installer-acceptance.js, #372).

// A build directory's binary and asar. The binary is the one package.js fuses.
export function buildPaths(dir, platform = process.platform) {
  const binary = packagedBinary(dir, platform);
  const asar = platform === 'darwin' ? join(binary, 'Contents/Resources/app.asar') : join(dir, 'resources/app.asar');
  return { dir, binary, asar };
}

// The packager names its output `<name>-<platform>-<arch>`, and package.js flips
// the fuses in packagedBinary(), so the check reads the same binary it wrote.
export function packagedPaths(root, platform = process.platform, arch = process.arch) {
  return buildPaths(join(root, 'dist/desktop', `${APP_NAME}-${platform}-${arch}`), platform);
}

export function expectedAsarFiles() {
  return [...DESKTOP_FILES.map(file => `desktop/${file}`), 'desktop/world-design-pack.json', ...DESKTOP_SHARED_FILES, 'package.json'].sort();
}

// An asar starts with a 4-byte pickle holding the header pickle's size, then the
// header pickle: its payload size, the JSON string's length and the JSON. File
// contents follow the header pickle, at the offsets the JSON records. Only the
// header and the files asked for are read; @electron/asar is not a direct dependency.
async function readAsarHeader(file, path) {
  const head = Buffer.alloc(16);
  await file.read(head, 0, 16, 0);
  if (head.readUInt32LE(0) !== 4) throw new Error(`${path} is not an asar archive`);
  const length = head.readUInt32LE(12);
  const json = Buffer.alloc(length);
  await file.read(json, 0, length, 16);
  return { header: JSON.parse(json.toString('utf8')), dataOffset: 8 + head.readUInt32LE(4) };
}

export async function listAsar(path) {
  const file = await open(path, 'r');
  try {
    const { header } = await readAsarHeader(file, path);
    const walk = (node, prefix) => Object.entries(node.files).flatMap(([name, entry]) => entry.files ? walk(entry, `${prefix}${name}/`) : [`${prefix}${name}`]);
    return walk(header, '').sort();
  } finally { await file.close(); }
}

export async function readAsarFile(path, name) {
  const file = await open(path, 'r');
  try {
    const { header, dataOffset } = await readAsarHeader(file, path);
    const entry = name.split('/').reduce((node, part) => node?.files?.[part], header);
    if (!entry || entry.files) throw new Error(`${path} has no file ${name}`);
    if (entry.unpacked) return await readFile(join(`${path}.unpacked`, name));
    const contents = Buffer.alloc(entry.size);
    await file.read(contents, 0, entry.size, dataOffset + Number(entry.offset));
    return contents;
  } finally { await file.close(); }
}

// Reads the executable header: a PE image (Windows), an ELF (Linux) or a Mach-O
// (macOS), and the machine it was built for. Anything else is 'unknown'.
const MACHINES = {
  pe: { 0x8664: 'x64', 0xaa64: 'arm64', 0x14c: 'ia32' },
  elf: { 62: 'x64', 183: 'arm64', 3: 'ia32', 40: 'armv7l' },
  macho: { 0x01000007: 'x64', 0x0100000c: 'arm64' },
};
export async function binaryFormat(path) {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(4096);
    const { bytesRead } = await file.read(head, 0, head.length, 0);
    if (bytesRead >= 0x40 && head.toString('latin1', 0, 2) === 'MZ') {
      const pe = head.readUInt32LE(0x3c);
      const signature = Buffer.alloc(6);
      await file.read(signature, 0, 6, pe);
      if (signature.toString('latin1', 0, 4) === 'PE\0\0') return { format: 'pe', arch: MACHINES.pe[signature.readUInt16LE(4)] ?? 'unknown' };
    }
    if (bytesRead >= 0x14 && head.readUInt32BE(0) === 0x7f454c46) {
      const machine = head[5] === 2 ? head.readUInt16BE(0x12) : head.readUInt16LE(0x12);
      return { format: 'elf', arch: MACHINES.elf[machine] ?? 'unknown' };
    }
    if (bytesRead >= 8 && head.readUInt32LE(0) === 0xfeedfacf) return { format: 'macho', arch: MACHINES.macho[head.readUInt32LE(4)] ?? 'unknown' };
    if (bytesRead >= 4 && head.readUInt32BE(0) === 0xcafebabe) return { format: 'macho', arch: 'universal' };
    return { format: 'unknown', arch: 'unknown' };
  } finally { await file.close(); }
}

const FORMATS = { win32: 'pe', linux: 'elf', darwin: 'macho' };
const executableOf = (binary, platform) => platform === 'darwin' ? join(binary, 'Contents/MacOS', APP_NAME) : binary;

const stateName = state => FuseState[state] ?? (state === undefined ? 'missing' : `0x${state.toString(16)}`);

// Every fuse the config decides must be on the wire in that state, and the wire
// must carry no fuse the config does not decide (strictlyRequireAllFuses).
export function fuseDrift(wire, expected = DESKTOP_FUSES) {
  const drift = [];
  if (wire.version !== expected.version) drift.push(`version ${wire.version} (expected ${expected.version})`);
  const known = Object.values(FuseV1Options).filter(value => typeof value === 'number');
  for (const fuse of known) {
    const want = expected[fuse] ? FuseState.ENABLE : FuseState.DISABLE;
    if (wire[fuse] !== want) drift.push(`${FuseV1Options[fuse]}: ${stateName(wire[fuse])} (expected ${stateName(want)})`);
  }
  for (const key of Object.keys(wire)) {
    if (key !== 'version' && !known.includes(Number(key))) drift.push(`undecided fuse ${key}: ${stateName(wire[key])}`);
  }
  return drift;
}

// Checks one build directory. Every failure is listed in `problems`, so a caller
// such as desktop/installers.js can refuse with all the reasons at once. A
// binary with no fuse wire (not an Electron build), one for another platform or
// arch, an unflipped or drifted wire, an asar that is not exactly the staged
// files, or an app of another name or version all make `ok` false.
export async function inspectBuild(paths, { platform = process.platform, arch = process.arch, version } = {}) {
  const problems = [];
  const attempt = async (label, read) => { try { return await read(); } catch (error) { problems.push(`${label}: ${error.code === 'ENOENT' ? `missing ${error.path ?? ''}`.trim() : error.message}`); return null; } };
  const format = await attempt('binary', () => binaryFormat(executableOf(paths.binary, platform)));
  if (format && (format.format !== FORMATS[platform] || format.arch !== arch)) problems.push(`binary is ${format.format} ${format.arch}, expected ${FORMATS[platform]} ${arch} for ${platform}`);
  const wire = format && await attempt('fuse wire', () => getCurrentFuseWire(paths.binary));
  const fuses = wire ? fuseDrift(wire) : [];
  for (const drift of fuses) problems.push(`fuse ${drift}`);
  const files = await attempt('asar', () => listAsar(paths.asar)) ?? [];
  const expected = expectedAsarFiles();
  const missing = files.length ? expected.filter(file => !files.includes(file)) : [], unexpected = files.filter(file => !expected.includes(file));
  for (const file of missing) problems.push(`asar is missing ${file}`);
  for (const file of unexpected) problems.push(`asar has unexpected ${file}`);
  const app = files.includes('package.json') ? await attempt('asar package.json', async () => JSON.parse((await readAsarFile(paths.asar, 'package.json')).toString('utf8'))) : null;
  if (app && app.productName !== APP_NAME) problems.push(`app is ${JSON.stringify(app.productName)}, expected ${JSON.stringify(APP_NAME)}`);
  if (app && version && app.version !== version) problems.push(`app version ${app.version}, expected ${version}`);
  return { ...paths, format, fuses, files, missing, unexpected, app: app && { name: app.name, productName: app.productName, version: app.version }, problems, ok: problems.length === 0 };
}

export async function checkPackage(root, platform = process.platform, arch = process.arch, { version } = {}) {
  const expectedVersion = version ?? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  return inspectBuild(packagedPaths(root, platform, arch), { platform, arch, version: expectedVersion });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { dir: { type: 'string' }, platform: { type: 'string', default: process.platform }, arch: { type: 'string', default: process.arch }, version: { type: 'string' } } });
  const root = fileURLToPath(new URL('../', import.meta.url));
  const version = values.version ?? JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const result = values.dir
    ? await inspectBuild(buildPaths(values.dir, values.platform), { platform: values.platform, arch: values.arch, version })
    : await checkPackage(root, values.platform, values.arch, { version });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) { console.error(`Build drifted from desktop/fuses.js or desktop/package-files.js:\n- ${result.problems.join('\n- ')}`); process.exit(1); }
}
