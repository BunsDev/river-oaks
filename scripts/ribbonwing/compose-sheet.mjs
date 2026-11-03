// Compose the Ribbonwing comparison sheets from a views run (#777):
//   node scripts/ribbonwing/compose-sheet.mjs <viewsDir> <outDir>
// comparison.png: per matched view, the reference panel | the empty-craft
// capture | the silhouette overlay (red reference only, cyan capture only).
// canonical.png: the occupied canonical views. Rows are scaled to a fixed
// height; nothing is retouched.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) throw new Error('usage: compose-sheet.mjs <viewsDir> <outDir>');
mkdirSync(out, { recursive: true });
const report = JSON.parse(readFileSync(`${dir}/report.json`, 'utf8'));
const scale = (image, height) => {
  const s = height / image.height, width = Math.round(image.width * s), data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // box filter over the source footprint
    const x0 = Math.floor(x / s), x1 = Math.max(x0 + 1, Math.floor((x + 1) / s)), y0 = Math.floor(y / s), y1 = Math.max(y0 + 1, Math.floor((y + 1) / s));
    const sum = [0, 0, 0, 0];let n = 0;
    for (let sy = y0; sy < Math.min(y1, image.height); sy++) for (let sx = x0; sx < Math.min(x1, image.width); sx++) { const i = (sy * image.width + sx) * 4;for (let c = 0; c < 4; c++) sum[c] += image.data[i + c];n++; }
    data.set(sum.map(v => Math.round(v / n)), (y * width + x) * 4);
  }
  return { width, height, data };
};
// Crop a capture to its content (non-background) with a margin, so it reads at row height.
const trim = image => {
  const bg = image.data.slice(0, 3);let minX = image.width, minY = image.height, maxX = 0, maxY = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const i = (y * image.width + x) * 4;if (Math.max(...[0, 1, 2].map(c => Math.abs(image.data[i + c] - bg[c]))) < 10) continue;
    minX = Math.min(minX, x);maxX = Math.max(maxX, x);minY = Math.min(minY, y);maxY = Math.max(maxY, y);
  }
  if (maxX < minX) return image;
  const m = 16, x0 = Math.max(0, minX - m), y0 = Math.max(0, minY - m), x1 = Math.min(image.width, maxX + m), y1 = Math.min(image.height, maxY + m), width = x1 - x0, height = y1 - y0, data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) data.set(image.data.subarray(((y0 + y) * image.width + x0) * 4, ((y0 + y) * image.width + x1) * 4), y * width * 4);
  return { width, height, data };
};
const grid = (rows, gap = 6) => {
  const width = Math.max(...rows.map(row => row.reduce((w, im) => w + im.width + gap, gap))), height = rows.reduce((h, row) => h + row[0].height + gap, gap), data = new Uint8Array(width * height * 4).fill(255);
  let y0 = gap;
  for (const row of rows) { let x0 = gap;for (const im of row) { for (let y = 0; y < im.height; y++) data.set(im.data.subarray(y * im.width * 4, (y + 1) * im.width * 4), ((y0 + y) * width + x0) * 4);x0 += im.width + gap; }y0 += row[0].height + gap; }
  return { width, height, data };
};
const load = name => decodePng(readFileSync(`${dir}/${name}.png`));
const matched = Object.entries(report.views).filter(([, v]) => v.silhouette).map(([name]) => name);
writeFileSync(`${out}/comparison.png`, encodePng(grid(matched.map(name => [scale(load(`${name}-reference`), 180), scale(trim(load(`${name}-empty`)), 180), scale(load(`${name}-overlay`), 180)]))));
const canonical = ['front', 'left', 'rear', 'top', 'threeQuarter', 'rightProfile', 'boarding', 'hover', 'stuntTuck', 'cockpit', 'pilotEye', 'passengerEye', 'gear', 'thruster', 'lod-near', 'lod-medium', 'lod-far'];
const tiles = canonical.map(name => scale(trim(load(name)), 220)), rows = [];
for (let i = 0; i < tiles.length; i += 4) rows.push(tiles.slice(i, i + 4));
writeFileSync(`${out}/canonical.png`, encodePng(grid(rows)));
console.log(JSON.stringify({ matched, canonical }));
