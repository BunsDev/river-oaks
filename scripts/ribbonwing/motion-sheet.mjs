// Contact sheets of the Ribbonwing's maneuver motion clips (#777): the frames that
// preview/e2e/ribbonwing-maneuvers.js saves with RIBBONWING_MOTION_FRAMES=<dir>, in order, a
// sheet per maneuver, each frame box-downscaled by SCALE.
//   node scripts/ribbonwing/motion-sheet.mjs <framesDir> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng } from './png.mjs';
const [framesDir, outDir] = process.argv.slice(2), SCALE = 4, COLUMNS = 6;
const frames = JSON.parse(readFileSync(`${framesDir}/frames.json`, 'utf8'));
mkdirSync(outDir, { recursive: true });
const shrink = image => {
  const c = image.channels ?? image.data.length / (image.width * image.height), w = Math.floor(image.width / SCALE), h = Math.floor(image.height / SCALE), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sum = [0, 0, 0];
    for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) { const i = ((y * SCALE + dy) * image.width + x * SCALE + dx) * c;sum[0] += image.data[i];sum[1] += image.data[i + 1];sum[2] += image.data[i + 2]; }
    const o = (y * w + x) * 4;out.set([sum[0] / SCALE ** 2, sum[1] / SCALE ** 2, sum[2] / SCALE ** 2, 255], o);
  }
  return { width: w, height: h, data: out };
};
const sheets = {};
for (const kind of [...new Set(frames.map(frame => frame.kind))]) {
  const list = frames.filter(frame => frame.kind === kind).map(frame => shrink(decodePng(readFileSync(frame.file))));
  const { width: w, height: h } = list[0], rows = Math.ceil(list.length / COLUMNS), sheet = { width: w * Math.min(COLUMNS, list.length), height: h * rows, channels: 4 };
  sheet.data = new Uint8Array(sheet.width * sheet.height * 4).fill(255);
  list.forEach((frame, n) => { const ox = (n % COLUMNS) * w, oy = Math.floor(n / COLUMNS) * h;for (let y = 0; y < h; y++) sheet.data.set(frame.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * sheet.width + ox) * 4); });
  writeFileSync(`${outDir}/${kind}.png`, encodePng(sheet));sheets[kind] = list.length;
}
console.log(JSON.stringify(sheets));
