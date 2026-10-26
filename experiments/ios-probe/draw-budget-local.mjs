// #289 draw budget: draws by pass and same-instant image parity for development
// toggles, in the draw census's phone profile (local WebKit, 440×796 at DPR 3, AO off).
// Each variant is switched on alone, then all together. Every variant frame is compared
// with a reference frame rendered just before it at the same instant (__riverRenderAudit.still),
// so the scene never advances between the two. Draw counts map onto the phone; timings
// and GPU cost here do not.
//
//   node experiments/ios-probe/draw-budget-local.mjs [out.json] [--variants=a,b] [--combined=a,b] [--revision=id]
//     [--view=x,y,z,tx,ty,tz | --frame=<name>[|<name>…] | --frame-shadow=<name>[|<name>…] | --frame-room=<index>]
//     [--sensitive=<variant> --attempts=N]
// --combined names the variants switched on together for the final comparison (default: all).
// --frame looks past a named node the way its shadow falls; --frame-shadow looks down on the
// ground where its shadow lands; --frame-room looks into the index-th store nearest the camera.
// Framing is refreshed before each variant, so a moving node (a bird) stays in view.
// --sensitive names a variant (casters off) that must change the framed view, or its parity
// proves nothing. Each attempt reframes (the next name, the next room, or a moment later) until
// it does; then every variant and the combined set are compared at that same instant.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { webkit } from 'playwright';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? '.runtime/ios-draw-289/draw-budget.json';
const variants = (option('variants') ?? '').split(',').filter(Boolean);
const combined = option('combined')?.split(',').filter(Boolean) ?? variants;
const revision = option('revision') ?? 'river-oaks-gardens-3';
const view = option('view')?.split(',').map(Number);
const framed = (option('frame-shadow') ?? option('frame'))?.split('|'), frameShadow = Boolean(option('frame-shadow'));
const frameRoom = option('frame-room') === undefined ? null : Number(option('frame-room'));
const sensitive = option('sensitive') ?? null, attempts = Number(option('attempts') ?? 1);
const release = await holdBrowserLock('iOS draw budget');
let fixture, browser;
const report = { scope: 'macOS WebKit, local fixture; draw counts and same-instant image parity, not phone timing', revision,
  view: view ?? (framed ? { [frameShadow ? 'frameShadow' : 'frame']: framed } : frameRoom !== null ? { frameRoom } : 'spawn'), sensitive, variants, combined, status: 'running' };
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_DISTRICT_REVISION: revision, RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1' } });
  browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width: 440, height: 796 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'fixture_session', value: 'bob', url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(150000);
  await page.goto(`${fixture.origin}/?render-audit=1&motion-debug=1&ao=off`);
  await page.waitForFunction(() => {
    const host = document.querySelector('#canvas-host')?.dataset;
    const asset = document.querySelector('#viewport')?.dataset.assetProgress;
    return host?.playerReady === 'true' && host.multiplayer === 'joined' && host.storePeopleTotal === host.storePeopleReady
      && asset && JSON.parse(asset).done === true && document.querySelector('#loading')?.hidden;
  });
  if (view) await page.evaluate(([x, y, z, tx, ty, tz]) => globalThis.__riverRenderAudit.view({ position: [x, y, z], target: [tx, ty, tz] }), view);
  await page.waitForTimeout(5000);
  Object.assign(report, await page.evaluate(async ({ variants, combined, framed, frameShadow, frameRoom, sensitive, attempts }) => {
    const audit = globalThis.__riverRenderAudit;
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    // The render loop applies the audit camera, so two frames pass before a framed still.
    const reframe = async (attempt = 0) => {
      let target = null;
      if (framed) target = audit.frame(framed[attempt % framed.length], { shadow: frameShadow });
      else if (frameRoom !== null) target = audit.frameRoom(frameRoom + attempt);
      else return null;
      await frame(); await frame(); return target;
    };
    const byPass = async () => {
      const census = await audit.drawCensus();
      return Object.entries(census).reduce((sum, [key, value]) => { const pass = key.split(':')[0]; sum[pass] = (sum[pass] ?? 0) + value.draws; return sum; }, {});
    };
    // The draw census's attribution: pass and the first three named ancestors, per frame.
    const source = await (await fetch('/src/render-pipeline.js')).text();
    const { RenderPass } = await import([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]).find(value => value.includes('RenderPass')));
    const owners = async (count = 3) => {
      const original = RenderPass.prototype.render, records = new Map(); let frames = 0;
      RenderPass.prototype.render = function (renderer, ...args) {
        const draw = renderer.renderBufferDirect;
        renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
          const names = []; for (let node = object; node; node = node.parent) if (node.name) names.push(node.name);
          const key = `${scene === null ? 'shadow' : 'main'} ${names.reverse().slice(0, 3).join('/') || object.type}`;
          records.set(key, (records.get(key) ?? 0) + 1);
          return draw.call(this, camera, scene, geometry, material, object, group);
        };
        try { return original.call(this, renderer, ...args); } finally { renderer.renderBufferDirect = draw; frames++; }
      };
      try { for (let i = 0; i < count; i++) await frame(); } finally { RenderPass.prototype.render = original; }
      return Object.fromEntries([...records].map(([key, calls]) => [key, +(calls / frames).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 60));
    };
    const compare = (first, second) => {
      let changed = 0, total = 0, max = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
      for (let i = 0; i < first.pixels.length; i++) {
        const delta = Math.abs(first.pixels[i] - second.pixels[i]); if (!delta) continue;
        changed++; total += delta; max = Math.max(max, delta);
        const pixel = i >> 2, x = pixel % first.width, y = first.height - 1 - Math.floor(pixel / first.width);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      return { changedChannels: changed, meanError: total / first.pixels.length, maxError: max, box: changed ? [minX, minY, maxX, maxY] : null };
    };
    const toggles = {
      // The #285 lean set: interiors under their roofs, parked bikes, bird cams stop casting.
      'lean-shadows': on => audit.shadowCasters(on ? 'lean' : 'all'),
    };
    for (const name of new Set([...variants, ...combined, ...(sensitive ? [sensitive] : [])])) if (!toggles[name] && !audit.drawBudget?.[name]) throw new Error(`Unknown variant ${name}`);
    const set = (name, on) => (toggles[name] ?? audit.drawBudget[name])(on);
    for (const name of new Set([...variants, ...combined])) set(name, false);
    await reframe(); await frame(); await frame();
    const result = { graphics: (({ quality, pipeline, render, viewport, buffer }) => ({ quality, pipeline, render, viewport, buffer }))(audit.graphics()) };
    result.reference = { byPass: await byPass(), owners: await owners() };
    const reference = audit.still();
    result.reference.calls = reference.calls;
    result.control = compare(reference, audit.still()); // the noise floor of two identical renders
    // One variant against its own reference, rendered at the same instant just before it.
    const measure = async names => {
      const target = await reframe(), before = audit.still();
      for (const name of names) set(name, true);
      const still = audit.still();
      return { target, referenceCalls: before.calls, calls: still.calls, parity: compare(before, still), byPass: await byPass() };
    };
    result.variants = {};
    if (sensitive) {
      // Every comparison at one instant, once the sensitivity variant shows it can see the change.
      const still = names => { for (const name of names) set(name, true); const shot = audit.still(); for (const name of names) set(name, false); return shot; };
      for (let attempt = 0; attempt < attempts && !result.sensitivity; attempt++) {
        const target = await reframe(attempt), before = audit.still(), probe = still([sensitive]);
        const sensitivity = compare(before, probe);
        result.attempts = attempt + 1;
        if (!sensitivity.changedChannels) { await new Promise(resolve => setTimeout(resolve, 400)); continue; }
        result.sensitivity = { variant: sensitive, target, calls: probe.calls, parity: sensitivity };
        for (const name of variants) { const shot = still([name]); result.variants[name] = { target, referenceCalls: before.calls, calls: shot.calls, parity: compare(before, shot) }; }
        if (combined.length > 1) { const shot = still(combined); result.combined = { target, referenceCalls: before.calls, calls: shot.calls, parity: compare(before, shot) }; }
        result.control = compare(before, audit.still());
      }
      if (!result.sensitivity) throw new Error(`${sensitive} never changed the framed view in ${attempts} attempts`);
    } else {
      for (const name of variants) { result.variants[name] = await measure([name]); set(name, false); }
      if (combined.length > 1) {
        result.combined = await measure(combined);
        result.combined.owners = await owners();
        for (const name of combined) set(name, false);
      }
    }
    return result;
  }, { variants, combined, framed, frameShadow, frameRoom, sensitive, attempts }));
  await page.screenshot({ path: out.replace(/\.json$/, '.png') });
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = error.message; process.exitCode = 1; }
finally {
  await browser?.close(); await fixture?.close(); release();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, reference: report.reference && { calls: report.reference.calls, byPass: report.reference.byPass },
    control: report.control, sensitivity: report.sensitivity, attempts: report.attempts, variants: report.variants && Object.fromEntries(Object.entries(report.variants).map(([name, value]) => [name, { calls: value.calls, byPass: value.byPass, parity: value.parity }])),
    combined: report.combined && { calls: report.combined.calls, byPass: report.combined.byPass, parity: report.combined.parity } }));
}
