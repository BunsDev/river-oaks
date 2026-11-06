// Measure the reference silhouettes: bounding boxes, aspect ratios and fill per
// panel, verify the original bytes' SHA-256, and optionally write debug masks.
// node scripts/ribbonwing/measure-references.mjs [--debug <dir>] [--out <json>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodePng, encodePng } from './png.mjs';
import { silhouette, aspect } from './silhouette.mjs';
import { REFERENCES, SILHOUETTE_PANELS } from './reference-panels.mjs';

const argument = name => { const i = process.argv.indexOf(name);return i > 0 ? process.argv[i + 1] : null; };
const debug = argument('--debug'), out = argument('--out');
if (debug) mkdirSync(debug, { recursive: true });
const result = { references: {}, panels: {} };
const images = {};
for (const [key, reference] of Object.entries(REFERENCES)) {
  const bytes = readFileSync(reference.file), sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== reference.sha256) throw new Error(`${reference.file} changed: ${sha256}`);
  images[key] = decodePng(bytes);
  result.references[key] = { file: reference.file, bytes: bytes.length, sha256, width: images[key].width, height: images[key].height };
}
for (const [sheet, panel] of SILHOUETTE_PANELS) {
  const rect = REFERENCES[sheet].panels[panel], sil = silhouette(images[sheet], rect);
  const [x0, y0, x1, y1] = sil.bbox;
  result.panels[`${sheet}.${panel}`] = { rect, bbox: [x0 + rect[0], y0 + rect[1], x1 + rect[0], y1 + rect[1]], widthPx: x1 - x0, heightPx: y1 - y0, aspect: +aspect(sil).toFixed(4), fill: +(sil.area / ((x1 - x0) * (y1 - y0))).toFixed(4) };
  if (debug) {
    const data = new Uint8Array(sil.width * sil.height * 4);
    for (let y = 0; y < sil.height; y++) for (let x = 0; x < sil.width; x++) {
      const i = y * sil.width + x, s = ((rect[1] + y) * images[sheet].width + rect[0] + x) * 4;
      const src = images[sheet].data;data.set(sil.mask[i] ? [src[s] * .5 + 115, src[s + 1] * .5, src[s + 2] * .5, 255] : [src[s], src[s + 1], src[s + 2], 255], i * 4);
    }
    writeFileSync(`${debug}/${sheet}-${panel}.png`, encodePng({ width: sil.width, height: sil.height, data }));
  }
}
const text = JSON.stringify(result, null, 2);
if (out) writeFileSync(out, text + '\n');
console.log(text);
