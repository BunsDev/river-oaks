// Temporary Mesa diagnostic for fix/mesa-experience-journeys; removed before merge.
// The owner's (Jevica's) view renders as one flat colour under CPU rendering while
// alice's renders normally. Each variant patches one suspect module in flight and
// counts the distinct colours in a HUD-free screenshot.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';

process.env.VITE_SHARED_SOFTWARE_RENDERING = '1';
const variants = [
  { name: 'owner-baseline', patches: [] },
  { name: 'owner-no-bloom', patches: [['/src/render-pipeline.js', 'composer.addPass(bloom);', '']] },
  { name: 'owner-no-glow', patches: [['/src/jevica-costume.js', 'hand.add(glow);', '']] },
  { name: 'owner-flat-normals', patches: [['/src/main.js', 'new THREE.MeshNormalMaterial()', 'new THREE.MeshNormalMaterial({ flatShading: true })']] },
  { name: 'alice-baseline', identity: 'alice', patches: [] },
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
  await context.addCookies([{ name: 'fixture_session', value: variant.identity ?? 'owner', url: fixture.origin }]);
  const applied = [];
  for (const [path, from, to] of variant.patches) {
    await context.route(url => new URL(url).pathname === path, async route => {
      const response = await route.fetch(), body = await response.text();
      applied.push({ path, found: body.includes(from) });
      await route.fulfill({ response, body: body.replace(from, to) });
    });
  }
  const page = await context.newPage(); page.setDefaultTimeout(90000);
  try {
    await page.goto(`${fixture.origin}/?motion-debug=1`);
    await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
    await page.waitForTimeout(6000);
    await page.evaluate(() => { for (const node of document.querySelectorAll('#walking-hud,.visit-tools,.commands-toggle,#control-panel')) node.style.visibility = 'hidden'; });
    await page.waitForTimeout(2500);
    const shot = await page.screenshot({ path: `output/mesa-probe/${variant.name}.png` });
    const renderStats = await page.evaluate(() => document.querySelector('#canvas-host').dataset.renderStats);
    report.push({ name: variant.name, applied, colours: await colours(page, shot), renderStats });
  } catch (error) { report.push({ name: variant.name, applied, error: error.message }); }
  finally { await context.close(); await fixture.close(); }
}
await browser.close();
await writeFile('output/mesa-probe/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
