import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const suite = ['sable', 'experience', 'sidebar', 'ui-polish', 'hud-and-quality', 'auto-mode', 'player-forms', 'beast-movement', 'carriage', 'unicorn-carriage', 'carriage-driver', 'carriage-companion', 'carriage-conversation', 'carriage-mobile', 'force-mobile', 'invasion'];
const names = process.argv.slice(2);
if (names.some(name => !suite.includes(name))) throw new Error(`Choose harnesses from: ${suite.join(', ')}`);
process.env.VITE_SINGLE_PLAYER = 'true';
process.env.VITE_MULTIPLAYER = 'off';
const vite = await createServer({ configFile: join(root, 'preview/vite.config.js'), server: { port: 0 } });
const results = [];
let browser;
try {
  await mkdir(join(root, 'output/playwright'), { recursive: true });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {}) });
  for (const name of names.length ? names : suite) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(60000);
    const started = Date.now();
    try {
      console.log(`Running ${name}`);
      // These repository harnesses are page functions, also used by the browser CLI.
      const source = (await readFile(join(root, `preview/e2e/${name}.js`), 'utf8')).replace(/http:\/\/127\.0\.0\.1:\d+/g, origin);
      const result = await eval(`(${source})`)(page);
      results.push({ name, status: 'passed', seconds: (Date.now() - started) / 1000, result });
      console.log(`Passed ${name}`);
    } catch (error) {
      results.push({ name, status: 'failed', seconds: (Date.now() - started) / 1000, error: error.stack });
      console.error(`Failed ${name}: ${error.message}`);
      await page.screenshot({ path: join(root, `output/playwright/experience-${name}-failure.png`) }).catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await writeFile(join(root, 'data/reports/experience.json'), JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2) + '\n');
    }
  }
} finally {
  await browser?.close();
  await vite.close();
}
