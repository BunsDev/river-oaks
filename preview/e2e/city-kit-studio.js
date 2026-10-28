async page => {
  // The city kit in World Studio (#585): the studio-region.json that `destination build`
  // writes for a plan opens in a running Studio with Open JSON, lists the plan's
  // buildings, trees and places, selects a shell by its stable piece id, and walks.
  const { readFileSync } = await import('node:fs');
  const { assembleNeighborhood } = await import('../../shared/city-kit/assemble.js');
  const { studioRegion } = await import('../../shared/city-kit/studio.js');
  const { openHudSpace } = await import('./hud-navigation.js');
  const recipe = JSON.parse(readFileSync('config/destinations/nineteenth-and-yale.json', 'utf8')); // the runner works from the repo root
  const plan = assembleNeighborhood(structuredClone(recipe)), { region, summary } = studioRegion(recipe, plan);
  const checks = [], check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); console.log(label); };
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await openHudSpace(page, 'settings-section', 'World');
  await page.getByRole('link', { name: 'Open World Studio' }).click({ timeout: 10000 });
  await page.waitForSelector('body[data-studio-ready="true"]', { timeout: 20000 });
  await page.locator('#studio-import').setInputFiles({ name: 'studio-region.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(region)) });
  await page.locator('[data-item="northwest-row-parcel-0"]').waitFor({ timeout: 10000 });
  const items = await page.locator('[data-item]').count(), expected = 1 + summary.buildings + summary.trees + summary.places;
  check(items === expected, `Studio lists the arrival, ${summary.buildings} buildings, ${summary.trees} trees and ${summary.places} places of Nineteenth & Yale (${items} items)`);
  await page.locator('[data-item="northwest-row-parcel-0"]').click();
  const shell = plan.pieces.find(piece => piece.id === 'nineteenth-and-yale/northwest-row/parcel-0');
  const east = Number(await page.getByLabel('East (m)', { exact: true }).inputValue()), width = Number(await page.getByLabel('Width (m)', { exact: true }).inputValue());
  check(Math.abs(east - (shell.rect[0] + shell.rect[2]) / 2) < 0.01 && Math.abs(width - (shell.rect[2] - shell.rect[0])) < 0.01, `Selecting the corner shell by its piece id shows its footprint in the inspector (east ${east}, width ${width})`);
  await page.getByRole('button', { name: 'Walk through', exact: true }).click();
  await page.waitForSelector('body[data-mode="walk"]');
  // The readout is a placeholder until the walker moves, so the proof is where a short walk ends: a metre or so from the exported arrival.
  await page.locator('#studio-viewport').focus(); await page.keyboard.down('w'); await page.waitForTimeout(750); await page.keyboard.up('w');
  const moved = await page.locator('#studio-position').textContent(), [east2, north2] = (moved.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number), [sx, sy] = region.spawn;
  check(Number.isFinite(east2) && Number.isFinite(north2) && Math.hypot(east2 - sx, north2 - sy) > 0.2 && Math.hypot(east2 - sx, north2 - sy) < 4, `A short walk starts at the exported arrival ${sx} E / ${sy} N on Nineteenth's sidewalk and moves (${moved.trim()})`);
  await page.keyboard.press('Escape'); await page.waitForSelector('body[data-mode="edit"]');
  await page.getByRole('button', { name: 'Frame region', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/city-kit-studio.png' });
  // A neighborhood nobody drew by hand: the compiler drawing's block as kit blocks (config/destinations/garden-blocks-kit.json) opens the same way.
  const garden = JSON.parse(readFileSync('config/destinations/garden-blocks-kit.json', 'utf8')), gardenPlan = assembleNeighborhood(structuredClone(garden)), gardenRegion = studioRegion(garden, gardenPlan);
  page.once('dialog', dialog => dialog.accept()); // the Studio asks before discarding the walked draft
  await page.locator('#studio-import').setInputFiles({ name: 'garden-blocks-kit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(gardenRegion.region)) });
  await page.locator('[data-item="p-middle-cross-0-0-parcel-0"]').waitFor({ timeout: 10000 });
  const gardenItems = await page.locator('[data-item]').count();
  check(gardenItems === 1 + gardenRegion.summary.buildings + gardenRegion.summary.trees + gardenRegion.summary.places, `The Garden Blocks (kit) example, derived from the compiler drawing, opens with ${gardenRegion.summary.buildings} buildings on its four parcels (${gardenItems} items)`);
  await page.getByRole('button', { name: 'Frame region', exact: true }).click();
  await page.screenshot({ path: 'output/playwright/city-kit-studio-garden-blocks.png' });
  if (errors.length) throw new Error(errors.join('\n'));
  return { passed: true, checks, scope: 'Built city-kit plans opened in a running World Studio by Open JSON: item list, inspector by stable piece id, walkthrough from the exported arrival; the compiler-derived Garden Blocks (kit) example too.' };
}
