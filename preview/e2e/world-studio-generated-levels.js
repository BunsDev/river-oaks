async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/studio.html');
  await page.waitForSelector('body[data-studio-ready="true"]');
  await page.getByRole('button', { name: 'Add building', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Generated interior' });
  await panel.getByRole('button', { name: 'Preview level 0' }).click();
  await panel.getByText('Add generated ground floor').waitFor();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  await panel.getByText('Level 0', { exact: false }).waitFor();
  await page.getByLabel('Height (m)', { exact: true }).fill('9');
  await page.getByLabel('Height (m)', { exact: true }).press('Tab');
  await panel.getByRole('button', { name: 'Preview add level' }).click();
  const proposed = await panel.getByText('Add level 1').textContent();
  if (!proposed || await panel.locator('li').count() !== 1) throw Error('Preview changed the saved level list');
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  if (await panel.locator('li').count() !== 2) throw Error('The second level was not added');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  if (await panel.locator('li').count() !== 1) throw Error('Undo did not remove the new level');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  if (await panel.locator('li').count() !== 2) throw Error('Redo did not restore the new level');
  await page.getByRole('button', { name: 'Save on device', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('river-oaks-world-studio-v1')).region);
  if (saved.buildings[0].interior.generation.levels !== 2) throw Error('Saved draft omitted the second level');
  await page.reload();
  await page.waitForSelector('body[data-studio-ready="true"]');
  await page.locator('[data-item="building-1"]').click();
  if (await panel.locator('li').count() !== 2) throw Error('Reopened draft lost the second level');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  if ((await download).suggestedFilename() !== 'world-studio-region.json') throw Error('Wrong export format');
  await page.screenshot({ path: 'output/playwright/world-studio-generated-levels.png' });
  if (errors.length) throw Error(errors.join('; '));
  return { passed: true, buildingId: saved.buildings[0].id,
    levels: saved.buildings[0].interior.generation.levels,
    scope: 'Local region authoring, preview, undo, save, reopen and export; published plan and override editing require separate acceptance.' };
}
