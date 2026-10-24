// Evaluation only: measure in-house vs offline-generated District blocks in Chromium.
// node scripts/browser-lock.mjs procedural-tools -- node experiments/procedural-tools/measure-browser.mjs \
//   --glb-dir .runtime/procedural-tools --materials <dir with materials/*.jpg> --out <report.json>
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { createReadStream, createWriteStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '../..');
const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? null : process.argv[i + 1]; };
const glbDir = resolve(arg('glb-dir') ?? '.runtime/procedural-tools'), out = resolve(arg('out') ?? join(glbDir, 'browser-report.json'));
const materials = arg('materials') ? resolve(arg('materials')) : null, repeats = Number(arg('repeats') ?? 3);
const bake = process.argv.includes('--bake'), bakedGlb = join(glbDir, 'inhouse-baked.glb');

const serveDir = (prefix, dir) => ({
  name: `serve-${prefix}`,
  configureServer(server) {
    server.middlewares.use(prefix, (req, res, next) => {
      const file = join(dir, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(dir) || !existsSync(file)) return next();
      res.setHeader('Content-Type', file.endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream');
      createReadStream(file).pipe(res);
    });
  },
});

const server = await createServer({
  root: join(here, 'harness'), publicDir: join(root, 'preview/public'), logLevel: 'warn',
  define: { __RIVER_OAKS_BUILD__: JSON.stringify({ version: 'eval', commit: 'eval' }) },
  server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  plugins: [serveDir('/glb', glbDir), {
    // --bake: the harness posts the GLTFExporter output here.
    name: 'bake-upload',
    configureServer(server) {
      server.middlewares.use('/bake-upload', (req, res) => req.pipe(createWriteStream(bakedGlb)).on('finish', () => res.end('ok')));
    },
  }, ...(materials ? [serveDir('/assets/materials', materials)] : [])],
});
await server.listen();
const url = server.resolvedUrls.local[0];

const CASES = [
  { mode: 'inhouse', view: 'overview' }, { mode: 'inhouse', view: 'street' },
  { mode: 'glb', src: '/glb/joined.glb', view: 'overview' }, { mode: 'glb', src: '/glb/joined.glb', view: 'street' },
  { mode: 'glb', src: '/glb/joined-meshopt.glb', view: 'overview' },
  { mode: 'glb', src: '/glb/realized.glb', view: 'overview' },
  { mode: 'glb', src: '/glb/instanced.glb', view: 'overview' }, { mode: 'glb', src: '/glb/instanced.glb', view: 'street' },
  { mode: 'glb', src: '/glb/instanced-meshopt.glb', view: 'overview' },
  { mode: 'glb', src: '/glb/joined-4x4.glb', view: 'wide' },
  { mode: 'glb', src: '/glb/instanced-meshopt-4x4.glb', view: 'wide' },
  { mode: 'glb', src: '/glb/o2w-lod1.glb', view: 'o2w' }, { mode: 'glb', src: '/glb/o2w-lod3.glb', view: 'o2w' },
  { mode: 'glb', src: '/glb/inhouse-baked.glb', view: 'overview' }, { mode: 'glb', src: '/glb/inhouse-baked.glb', view: 'street' },
];
const only = arg('only');

const browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--enable-precise-memory-info'] : ['--enable-precise-memory-info'] });
const results = [], shots = join(dirname(out), 'shots');
mkdirSync(shots, { recursive: true });
let bakeReport = null;
try {
  if (bake) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url);
    await page.waitForFunction(() => window.harnessReady, null, { timeout: 60000 });
    bakeReport = { ...await page.evaluate(() => window.bake()), errors };
    console.log(JSON.stringify({ bake: { ...bakeReport, warnings: bakeReport.warnings.length } }));
    await context.close();
  }
  for (const item of CASES.filter(item => !only || (item.src ?? 'district').includes(only))) {
    for (let run = 0; run < repeats; run++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('requestfailed', request => errors.push(`failed ${request.url()}`));
      await page.goto(url);
      await page.waitForFunction(() => window.harnessReady, null, { timeout: 60000 });
      const result = await page.evaluate(options => window.measure(options), item);
      // Let texture loads settle so screenshots show what a visitor would see.
      await page.waitForTimeout(1500);
      const name = `${item.mode}-${(item.src ?? 'district').split('/').pop().replace('.glb', '')}-${item.view}.png`;
      if (run === 0) await page.screenshot({ path: join(shots, name) });
      results.push({ ...result, run, errors, screenshot: run === 0 ? name : null });
      console.log(JSON.stringify({ case: name, run, calls: result.calls, triangles: result.triangles, load: Math.round(result.fetchMs + result.buildOrParseMs), cpuP95: result.cpu.p95, frameP95: result.frame.p95, errors: errors.length }));
      await context.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(out, JSON.stringify({
  generatedBy: 'experiments/procedural-tools/measure-browser.mjs', host: { platform: process.platform, arch: process.arch, cpus: os.cpus()[0]?.model, logical: os.cpus().length, load: os.loadavg() },
  browser: browser.version?.() ?? null, viewport: '1440x1000@1', repeats, materialsServed: Boolean(materials), bake: bakeReport, results,
}, null, 2) + '\n');
console.log(`wrote ${out}`);
