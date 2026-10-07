async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/facades.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const result = await page.evaluate(() => {
    const buildings = window.facadeFixture.scene.children.find(item => item.userData.rooms);
    const textures = new Map();
    buildings.traverse(item => {
      const material = item.material;
      if (!material?.name.startsWith('reference-') || !material.map?.isCanvasTexture) return;
      if (textures.has(material.map)) return;
      const record = { name: material.name, disposed: 0 };
      textures.set(material.map, record);
      material.map.addEventListener('dispose', () => record.disposed++);
    });
    buildings.userData.dispose();
    return [...textures.values()];
  });
  if (!result.some(item => item.name === 'reference-lettering')) throw new Error('The fixture did not exercise facade lettering');
  const leaked = result.filter(item => item.disposed !== 1);
  if (leaked.length) throw new Error(`Facade textures must be disposed exactly once: ${JSON.stringify(leaked)}`);
  if (errors.length) throw new Error(errors.join('\n'));
  return { textures: result.length, errors };
}
