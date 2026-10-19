// IPIC screen checks (#498): node preview/e2e/ipic-screen-runner.mjs
// Runs preview/e2e/ipic-screen.js on preview/e2e/fixtures/ipic-screen.html: real decoding of test-only
// films on the real auditorium screen material. GPU (Metal ANGLE) on macOS, SwiftShader elsewhere.
// Sound autoplay needs a gesture here, as on a fresh visit. Takes the shared browser lock.
// Writes output/playwright/ipic-screen/ (captures and receipt.json).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { startBrowserFixture } from './fixture-server.js';
import { holdBrowserLock } from '../../scripts/browser-lock.mjs';

const OUT = 'output/playwright/ipic-screen';
const release = await holdBrowserLock('IPIC screen checks');
let fixture, browser;
await mkdir(OUT, { recursive: true });
try {
  fixture = await startBrowserFixture();
  const gpu = process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  browser = await chromium.launch({ headless: true, args: [...gpu, '--autoplay-policy=document-user-activation-required'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
  page.setDefaultTimeout(60000);
  const source = (await readFile('preview/e2e/ipic-screen.js', 'utf8')).replaceAll('http://127.0.0.1:5173', fixture.origin);
  const receipt = { runner: 'node preview/e2e/ipic-screen-runner.mjs', at: new Date().toISOString(), sourceRevision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    dirty: execFileSync('git', ['status', '--porcelain']).toString().trim().split('\n').filter(Boolean), browser: await browser.version(), args: gpu };
  try {
    const result = await eval(`(${source})`)(page);
    receipt.renderer = await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'); const info = gl.getExtension('WEBGL_debug_renderer_info'); return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
    await writeFile(`${OUT}/receipt.json`, JSON.stringify({ status: 'passed', ...receipt, ...result }, null, 2));
    console.log(JSON.stringify({ checks: result.checks, renderer: receipt.renderer }, null, 2));
  } catch (error) {
    await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
    await writeFile(`${OUT}/receipt.json`, JSON.stringify({ status: 'failed', ...receipt, error: error.stack }, null, 2));
    throw error;
  }
} finally { await browser?.close(); await fixture?.close(); release(); }
