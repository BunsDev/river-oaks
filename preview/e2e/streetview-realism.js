async page => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/facades.html');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(async () => {
    const { createReferenceFacades, BELLA_BLOCK } = await import('/src/reference-facades.js');
    const { THREE } = window.facadeFixture;
    const world = window.facadeFixture.world, index = world.buildings.findIndex(b => b.id === BELLA_BLOCK), parts = [];
    const facade = createReferenceFacades(world, { part: (material, position, size, yaw, buildingIndex) => {
      if (buildingIndex === index) parts.push({ name: material.name, position, size });
    }, pane: () => {}, plane: new THREE.PlaneGeometry(1, 1), glass: new THREE.MeshStandardMaterial() });
    facade.build();
    const slats = parts.filter(p => p.name === 'reference-wood-slat');
    const base = world.buildings[index].center[2];
    const top = Math.max(...slats.map(p => p.position[1] + p.size[1] / 2 - base));
    if (!Number.isFinite(top) || top > 6.33) throw new Error(`Bella stair screen hides the salon ribbon: ${top}`);
    facade.materials.forEach(m => m.dispose()); facade.textures.forEach(t => t.dispose());
    return { bellaScreenHeight: top };
  });
  const captures = [];
  for (const station of ['bella', 'bari', 'dolce', 'toulouse', 'cartier', 'cartier-entry', 'hopdoddy']) {
    if (station === 'hopdoddy') await page.evaluate(async () => {
      const { buildMatureTrees } = await import('/src/landscape-models.js');
      const fixture = window.facadeFixture;
      fixture.world.vegetation = await (await fetch('/data/district-vegetation.json')).json();
      const trees = buildMatureTrees(fixture.world); await trees.userData.ready;
      fixture.scene.add(trees); fixture.view('hopdoddy'); trees.userData.update(fixture.camera.position);
    });
    const metadata = await page.evaluate(station => {
      const fixture = window.facadeFixture;
      const stats = fixture.view(station);
      return { station, ...stats, position: fixture.camera.position.toArray(), quaternion: fixture.camera.quaternion.toArray(),
        fov: fixture.camera.fov, aspect: fixture.camera.aspect, exposure: fixture.renderer.toneMappingExposure,
        hour: 15, weather: 'clear', size: [1600, 1000], axes: 'east/up/south metres', scope: 'isolated facade fixture, no crowd or full landscape' };
    }, station);
    if (!metadata.draws || !metadata.triangles) throw new Error('Fixture rendered no geometry');
    await page.screenshot({ path: `output/playwright/streetview-${station}.png` });
    captures.push(metadata);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { captures, geometry, errors };
}
