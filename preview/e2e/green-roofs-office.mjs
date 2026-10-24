// Uses the existing approved local identity fixture and the actual shared-world
// arrival/office/terrace path. Skyline remains enabled even on software devices.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
// Explicit candidate selection keeps the historical garage inspection available.
// node preview/e2e/green-roofs-office.mjs [garage|gardens]
const revision = process.argv[2] ?? 'garage';
assert.ok(['garage', 'gardens'].includes(revision), 'choose garage or gardens');
const release = await holdBrowserLock('Green roofs actual office and terrace');
let fixture, browser;
const output = `output/playwright/green-roofs-office-${revision}-challenge`;
await mkdir(output, { recursive: true });
const sourceNames=['office-skyline.js','office-world-scene.js','office-world-presentation.js','office-layouts.js','office-penthouse-graybox.js','office-contract.js','office-arrival-model.js','district.js','reference-facades.js','main.js','green-roofs.js','roof-grasses.js','roof-field-mesh.js','roof-field-boundaries.js','hermes-roof-surface.js'];
sourceNames.push('garden-campus.js', 'garden-campus-district.js', '../../shared/garden-campus-layout.js');
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceNames.map(async name=>[name,createHash('sha256').update(await readFile('preview/src/'+name)).digest('hex')])));
const sources=await sourceHashes();
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_OFFICE_LAYOUT: 'office-penthouse-1', VITE_SHARED_SOFTWARE_RENDERING: '0', RIVER_OAKS_DISTRICT_REVISION: revision === 'gardens' ? 'river-oaks-gardens-3' : 'river-oaks-garage-1' } });
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] });
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await context.addCookies([{ name: 'fixture_session', value: 'owner', url: fixture.origin }]);
  await context.addInitScript(() => localStorage.setItem('river-oaks-graphics','smooth'));
  const page = await context.newPage(); page.setDefaultTimeout(180000);
  let manifest = null;
  page.on('response', async response => {
    if (response.url().includes('/api/world-data?world=river-oaks')) manifest = await response.json().catch(() => null);
  });
  const network = [];
  page.on('websocket', socket => {
    for (const event of ['framesent','framereceived']) socket.on(event, frame => {
      try {
        const data = JSON.parse(String(frame.payload));
        if (!data.requestId) return;
        const item = { event, type:data.type, requestId:data.requestId, ok:data.ok, error:data.error };
        network.push(item); if(network.length>30)network.shift();
      } catch { /* Binary/media frames are outside this diagnostic. */ }
    });
  });
  // Reuse the existing setup and pointer/keyboard walking contract verbatim.
  const source = await readFile('preview/e2e/office-penthouse.js', 'utf8');
  const readySource = source.replace('?motion-debug=1', '?motion-debug=1&render-audit=1').replace("  await page.locator('#office-lobby').waitFor", "  console.log('Waiting for rendered frames before actions');\n  await page.waitForFunction(() => { const h=document.querySelector('#canvas-host'); return h?.dataset.renderStats && JSON.parse(h.dataset.quality??'{}').fps>0; }, null, {timeout:180000});\n  await page.evaluate(async () => { for(let i=0;i<8;i++)await new Promise(requestAnimationFrame); });\n  await page.locator('#office-lobby').waitFor");
  const prefix = readySource.slice(0, readySource.indexOf('  // #363: sit at creative desk'))
    .replaceAll('http://127.0.0.1:5173', fixture.origin)
    .replace("await page.locator('#office-lobby').evaluate", "await page.waitForFunction(() => window.__riverMultiplayer?.().connected && window.__riverMultiplayer().snapshot?.players.some(p => p.id === window.__riverMultiplayer().selfId), null, { timeout: 180000 });\n  await page.locator('#office-lobby').evaluate")
    .replaceAll('output/playwright/office-penthouse-arrival.png', `${output}/arrival.png`)
    .replace("await page.locator('#office-lobby').evaluate", "console.log('District and multiplayer ready; requesting lobby travel'); await page.locator('#office-lobby').evaluate")
    .replace("const visit = () =>", "console.log('Office admitted'); const visit = () =>");
  assert.ok(prefix.includes('const walkTo'));
  const journey = prefix + `
    const measure = () => page.evaluate(async () => {
      const audit=window.__riverRenderAudit; audit.start();const submissions=[];
      for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);submissions.push(audit.graphics().render);}
      return {frames:audit.stop(),graphics:audit.graphics(),submissions};
    });
    const captures = [];
    for (let cycle = 0; cycle < 2; cycle++) {
      if (cycle) {
        await page.locator('#office-lobby').evaluate(button => button.click());
        await page.waitForFunction(() => document.querySelector('#office-enter')?.disabled === false);
        await page.locator('#canvas-host').focus(); await page.keyboard.press('KeyF');
        await page.waitForFunction(() => document.querySelector('#office-visit')?.dataset.phase === 'office' && document.querySelector('#office-visit')?.open);
        heading = 0; at = await position();
      }
      await page.locator('#sun-hour').evaluate(input => {input.value='15';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(() => window.__riverOffice()?.skyline?.state === 'live', null, { timeout: 300000 });
      const captured = await page.evaluate(() => window.__riverOffice().skyline);
      check(captured.bytes === 0 && captured.peakBytes === 0, 'live exterior allocates no cubemap targets');
      await walkTo([0,2.4], 'arrival aisle');
      await walkTo([-12,2.4], 'west aisle');
      await walkTo([-12,5], 'terrace portal approach');
      await walkTo([-18,5], 'through the terrace portal');
      await walkTo([-18,8], 'terrace outlook');
      await page.screenshot({ path: '${output}/terrace-' + cycle + '.png' });
      const terracePosition = await position();
      await page.locator('#office-view').selectOption('roof-gardens');
      await page.evaluate(async () => { for(let i=0;i<8;i++)await new Promise(requestAnimationFrame); });
      check(JSON.stringify(await position()) === JSON.stringify(terracePosition), 'roof outlook leaves the visitor on the terrace');
      await page.screenshot({ path: '${output}/roof-gardens-' + cycle + '.png' });
      const daylightCost = await measure();
      const outlook = await page.evaluate(() => window.__riverOffice().camera);
      await page.locator('#sun-hour').evaluate(input => {input.value='18.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.evaluate(async () => {for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);});
      await page.screenshot({ path: '${output}/roof-gardens-dusk-' + cycle + '.png' });
      const duskCost = await measure();
      await dialog.focus(); await page.keyboard.press('Escape');
      check(await page.locator('#office-view').inputValue() === '', 'Escape restores walking without leaving office');
      await page.locator('#sun-hour').evaluate(input => {input.value='15';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.evaluate(async () => {for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);});
      const beforeAim = await page.evaluate(() => window.__riverOffice().camera);
      const [qx,qy,qz,qw] = beforeAim.quaternion;
      const currentYaw = Math.atan2(2*(qw*qy+qx*qz),1-2*(qy*qy+qx*qx));
      const desiredYaw = Math.atan2(-(-2704.9663550867344-beforeAim.position[0]),-(1267.8129431163761-beforeAim.position[2]));
      const difference = Math.atan2(Math.sin(desiredYaw-currentYaw),Math.cos(desiredYaw-currentYaw));
      await drag(-difference/.004);
      await page.evaluate(async () => {for(let i=0;i<8;i++)await new Promise(requestAnimationFrame);});
      const aimedCamera = await page.evaluate(() => window.__riverOffice().camera);
      check(JSON.stringify(await position()) === JSON.stringify(terracePosition), 'aiming preserves actual terrace position');
      await page.screenshot({path:'${output}/campus-aimed-'+cycle+'.png'});
      await page.screenshot({path:'${output}/campus-aimed-clean-'+cycle+'.png',style:'#office-visit {visibility:hidden !important;}'});
      captures.push({phase:'campus-aimed',beforeAim,aimedCamera,terracePosition});
      const later = await page.evaluate(() => window.__riverOffice().skyline);
      check(later.state === 'live' && later.frames > captured.frames && later.bytes === 0, 'normal live draws advance without cubemap capture');
      const diagnostics = await page.evaluate(async () => {
        const camera = window.__riverOffice().camera;
        const stats = document.querySelector('#canvas-host').dataset;
        const samples=[];let prior=performance.now();for(let i=0;i<16;i++){await new Promise(requestAnimationFrame);const now=performance.now();samples.push({intervalMs:now-prior,cpuMs:window.__riverOffice().skyline.lastRenderMs,render:JSON.parse(stats.renderStats),quality:JSON.parse(stats.quality)});prior=now;}
        return {camera,samples};
      });
      captures.push({ cycle, daylightHour:15, duskHour:18.5, captured, later, outlook, daylightCost, duskCost, diagnostics, position: await position() });
      await page.locator('#sun-hour').evaluate(input => {input.value='15';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.locator('#office-exit').click();
      await page.waitForFunction(() => !document.querySelector('#office-visit').open);
      check(await page.evaluate(() => window.__riverOffice() === null), 'leaving disposes the office view');
    }
    check(!errors.length, errors.join('; '));
    return { checks, errors, captures, reloads, limits: 'Local identity and browser rendering. Live district, ordinary single-view pipeline; CPU diagnostics are not GPU timings. Local fixture identity only.' };
  }`;
  try {
    console.log('Office fixture ready; starting authenticated arrival');
    const result = await eval(`(${journey})`)(page);
    assert.ok(manifest, 'observed the served district manifest');
    assert.equal(manifest.districtRevision ?? null, revision === 'gardens' ? 'river-oaks-gardens-3' : null, 'actual office exterior uses the selected district revision');
    assert.deepEqual(await sourceHashes(), sources, 'scene sources stayed fixed during the run');
    await writeFile(`${output}/result.json`, JSON.stringify({ status: 'passed', revision, sources, network, settings: {viewport:[800,600],graphics:'smooth',skyline:'enabled'}, ...result }, null, 2));
    console.log(JSON.stringify(result));
  } catch (error) {
    const diagnostics = await page.evaluate(() => { const m = window.__riverMultiplayer?.(); return { connected: m?.connected, self: m?.snapshot?.players.find(p => p.id === m.selfId)?.office ?? null, status: document.querySelector('.office-panel [role=status]')?.textContent, enterDisabled: document.querySelector('#office-enter')?.disabled, quality: document.querySelector('#canvas-host')?.dataset.quality, selfPosition: m?.snapshot?.players.find(p => p.id === m.selfId)?.position }; }).catch(() => null);
    console.log(JSON.stringify({ diagnostics }));
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    await writeFile(`${output}/result.json`, JSON.stringify({ status: 'failed', diagnostics, network, error: error.stack }, null, 2)); throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
