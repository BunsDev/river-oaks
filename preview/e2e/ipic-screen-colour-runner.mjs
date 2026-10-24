// Full-world color evidence for #498. Uses existing fixture identity and allowlisted media.
// Test-only instrumentation exposes the existing screen/camera to read pixels; no material,
// lighting, tone-mapping, media, or authoritative timeline policy is replaced.
import { chromium } from 'playwright';
import { assertCaptureHour } from './ipic-screen-colour-capture.js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startBrowserFixture } from './fixture-server.js';
import { openHudSpace } from './hud-navigation.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';
const out = 'output/playwright/ipic-screen-colour';
const release = await holdBrowserLock('IPIC full-world colour');
let fixture, browser;
await mkdir(out, { recursive: true });
const receipt = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), at: new Date().toISOString(), samples: [] };
receipt.dirty = execFileSync('git', ['status', '--porcelain']).toString().trim().split('\n').filter(Boolean);
receipt.sourceHashes = {};
for (const file of ['preview/e2e/ipic-screen-colour-runner.mjs', 'preview/e2e/ipic-screen-colour-capture.js', 'preview/src/ipic-screening.js', 'preview/src/ipic-screening-screen.js', 'preview/public/assets/ipic/screening/sources.json']) {
  receipt.sourceHashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
}
try {
  fixture = await startBrowserFixture({ env: { RIVER_OAKS_SCREENING_HOSTS: 'ipic:alice' } });
  browser = await chromium.launch({ headless: true, args: process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => localStorage.setItem('river-oaks-graphics', 'sharp'));
  await context.addCookies([{ name: 'fixture_session', value: 'alice', url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  await page.route('**/src/main.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
const { captureWorldFrame } = await import('/e2e/ipic-screen-colour-capture.js');
window.__screenColourReady = () => Boolean(environmentAssets && scene.environment);
window.__screenColourProbe = (sample = false) => {
  const screen = buildingMesh.userData.interiors.userData.screens[0];
  const frame = screen.frame, object = screen.object;
  object.updateWorldMatrix(true, false);
  const center = new THREE.Vector3(...frame.center).applyMatrix4(object.matrixWorld);
  const right = new THREE.Vector3(...frame.right).transformDirection(object.matrixWorld);
  const up = new THREE.Vector3(...frame.up).transformDirection(object.matrixWorld);
  const normal = right.clone().cross(up);
  if (!sample) return { position: center.clone().addScaledVector(normal, 5.5).toArray(), target: center.toArray(), fov: 60 };
  const video = document.querySelector('#ipic-screening video');
  return captureWorldFrame({ schedule: capture => { if (pendingCapture) throw new Error('Capture already pending'); pendingCapture = capture; },
    readiness: () => ({ environment: Boolean(environmentAssets && scene.environment), software: softwareAcceptance, seeking: video.seeking, paused: video.paused, ao: pipeline.stats.ao, bloom: pipeline.stats.bloom }),
    read: () => {
  const direct = document.createElement('canvas'); direct.width = video.videoWidth; direct.height = video.videoHeight;
  const ctx = direct.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0);
  // Same paused decoded frame, existing full-world scene and composer, then synchronous readback.
  // Called synchronously after the normal production render dispatch.
  const gl = renderer.getContext(), canvas = renderer.domElement;
  const fit = ipicScreening.inspect().screen.fit.repeat, pixels = [];
  for (const v of [0.15, 0.35, 0.5, 0.65, 0.85]) for (const u of [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
    const point = center.clone().addScaledVector(right, (u-.5)*frame.width/fit[0]).addScaledVector(up, (.5-v)*frame.height/fit[1]).addScaledVector(normal, .005).project(camera);
    const x = Math.round((point.x+1)/2*canvas.width), y = Math.round((1-point.y)/2*canvas.height);
    if (x<0 || y<0 || x>=canvas.width || y>=canvas.height) throw new Error('Sample outside screen viewport');
    const rgb = new Uint8Array(4); gl.readPixels(x, canvas.height-1-y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgb);
    pixels.push({ uv:[u,v], at:[x,y], direct:[...ctx.getImageData(Math.floor(u*direct.width),Math.floor(v*direct.height),1,1).data], rendered:[...rgb] });
  }
  return { pixels, directPng: direct.toDataURL('image/png'), worldPng: canvas.toDataURL('image/png'), currentTime: video.currentTime, paused: video.paused, readyState: video.readyState,
    screening: ipicScreening.inspect(), graphics: window.__riverRenderAudit.graphics(), hour: document.querySelector('#sun-hour').value,
    toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure, environmentIntensity: scene.environmentIntensity, weather: document.querySelector('#weather').value };
  } });
};` });
  });
  await page.goto(fixture.origin + '/?motion-debug=1&render-audit=1&screening-fixtures=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__riverMultiplayer?.().connected && document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await openHudSpace(page, 'explore-section');
  await page.locator('#destination').selectOption({ label: 'IPIC Theaters' });
  await page.locator('#enter-destination').click();
  await page.waitForFunction(() => window.__riverScreening?.()?.active);
  await page.locator('#panel-toggle').click();
  await page.locator('#ipic-screening select[data-control="film"]').selectOption('ipic-fixture-v1');
  await page.locator('#ipic-screening [data-control="host-start"]').click();
  await page.waitForFunction(() => window.__riverScreening().state === 'playing' && window.__riverScreening().currentTime > 2);
  await page.locator('#ipic-screening [data-control="host-pause"]').click();
  await page.waitForFunction(() => window.__riverScreening().paused && window.__riverScreening().houseLights > .99);
  await page.waitForFunction(() => window.__screenColourReady() && !document.querySelector('#ipic-screening video').seeking);
  await page.evaluate(() => window.__riverRenderAudit.view(window.__screenColourProbe()));
  for (const hour of [12, 19, 7]) {
    await page.locator('#sun-hour').evaluate((el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, String(hour));
    await page.waitForTimeout(1500);
    const sample = await page.evaluate(() => window.__screenColourProbe(true));
    assertCaptureHour(hour, sample.hour);
    if (!sample.paused || sample.readyState < 2 || !sample.screening.screen.key) throw new Error('No stable decoded film');
    for (const [key, name] of [['directPng', 'direct'], ['worldPng', 'world']]) {
      await writeFile(out + '/' + hour + '-' + name + '.png', Buffer.from(sample[key].split(',')[1], 'base64')); delete sample[key];
    }
    await page.screenshot({ path: out + '/' + hour + '-page.png' });
    receipt.samples.push(sample);
  }
  receipt.browser = await browser.version(); receipt.status = 'passed';
  receipt.scope = 'Full world and production postprocessing at Sharpest quality, paused allowlisted fixture, house lights up, noon/dusk/dawn. Raw comparison only; no human color approval or device acceptance.';
} catch (error) { receipt.status = 'failed'; receipt.error = error.stack; throw error; }
finally { await writeFile(out + '/receipt.json', JSON.stringify(receipt, null, 2)); await browser?.close(); await fixture?.close(); release(); }
