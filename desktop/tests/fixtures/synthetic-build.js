// Small stand-ins for a packaged Electron build: an executable header (PE, ELF
// or Mach-O) followed by the fuse sentinel and a fuse wire, and an asar framed
// the way @electron/asar writes one. Used by package-check and installers tests.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { FuseState, FuseV1Options, FuseVersion } from '@electron/fuses';
import { DESKTOP_FUSES } from '../../fuses.js';
import { expectedAsarFiles, packagedPaths } from '../../package-check.js';

const SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
const FUSES = Object.values(FuseV1Options).filter(value => typeof value === 'number').sort((a, b) => a - b);

// Builds an asar the way @electron/asar frames it: a size pickle, then a header
// pickle holding the JSON directory, then the file contents.
export async function writeAsar(path, header, contents = '') {
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
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.concat([sizePickle, headerPickle, Buffer.from(contents)]));
}

// An asar holding the given files ({ name: contents }), nested by '/'.
export async function writeAsarFiles(path, files) {
  const header = { files: {} };
  let offset = 0, data = '';
  for (const [name, contents] of Object.entries(files)) {
    const parts = name.split('/');
    let node = header;
    for (const part of parts.slice(0, -1)) node = (node.files[part] ??= { files: {} });
    node.files[parts.at(-1)] = { size: Buffer.byteLength(contents), offset: String(offset) };
    offset += Buffer.byteLength(contents);
    data += contents;
  }
  await writeAsar(path, header, data);
}

export function wireFor(config = DESKTOP_FUSES) {
  const wire = { version: config.version };
  for (const fuse of FUSES) wire[fuse] = config[fuse] ? FuseState.ENABLE : FuseState.DISABLE;
  return wire;
}

// Electron's own wire before package.js flips it.
export const ELECTRON_DEFAULT_FUSES = {
  version: FuseVersion.V1, [FuseV1Options.RunAsNode]: true, [FuseV1Options.EnableCookieEncryption]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: true, [FuseV1Options.EnableNodeCliInspectArguments]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false, [FuseV1Options.OnlyLoadAppFromAsar]: false,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false, [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  [FuseV1Options.WasmTrapHandlers]: true,
};

const MACHINE = { pe: { x64: 0x8664, arm64: 0xaa64 }, elf: { x64: 62, arm64: 183 } };
export function executable({ format, arch = 'x64', fuses = DESKTOP_FUSES }) {
  let head;
  if (format === 'pe') {
    head = Buffer.alloc(0x100);
    head.write('MZ', 0, 'latin1');
    head.writeUInt32LE(0x80, 0x3c);
    head.write('PE\0\0', 0x80, 'latin1');
    head.writeUInt16LE(MACHINE.pe[arch], 0x84);
  } else if (format === 'elf') {
    head = Buffer.alloc(0x40);
    head.writeUInt32BE(0x7f454c46, 0);
    head[4] = 2; head[5] = 1;
    head.writeUInt16LE(MACHINE.elf[arch], 0x12);
  } else head = Buffer.from('#!/bin/sh\necho not an executable\n');
  if (!fuses) return head;
  const wire = wireFor(fuses);
  return Buffer.concat([head, Buffer.from(SENTINEL), Buffer.from([Number(wire.version), FUSES.length, ...FUSES.map(fuse => wire[fuse])])]);
}

// A root with package.json and the build package.js would have written for
// platform/arch. Overrides: binary (Buffer), version (the app's), files (asar names).
export async function writeBuild(root, { platform = 'linux', arch = 'x64', version = '0.1.6', appVersion = version, binary, files = expectedAsarFiles() } = {}) {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'river-oaks', version }));
  const paths = packagedPaths(root, platform, arch);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.binary, binary ?? executable({ format: platform === 'win32' ? 'pe' : 'elf', arch }));
  const contents = Object.fromEntries(files.map(name => [name, name === 'package.json' ? JSON.stringify({ name: 'river-oaks', productName: 'TypeSafe Place', version: appVersion }) : `// ${name}\n`]));
  await writeAsarFiles(paths.asar, contents);
  return paths;
}
