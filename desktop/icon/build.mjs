// Derives desktop/icon/png/<size>.png, typesafe-place.icns and typesafe-place.ico
// from typesafe-place.svg. Needs rsvg-convert (librsvg) on PATH; the .icns and
// .ico containers are written here so no platform tool is required for them.
// Run: node desktop/icon/build.mjs
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = fileURLToPath(new URL('./', import.meta.url));
const source = join(here, 'typesafe-place.svg'), pngDir = join(here, 'png');
export const SIZES = [16, 32, 48, 64, 128, 256, 512];
// Apple's PNG-bearing icns types. The @2x entries reuse the next PNG up.
const ICNS = { 16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 256: 'ic08', 512: 'ic09' };
const ICNS_RETINA = { 32: 'ic11', 64: 'ic12', 256: 'ic13', 512: 'ic14' };
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

export function icns(entries) {
  const chunks = entries.map(({ type, png }) => Buffer.concat([Buffer.from(type, 'latin1'), uint32be(png.length + 8), png]));
  const body = Buffer.concat(chunks);
  return Buffer.concat([Buffer.from('icns', 'latin1'), uint32be(body.length + 8), body]);
}
export function ico(entries) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(16 * entries.length);
  let offset = 6 + directory.length;
  entries.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory[entry] = size === 256 ? 0 : size; directory[entry + 1] = size === 256 ? 0 : size;
    directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...entries.map(entry => entry.png)]);
}
const uint32be = value => { const buffer = Buffer.alloc(4); buffer.writeUInt32BE(value); return buffer; };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await mkdir(pngDir, { recursive: true });
  const png = {};
  for (const size of SIZES) {
    const file = join(pngDir, `${size}.png`);
    await promisify(execFile)('rsvg-convert', ['-w', String(size), '-h', String(size), source, '-o', file]);
    png[size] = await readFile(file);
  }
  await writeFile(join(here, 'typesafe-place.icns'), icns([
    ...Object.entries(ICNS).map(([size, type]) => ({ type, png: png[size] })),
    ...Object.entries(ICNS_RETINA).map(([size, type]) => ({ type, png: png[size] })),
  ]));
  await writeFile(join(here, 'typesafe-place.ico'), ico(ICO_SIZES.map(size => ({ size, png: png[size] }))));
  console.log(`wrote ${SIZES.length} PNGs, typesafe-place.icns and typesafe-place.ico`);
}
