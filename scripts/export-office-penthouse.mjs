// The penthouse asset package (#362), built from its JS master (preview/src/office-penthouse-furnishings.js)
// on the authenticated local fixture. Hardware (Metal ANGLE) rendering on this Mac; not device proof.
//
//   node scripts/export-office-penthouse.mjs preview [label]   # asset-preview captures only, into output/
//   node scripts/export-office-penthouse.mjs export            # GLBs into assets/office-penthouse/, reimported,
//                                                             # plus captures and assets/office-penthouse/export.json
//
// Every GLB is reimported in the page (GLTFLoader, textures decoded) and checked against what was
// built: its nodes, LODs, collision proxy and anchors, triangle counts, and that no texture is missing.
// Then run scripts/export-office-penthouse-blender.py for the editable .blend.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { chromium } from 'playwright';
import { startBrowserFixture } from '../preview/e2e/fixture-server.js';
import { holdBrowserLock } from './browser-lock.mjs';

const [mode = 'preview', label = 'preview'] = process.argv.slice(2);
assert.ok(['preview', 'export'].includes(mode), 'mode is preview or export');
const exporting = mode === 'export';
const captures = exporting ? 'docs/design/office-ipic/captures/penthouse/asset-preview' : `output/playwright/penthouse-assets/${label}`;
const HOURS = { day: 12, evening: 18.75 };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = ['preview/src/office-penthouse-furnishings.js', 'preview/src/office-penthouse-graybox.js', 'preview/src/office-layouts.js', 'preview/e2e/fixtures/office-penthouse.js'];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sources.map(async file => [file, sha(await readFile(file))])));
const before = await sourceHashes();
await mkdir(captures, { recursive: true });
if (exporting) await mkdir('assets/office-penthouse/models', { recursive: true });
const release = await holdBrowserLock('Penthouse asset package');
let fixture, browser;
try {
  fixture = await startBrowserFixture();
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : [] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${fixture.origin}/e2e/fixtures/office-penthouse.html`);
  await page.waitForFunction(() => window.penthouseReview?.ready, null, { timeout: 120000 });
  const views = [];
  for (const [time, hour] of Object.entries(HOURS)) {
    await page.evaluate(h => window.penthouseReview.setHour(h), hour);
    for (const name of Object.keys(await page.evaluate(() => window.penthouseReview.views))) {
      await page.evaluate(id => window.penthouseReview.view(id), name);
      const file = `${captures}/${name}-${time}.jpg`;
      await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
      views.push({ view: name, time, hour, file, ...await page.evaluate(() => window.penthouseReview.stats()) });
    }
  }
  const receipt = { status: 'passed', mode, label: exporting ? 'asset preview (fixture lighting), not runtime' : label, browser: await browser.version(), loadAverage: loadavg().map(n => Number(n.toFixed(1))), viewport: [1440, 900], views };
  if (exporting) {
    const write = async (file, base64) => { const bytes = Buffer.from(base64, 'base64'); assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${file} is a GLB`); assert.equal(bytes.readUInt32LE(8), bytes.length); await writeFile(file, bytes); return bytes; };
    const files = [];
    for (const id of await page.evaluate(() => window.penthouseReview.assets())) {
      const base64 = await page.evaluate(asset => window.penthouseReview.exportAsset(asset), id), file = `assets/office-penthouse/models/${id}.glb`;
      const bytes = await write(file, base64), back = await page.evaluate(data => window.penthouseReview.reimport(data), base64);
      for (const node of ['LOD0', 'LOD1', `COL_${id}`]) assert.ok(back.nodes.includes(node), `${id} reimports ${node}`);
      assert.deepEqual(back.missingTextures, [], `${id} textures decode`);
      files.push({ id, file, bytes: bytes.length, sha256: sha(bytes), reimport: back });
    }
    await mkdir('assets/office-penthouse/textures', { recursive: true });
    for (const [name, url] of Object.entries(await page.evaluate(() => window.penthouseReview.surfaces()))) {
      const bytes = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'), file = `assets/office-penthouse/textures/${name}.jpg`;
      assert.equal(bytes.readUInt16BE(0), 0xffd8, `${file} is a JPEG`);
      await writeFile(file, bytes); files.push({ id: `texture-${name}`, file, bytes: bytes.length, sha256: sha(bytes) });
    }
    const base64 = await page.evaluate(() => window.penthouseReview.exportScene()), file = 'assets/office-penthouse/office-penthouse.glb';
    const bytes = await write(file, base64), back = await page.evaluate(data => window.penthouseReview.reimport(data), base64);
    assert.deepEqual(back.missingTextures, [], 'scene textures decode');
    assert.ok(back.materials.includes('SCREEN_DYNAMIC'), 'displays keep the reserved screen material');
    files.push({ id: 'office-penthouse', file, bytes: bytes.length, sha256: sha(bytes), reimport: back });
    receipt.exports = files;
    const { PENTHOUSE_FINISHES } = await import('../preview/src/office-penthouse-furnishings.js');
    await writeFile('assets/office-penthouse/materials.json', `${JSON.stringify({ package: 'office-penthouse', note: 'One material per finish; tinted finishes take vertex colour. Surfaces are in textures/ (sRGB, 512 px) and tile at `tile` metres.', finishes: PENTHOUSE_FINISHES }, null, 2)}\n`);
  }
  assert.deepEqual(errors, [], errors.join('; '));
  assert.ok(views.every(v => v.error === 0), 'no WebGL errors');
  // An export must come from one revision; a preview only warns when files changed mid-run.
  const after = await sourceHashes();
  if (exporting) assert.deepEqual(after, before, 'sources stayed fixed during the run');
  else if (JSON.stringify(after) !== JSON.stringify(before)) console.warn('sources changed during the preview run; captures show what the page loaded');
  receipt.sources = before;
  await writeFile(exporting ? 'assets/office-penthouse/export.json' : `${captures}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ mode, views: views.length, exports: receipt.exports?.length ?? 0, calls: views.map(v => v.calls) }));
} finally { await browser?.close(); await fixture?.close(); release(); }
