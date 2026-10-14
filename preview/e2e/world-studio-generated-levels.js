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
  const canvas = page.locator('#studio-viewport canvas');
  await page.getByRole('button', { name: 'Frame selection', exact: true }).click();
  const exterior = await canvas.screenshot();
  await panel.getByRole('button', { name: 'View level 1' }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (await panel.getByRole('button', { name: 'View level 1' }).getAttribute('aria-pressed') !== 'true')
    throw Error('Upper level view was not selected');
  if (!await panel.getByRole('button', { name: 'View level 1' }).evaluate(el => el === document.activeElement))
    throw Error('Selecting a level lost keyboard focus');
  const upper = await canvas.screenshot();
  if (Buffer.compare(exterior, upper) === 0) throw Error('The viewport did not render the selected level');
  await page.screenshot({ path: 'output/playwright/world-studio-generated-level-view.png' });
  const fixtures = panel.getByRole('checkbox', { name: 'fixtures' });
  await fixtures.uncheck();
  if (await fixtures.isChecked()) throw Error('Fixture layer was not hidden');
  if (!await fixtures.evaluate(el => el === document.activeElement)) throw Error('Changing a layer lost keyboard focus');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (Buffer.compare(upper, await canvas.screenshot()) === 0) throw Error('Hiding fixtures did not change the rendered level');
  await panel.getByRole('button', { name: 'Show exterior' }).click();
  if (await panel.getByRole('button', { name: 'View level 1' }).getAttribute('aria-pressed') !== 'false')
    throw Error('Exterior view was not restored');
  await panel.getByRole('button', { name: 'View level 0' }).click();
  const originalV = Number(await panel.getByLabel('Display local V (m)').inputValue());
  await panel.getByLabel('Display local V (m)').fill(String(originalV + 1.5));
  await panel.getByLabel('Display finish', { exact: true }).selectOption('oak');
  await panel.getByLabel('Floor finish', { exact: true }).selectOption('concrete');
  await panel.getByRole('button', { name: 'Preview furnishing and finishes' }).click();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  await panel.getByText('Authored level: regeneration is locked.', { exact: false }).waitFor();
  if (await panel.getByRole('button', { name: 'Preview regenerate untouched level' }).count())
    throw Error('An edited level can be regenerated');
  await page.getByRole('button', { name: 'Save on device', exact: true }).click();
  const authored = await page.evaluate(async () => {
    const region = JSON.parse(localStorage.getItem('river-oaks-world-studio-v1')).region;
    const { previewBuildingInteriorPlan } = await import('/src/studio/interior-plan.js');
    return { region, level: previewBuildingInteriorPlan(region, region.buildings[0].id).levels[0] };
  });
  if (!authored.level.layers.authoredOverrides.some(item => item.position && item.material === 'oak'))
    throw Error('Furnishing edit was not saved');
  await page.reload();
  await page.waitForSelector('body[data-studio-ready="true"]');
  await page.locator('[data-item="building-1"]').click();
  await panel.getByRole('button', { name: 'View level 0' }).click();
  const reopenedV = Number(await panel.getByLabel('Display local V (m)').inputValue());
  const reopenedFinish = await panel.getByLabel('Display finish', { exact: true }).inputValue();
  if (Math.abs(reopenedV - (originalV + 1.5)) > 0.0001 || reopenedFinish !== 'oak')
    throw Error(`Reopening lost the authored furnishing: ${JSON.stringify({ originalV, reopenedV, reopenedFinish, authored })}`);
  await page.screenshot({ path: 'output/playwright/world-studio-authored-level.png' });
  await panel.getByRole('button', { name: 'View level 1' }).click();
  const oldFinish = await panel.getByLabel('Floor finish', { exact: true }).inputValue();
  await panel.getByRole('button', { name: 'Preview regenerate untouched level' }).click();
  await panel.getByText(/Unchanged levels: building-1\/l0/).waitFor();
  await panel.getByRole('button', { name: 'Apply preview' }).click();
  if (await panel.getByLabel('Floor finish', { exact: true }).inputValue() === oldFinish)
    throw Error('Regeneration did not change the untouched floor finish');
  await page.getByRole('button', { name: 'Save on device', exact: true }).click();
  const regenerated = await page.evaluate(async () => {
    const region = JSON.parse(localStorage.getItem('river-oaks-world-studio-v1')).region;
    const { previewBuildingInteriorPlan } = await import('/src/studio/interior-plan.js');
    return { region, level: previewBuildingInteriorPlan(region, region.buildings[0].id).levels[0] };
  });
  if (JSON.stringify(regenerated.level) !== JSON.stringify(authored.level))
    throw Error('Regenerating the untouched floor changed the authored floor');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const exported = await download;
  if (exported.suggestedFilename() !== 'world-studio-region.json') throw Error('Wrong export format');
  const chunks = []; for await (const chunk of await exported.createReadStream()) chunks.push(chunk);
  if (JSON.stringify(JSON.parse(Buffer.concat(chunks).toString())) !== JSON.stringify(regenerated.region))
    throw Error('Export did not retain authored edits and the regenerated level');
  await page.screenshot({ path: 'output/playwright/world-studio-generated-levels.png' });
  await page.getByRole('button', { name: 'Space templates', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Use / }).first().click();
  await page.locator('.studio-templates').waitFor({ state: 'hidden' });
  if (!await page.getByRole('button', { name: 'Add furnishing', exact: true }).isVisible())
    throw Error('The furnished template did not replace the generated region view');
  await page.getByRole('heading', { name: 'Level 0 · objects', exact: true }).waitFor();
  await page.locator('#studio-items [data-item]').first().click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Reopen saved draft', exact: true }).click();
  await page.locator('[data-item="building-1"]').click();
  if (await panel.locator('li').count() !== 2) throw Error('Returning from a furnished template lost the saved levels');
  if (errors.length) throw Error(errors.join('; '));
  return { passed: true, buildingId: saved.buildings[0].id,
    levels: saved.buildings[0].interior.generation.levels,
    scope: 'Local region authoring, generated level viewport, layer visibility, undo, save, reopen and export; authored furnishing/finish edits and untouched-level regeneration preserve the edited floor.' };
}
