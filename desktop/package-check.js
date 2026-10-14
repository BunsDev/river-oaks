import { getCurrentFuseWire, FuseState, FuseV1Options } from '@electron/fuses';
import { DESKTOP_FUSES } from './fuses.js';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from './package-files.js';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Checks a build made by desktop/package.js: the fuse wire inside the binary
// must match desktop/fuses.js exactly, and the asar must hold exactly the staged
// files. Run after `pnpm run desktop:package` on the same host (CI does this on
// every platform in .github/workflows/desktop.yml).

export function packagedPaths(root, platform = process.platform, arch = process.arch) {
  const dir = join(root, 'dist/desktop', `TypeSafe Place-${platform}-${arch}`);
  const binary = platform === 'darwin' ? join(dir, 'TypeSafe Place.app') : join(dir, platform === 'win32' ? 'TypeSafe Place.exe' : 'TypeSafe Place');
  const asar = platform === 'darwin' ? join(binary, 'Contents/Resources/app.asar') : join(dir, 'resources/app.asar');
  return { dir, binary, asar };
}

export function expectedAsarFiles() {
  return [...DESKTOP_FILES.map(file => `desktop/${file}`), 'desktop/world-design-pack.json', ...DESKTOP_SHARED_FILES, 'package.json'].sort();
}

// An asar starts with a 4-byte pickle holding the header pickle's size, then the
// header pickle: its payload size, the JSON string's length and the JSON. Only the
// header is read; @electron/asar is not a direct dependency.
export async function listAsar(path) {
  const file = await open(path, 'r');
  try {
    const head = Buffer.alloc(16);
    await file.read(head, 0, 16, 0);
    if (head.readUInt32LE(0) !== 4) throw new Error(`${path} is not an asar archive`);
    const length = head.readUInt32LE(12);
    const json = Buffer.alloc(length);
    await file.read(json, 0, length, 16);
    const walk = (node, prefix) => Object.entries(node.files).flatMap(([name, entry]) => entry.files ? walk(entry, `${prefix}${name}/`) : [`${prefix}${name}`]);
    return walk(JSON.parse(json.toString('utf8')), '').sort();
  } finally { await file.close(); }
}

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

export async function checkPackage(root, platform = process.platform, arch = process.arch) {
  const paths = packagedPaths(root, platform, arch);
  const wire = await getCurrentFuseWire(paths.binary);
  const fuses = fuseDrift(wire);
  const files = await listAsar(paths.asar);
  const expected = expectedAsarFiles();
  const missing = expected.filter(file => !files.includes(file)), unexpected = files.filter(file => !expected.includes(file));
  return { ...paths, fuses, files, missing, unexpected, ok: fuses.length === 0 && missing.length === 0 && unexpected.length === 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkPackage(fileURLToPath(new URL('../', import.meta.url)));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) { console.error('Packaged app drifted from desktop/fuses.js or desktop/package-files.js'); process.exit(1); }
}
