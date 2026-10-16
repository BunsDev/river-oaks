// Live office outlook cost (#449): an interleaved A/B of the penthouse's live district view.
//   node preview/e2e/office-outlook-cost.mjs <label>=<checkout> [<label>=<checkout> ...] [--rounds 3] [--cpu 4] [--out name]
// Each arm is a checkout (a worktree, or a `git archive` copy with its own node_modules) served by its
// own loopback fixture with the penthouse layout and hardware rendering. Rounds take the arms in
// alternating order, and every round opens a fresh page (a fresh WebGL context and shader cache), so
// each round measures a true first entry, the steady live outlook, and a repeat entry.
// Laptop profile: 1440x900 at DPR 1, Smoothest graphics (three-quarter scale, no AO: the preset for
// older laptops, and still the live outlook), the arrival played with motion, CPU throttled through
// CDP once the district has loaded, and vsync and the frame-rate limit off, so a frame interval is the
// frame's real cost. Metal on this Mac with a throttled CPU, not a slower GPU: not device evidence.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadavg } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const args = process.argv.slice(2), option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
const rounds = Number(option('rounds', 3)), cpu = Number(option('cpu', 4)), name = option('out', 'office-outlook-cost');
const arms = args.map(arg => { const [label, root] = arg.split('='); return { label, root: resolve(root) }; });
if (arms.length < 2 || arms.some(arm => !arm.label || !arm.root)) throw new Error('Give at least two arms as <label>=<checkout>.');
const output = `output/playwright/${name}`;
const SOURCES = ['office-skyline.js', 'office-world-scene.js', 'office-world-presentation.js', 'office-penthouse-graybox.js', 'atmosphere.js', 'main.js'];
const VIEWS = ['roof-gardens', 'overview'], SAMPLE = 180;
const median = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : null; };
const quantile = (values, q) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null; };
const round1 = value => value === null ? null : Math.round(value * 10) / 10;

// Counts what the GPU is asked to do: program links and buffer uploads, by bytes.
const glCounters = () => {
  const counters = { links: 0, uploads: 0, uploadBytes: 0 };
  const size = (data, srcOffset = 0, length = 0) => !data ? 0 : typeof data === 'number' ? data
    : length ? length * (data.BYTES_PER_ELEMENT ?? 1) : data.byteLength - srcOffset * (data.BYTES_PER_ELEMENT ?? 1);
  for (const context of [globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext].filter(Boolean)) {
    const proto = context.prototype, wrap = (method, count) => { const original = proto[method]; proto[method] = function (...a) { count(...a); return original.apply(this, a); }; };
    wrap('linkProgram', () => { counters.links++; });
    wrap('bufferData', (target, data) => { if (typeof data !== 'number') { counters.uploads++; counters.uploadBytes += size(data); } });
    wrap('bufferSubData', (target, offset, data, srcOffset, length) => { counters.uploads++; counters.uploadBytes += size(data, srcOffset, length); });
  }
  globalThis.__glCost = counters;
};

async function session(browser, arm, origin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: origin }]);
  await context.addInitScript(() => localStorage.setItem('river-oaks-graphics', 'smooth'));
  await context.addInitScript(glCounters);
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(300000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${origin}/?motion-debug=1&render-audit=1`, { waitUntil: 'commit' });
    for (let attempt = 0; ; attempt++) {
      const state = await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('error') ? 'error'
        : document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && document.querySelectorAll('#destination option').length > 1 && 'ready').then(h => h.jsonValue());
      if (state === 'ready') break;
      if (attempt > 0) throw new Error('the district failed to load twice');
      await page.locator('#reload').evaluate(button => button.click());
    }
    await page.waitForFunction(() => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot?.players.some(p => p.id === window.__riverMultiplayer().selfId));
    await page.evaluate(async () => { for (let i = 0; i < 60; i++) await new Promise(requestAnimationFrame); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

    // Every frame from F until the office has drawn its live outlook for 90 frames: the entry's
    // longest frames and the programs it linked. The recorder runs in the page (`raf` polling).
    const entry = async label => {
      await page.locator('#office-lobby').evaluate(button => button.click());
      await page.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false);
      const recording = page.waitForFunction(() => {
        const r = window.__entryRecord ??= { frames: [], last: performance.now(), links: window.__glCost.links, after: 0 };
        const now = performance.now(), office = window.__riverOffice?.();
        r.frames.push({ ms: now - r.last, phase: office?.phase ?? null, links: window.__glCost.links - r.links });
        r.last = now; r.links = window.__glCost.links;
        if (office?.phase === 'office' && office.skyline?.state === 'live') r.after++;
        return r.after >= 90;
      }, null, { polling: 'raf', timeout: 300000 });
      recording.catch(() => {});
      await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
      await recording;
      const record = await page.evaluate(() => { const r = window.__entryRecord; delete window.__entryRecord; return r.frames; });
      const precompile = await page.evaluate(() => window.__riverOffice()?.precompile ?? null);
      const ms = record.map(f => f.ms), shown = record.findIndex(f => ['opening', 'arriving', 'office'].includes(f.phase));
      return { label, frames: record.length, seconds: round1(ms.reduce((a, b) => a + b, 0) / 1000), longestMs: round1(Math.max(...ms)),
        over50: ms.filter(v => v > 50).length, over100: ms.filter(v => v > 100).length, links: record.reduce((a, f) => a + f.links, 0),
        linksAtShow: shown >= 0 ? record.slice(shown, shown + 3).reduce((a, f) => a + f.links, 0) : null,
        showMs: shown >= 0 ? round1(Math.max(...ms.slice(shown, shown + 3))) : null, precompile };
    };
    // The steady live outlook from a fixed view: frame interval, whole-frame CPU, draws, triangles
    // and bytes uploaded per frame.
    const steady = async view => {
      await page.locator('#office-view').selectOption(view);
      await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame); });
      return page.evaluate(async count => {
        const audit = window.__riverRenderAudit, samples = []; audit.start();
        let bytes = window.__glCost.uploadBytes, uploads = window.__glCost.uploads;
        for (let i = 0; i < count; i++) {
          await new Promise(requestAnimationFrame);
          const { calls, triangles } = audit.graphics().render;
          samples.push({ calls, triangles, bytes: window.__glCost.uploadBytes - bytes, uploads: window.__glCost.uploads - uploads, skylineMs: window.__riverOffice()?.skyline?.lastRenderMs ?? null });
          bytes = window.__glCost.uploadBytes; uploads = window.__glCost.uploads;
        }
        const { frames } = audit.stop();
        return { samples, frames, quality: audit.graphics().quality, outlook: window.__riverOffice()?.skyline ?? null, precompile: window.__riverOffice()?.precompile ?? null };
      }, SAMPLE).then(({ samples, frames, quality, outlook, precompile }) => ({ view, precompile,
        intervalMs: round1(median(frames.map(f => f.intervalMs))), intervalP95Ms: round1(quantile(frames.map(f => f.intervalMs), 0.95)),
        cpuMs: round1(median(frames.map(f => f.cpuMs))), calls: median(samples.map(s => s.calls)), triangles: median(samples.map(s => s.triangles)),
        uploadKiB: round1(median(samples.map(s => s.bytes)) / 1024), uploadsPerFrame: median(samples.map(s => s.uploads)),
        outlookDrawMs: round1(median(samples.map(s => s.skylineMs))), scale: quality?.scale ?? null, mode: outlook?.mode ?? null, hidden: outlook ? { instances: outlook.hiddenInstances, meshes: outlook.hiddenMeshes } : null }));
    };
    const leave = async () => {
      // Escape leaves a view before it leaves the office; the exit button leaves the office.
      if (await page.locator('#office-view').inputValue()) { await page.locator('#office-visit').focus(); await page.keyboard.press('Escape'); }
      await page.locator('#office-exit').click();
      await page.waitForFunction(() => !document.querySelector('#office-visit')?.open && window.__riverOffice() === null);
      await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame); });
    };
    const first = await entry('first');
    const views = []; for (const view of VIEWS) views.push(await steady(view));
    await leave();
    const repeat = await entry('repeat');
    await leave();
    return { first, views, repeat, errors };
  } finally { await context.close(); }
}

const sourcesOf = async root => Object.fromEntries(await Promise.all(SOURCES.map(async file => [file, createHash('sha256').update(await readFile(`${root}/preview/src/${file}`)).digest('hex').slice(0, 16)])));
await mkdir(output, { recursive: true });
const release = await holdBrowserLock('Office outlook cost A/B');
const fixtures = [];
let browser;
try {
  for (const arm of arms) {
    const { startBrowserFixture } = await import(pathToFileURL(`${arm.root}/preview/e2e/fixture-server.js`).href);
    fixtures.push(await startBrowserFixture({ env: { RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', VITE_SHARED_SOFTWARE_RENDERING: '0' } }));
    arm.origin = fixtures.at(-1).origin; arm.sources = await sourcesOf(arm.root); arm.runs = [];
  }
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
  for (let round = 0; round < rounds; round++) {
    for (const arm of round % 2 ? [...arms].reverse() : arms) {
      const started = Date.now(), run = await session(browser, arm, arm.origin);
      arm.runs.push({ round, load: loadavg().map(n => Number(n.toFixed(1))), seconds: Math.round((Date.now() - started) / 1000), ...run });
      console.log(JSON.stringify({ round, arm: arm.label, first: run.first, views: run.views.map(v => ({ view: v.view, intervalMs: v.intervalMs, cpuMs: v.cpuMs, calls: v.calls, uploadKiB: v.uploadKiB })), repeat: { longestMs: run.repeat.longestMs, links: run.repeat.links } }));
    }
  }
  const summary = Object.fromEntries(arms.map(arm => [arm.label, {
    first: Object.fromEntries(['longestMs', 'showMs', 'links', 'linksAtShow', 'over50', 'over100'].map(key => [key, median(arm.runs.map(r => r.first[key]))])),
    repeat: Object.fromEntries(['longestMs', 'showMs', 'links', 'over50'].map(key => [key, median(arm.runs.map(r => r.repeat[key]))])),
    views: Object.fromEntries(VIEWS.map((view, i) => [view, Object.fromEntries(['intervalMs', 'intervalP95Ms', 'cpuMs', 'calls', 'triangles', 'uploadKiB', 'uploadsPerFrame', 'outlookDrawMs'].map(key => [key, median(arm.runs.map(r => r.views[i][key]))]))])),
    errors: arm.runs.flatMap(r => r.errors),
  }]));
  const receipt = { status: 'passed', browser: await browser.version(), profile: { viewport: [1440, 900], deviceScaleFactor: 1, graphics: 'smooth', cpuThrottle: cpu, vsync: 'off', arrival: 'with motion', rounds, sample: SAMPLE, views: VIEWS },
    arms: arms.map(({ label, root, sources, runs }) => ({ label, root, sources, runs })), summary, limits: 'Metal on one Mac with a CDP-throttled CPU; the GPU is not throttled. Medians of interleaved rounds; not device or production evidence.' };
  await writeFile(`${output}/result.json`, JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({ summary }, null, 1));
} finally { await browser?.close(); for (const fixture of fixtures) await fixture.close(); release(); }
