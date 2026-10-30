// Ribbonwing canonical views and reference comparison (#777).
//   node scripts/browser-lock.mjs 'ribbonwing views' -- node preview/e2e/ribbonwing-views.js [outDir]
// Renders every view in docs/design/ribbonwing/camera-manifest.json with the
// occupants, and the empty craft for silhouette views; compares each matched
// view's silhouette and material zones with the reference panel; writes the
// captures, overlays, the annotated sheet and report.json to outDir
// (default .runtime/ribbonwing/views-<timestamp>).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { decodePng, encodePng, crop } from '../../scripts/ribbonwing/png.mjs';
import { silhouette, alphaSilhouette, normalized, iou, overlay, aspect } from '../../scripts/ribbonwing/silhouette.mjs';
import { REFERENCES } from '../../scripts/ribbonwing/reference-panels.mjs';
import { RIBBONWING_VERSION } from '../src/ribbonwing-design.js';

const repo = fileURLToPath(new URL('../../', import.meta.url)), root = fileURLToPath(new URL('../', import.meta.url));
const out = process.argv[2] ?? `${repo}.runtime/ribbonwing/views-${new Date().toISOString().replace(/[:.]/g, '-')}`;
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(`${repo}docs/design/ribbonwing/camera-manifest.json`, 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const references = {};
for (const [key, reference] of Object.entries(REFERENCES)) {
  const bytes = await readFile(`${repo}${reference.file}`);if (sha(bytes) !== reference.sha256) throw new Error(`${reference.file} changed`);
  references[key] = decodePng(bytes);
}
// Coarse material zones of craft pixels: lacquer pink, mint/teal glass, dark
// mechanical, light ivory/chrome; fractions of the silhouette.
const zones = (image, sil, rect = [0, 0, image.width, image.height]) => {
  const count = { pink: 0, glass: 0, dark: 0, light: 0, other: 0 };let total = 0;
  for (let y = 0; y < sil.height; y++) for (let x = 0; x < sil.width; x++) {
    if (!sil.mask[y * sil.width + x]) continue;total++;
    const i = ((rect[1] + y) * image.width + rect[0] + x) * 4, r = image.data[i], g = image.data[i + 1], b = image.data[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi < 80) count.dark++;else if (r > g + 35 && r > b + 15) count.pink++;else if (g >= r && b >= r - 10 && hi - lo > 18) count.glass++;else if (lo > 175) count.light++;else count.other++;
  }
  return Object.fromEntries(Object.entries(count).map(([k, v]) => [k, +(v / Math.max(1, total)).toFixed(4)]));
};

const vite = await createServer({ configFile: false, root, cacheDir: `${repo}.runtime/ribbonwing-vite`, server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
let browser;
const report = { version: RIBBONWING_VERSION, revision: null, references: Object.fromEntries(Object.entries(REFERENCES).map(([k, r]) => [k, { file: r.file, sha256: r.sha256 }])), renderer: manifest.renderer, views: {}, fit: null, stats: null, errors: [] };
try {
  const { execFileSync } = await import('node:child_process');
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  report.dirty = execFileSync('git', ['status', '--porcelain', '--', 'preview/src', 'preview/e2e', 'docs/design/ribbonwing'], { cwd: repo, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  await vite.listen();browser = await chromium.launch({ headless: true });
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const open = async (avatars, mask = false) => {
    const page = await browser.newPage({ viewport: { width: manifest.renderer.width, height: manifest.renderer.height } });
    page.on('pageerror', error => report.errors.push(`${avatars ? 'occupied' : 'empty'}: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(`${avatars ? 'occupied' : 'empty'} console: ${message.text()}`); });
    await page.goto(`${origin}/e2e/fixtures/ribbonwing.html?avatars=${avatars ? 1 : 0}&ground=${avatars ? 1 : 0}&mask=${mask ? 1 : 0}&w=${manifest.renderer.width}&h=${manifest.renderer.height}`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true', null, { timeout: 600000 });
    return page;
  };
  const shoot = async (page, name, view, transparent = false) => {
    const stats = await page.evaluate(([view]) => { const f = window.ribbonwingFixture;f.pose({ phase: 'parked', altitude: 0, boarding: false, tuck: 0, roll: 0, pitch: 0, occupied: f.withAvatars, ...view.state });return f.render(view); }, [view]);
    const bytes = await page.locator('canvas').screenshot({ omitBackground: transparent });await writeFile(`${out}/${name}.png`, bytes);return { stats, image: decodePng(bytes) };
  };
  // Occupied canonical set.
  const occupied = await open(true);
  report.stats = await occupied.evaluate(() => window.ribbonwingFixture.stats());
  for (const [name, view] of Object.entries(manifest.views)) report.views[name] = { occupied: (await shoot(occupied, name, view)).stats };
  report.fit = { parked: await occupied.evaluate(() => { const f = window.ribbonwingFixture;f.pose({ phase: 'ready', occupied: true });return f.fit(); }) };
  // Level-of-detail captures at their transition distances.
  for (const lod of ['near', 'medium', 'far']) {
    report.views[`lod-${lod}`] = { stats: await occupied.evaluate(([lod]) => { const f = window.ribbonwingFixture;f.pose({ phase: 'parked' });return f.render({ projection: 'perspective', fov: 26, position: [-9.2, 5.4, 8.6], target: [0, 1.2, .2] }, { lod }); }, [lod]) };
    await writeFile(`${out}/lod-${lod}.png`, await occupied.locator('canvas').screenshot());
  }
  await occupied.close();
  // Empty craft for silhouettes (alpha) and material zones (lit, on the
  // reference background) against the matched panels.
  const empty = await open(false), masked = await open(false, true);
  for (const [name, view] of Object.entries(manifest.views)) {
    if (!view.reference || view.silhouette === false) continue;
    const { image } = await shoot(empty, `${name}-empty`, view), { image: alpha } = await shoot(masked, `${name}-mask`, view, true);
    const [sheet, panel] = view.reference, rect = REFERENCES[sheet].panels[panel], refImage = references[sheet];
    const refSil = silhouette(refImage, rect), capSil = alphaSilhouette(alpha);
    const a = normalized(refSil), b = normalized(capSil);
    await writeFile(`${out}/${name}-overlay.png`, encodePng(overlay(a, b)));
    await writeFile(`${out}/${name}-reference.png`, encodePng(crop(refImage, rect)));
    report.views[name].silhouette = { iou: +iou(a, b).toFixed(4), referenceAspect: +aspect(refSil).toFixed(4), captureAspect: +aspect(capSil).toFixed(4), referenceZones: zones(refImage, refSil, rect), captureZones: zones(image, capSil) };
  }
  await empty.close();await masked.close();
} finally {
  await browser?.close();await vite.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ out, version: report.version, revision: report.revision, errors: report.errors, fit: report.fit, silhouettes: Object.fromEntries(Object.entries(report.views).filter(([, v]) => v.silhouette).map(([k, v]) => [k, v.silhouette.iou])) }, null, 2));
if (report.errors.length) process.exitCode = 1;
