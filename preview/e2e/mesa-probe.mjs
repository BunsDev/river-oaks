// Temporary Mesa diagnostic for fix/mesa-experience-journeys; removed before merge.
// Loads the experience fixture under CPU rendering in several variants and counts
// the distinct colours in each screenshot, to find what makes the scene uniform.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';

process.env.VITE_SHARED_SOFTWARE_RENDERING = '1';
const variants = [
  { name: 'owner-plain', identity: 'owner', query: '' },
  { name: 'owner-motion-debug', identity: 'owner', query: '?motion-debug=1' },
  { name: 'alice-motion-debug', identity: 'alice', query: '?motion-debug=1' },
  { name: 'owner-walked', identity: 'owner', query: '?motion-debug=1', walk: true },
];
await mkdir('output/mesa-probe', { recursive: true });
const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
const report = [];
const colours = async (page, buffer) => page.evaluate(async data => {
  const image = new Image(); image.src = `data:image/png;base64,${data}`; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, seen = new Set();
  for (let y = 0; y < canvas.height; y += 13) for (let x = 0; x < canvas.width; x += 13) { const i = (y * canvas.width + x) * 4; seen.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); }
  return seen.size;
}, buffer.toString('base64'));
for (const variant of variants) {
  const fixture = await startBrowserFixture();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: 'fixture_session', value: variant.identity, url: fixture.origin }]);
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  try {
    await page.goto(`${fixture.origin}/${variant.query}`);
    await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    await page.waitForTimeout(6000);
    if (variant.walk) { await page.locator('#canvas-host').focus(); await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW'); await page.waitForTimeout(3000); }
    const shot = await page.screenshot({ path: `output/mesa-probe/${variant.name}.png` });
    // The canvas alone, without HUD panels, from a 2D copy taken right after a draw.
    const state = await page.evaluate(() => {
      const host = document.querySelector('#canvas-host'), hud = document.querySelector('#walking-hud');
      return { renderStats: host.dataset.renderStats, pipeline: host.dataset.pipeline, position: hud?.dataset.position, yaw: hud?.dataset.yaw,
        eyeHeight: hud?.dataset.eyeHeight, inside: hud?.dataset.inside, title: document.querySelector('.walking-title strong')?.textContent,
        clearColor: getComputedStyle(document.body).backgroundColor };
    });
    const hudless = await page.evaluate(() => { document.body.classList.add('clear-view'); for (const node of document.querySelectorAll('#walking-hud,.visit-tools,.commands-toggle,#control-panel,.rail-toggle')) node.style.visibility = 'hidden'; });
    await page.waitForTimeout(1500);
    const bare = await page.screenshot({ path: `output/mesa-probe/${variant.name}-bare.png` });
    report.push({ ...variant, colours: await colours(page, shot), bareColours: await colours(page, bare), state, hudless });
  } catch (error) { report.push({ ...variant, error: error.message }); }
  finally { await context.close(); await fixture.close(); }
}
await browser.close();
await writeFile('output/mesa-probe/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
