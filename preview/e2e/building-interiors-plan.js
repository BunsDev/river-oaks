// Run through scripts/browser-lock.mjs. This compares the exact pure module in
// Node and Chromium, independent of the game's sign-in and rendering paths.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { generateBuildingInteriorPlan } from '../src/building-interiors-plan.js';

const request = {
  worldId: 'browser-plan-check', seed: 'rotated-gallery-01', levels: 2, baseElevation: 7,
  building: { id: 'gallery', center: [20, 10, 7], size: [16, 12, 10], yaw_deg: 0,
    ring: [[12, 4], [28, 4], [28, 16], [12, 16], [12, 4]], kind: 'retail' },
  entrance: { id: 'south-door', position: [20, 4], outward: [0, -1] },
};
const moduleSource = await readFile(new URL('../src/building-interiors-plan.js', import.meta.url));
const server = createServer((req, res) => {
  if (req.url === '/building-interiors-plan.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(moduleSource);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Interior plan cross-runtime check</title>');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const browserPlan = await page.evaluate(async input => {
    const { generateBuildingInteriorPlan: generate } = await import('/building-interiors-plan.js');
    return generate(input);
  }, request);
  assert.deepEqual(browserPlan, generateBuildingInteriorPlan(request));
  console.log('Browser and Node generated identical two-level plans.');
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
