async page => {
  // Controlled lighting inspection, not a shipped lighting preset. Keep actual
  // materials, geometry, intensity, reflection map and camera; remove light tints.
  // The response-only override is removed and the original renderer reloaded below.
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { pathToFileURL } = await import('node:url');
  const { createSpace } = await import(pathToFileURL(`${process.cwd()}/preview/src/studio/space-templates.js`).href);
  const origin = 'http://127.0.0.1:5173', pattern = '**/src/studio/viewport.js*';
  const anchor = 'sky.intensity=light?light.sky:2.5;';
  let sourceSha256;
  const override = `
      if (space) {
        sun.color.set('#ffffff'); sky.color.set('#ffffff'); sky.groundColor.set('#888888');
        content.group.traverse(node => {
          if (node.isLight) node.color.set('#ffffff');
          if (node.isHemisphereLight) node.groundColor.set('#888888');
        });
        const lights = [];
        scene.traverse(node => { if (node.isLight) lights.push({ type: node.type, color: node.color.getHexString(), intensity: node.intensity, ...(node.isHemisphereLight ? { ground: node.groundColor.getHexString() } : {}) }); });
        host.dataset.neutralDiagnostic = JSON.stringify({ lights, exposure: renderer.toneMappingExposure, reflections: scene.environmentIntensity });
      }`;
  await page.route(pattern, async route => {
    const response = await route.fetch(), source = await response.text();
    if (source.split(anchor).length !== 2) throw Error('Viewport light setup changed; review the neutral diagnostic');
    sourceSha256 = createHash('sha256').update(source).digest('hex');
    await route.fulfill({ response, body: source.replace(anchor, anchor + override) });
  });
  let result;
  try {
    const source = (await readFile('preview/e2e/studio-office-stations.js', 'utf8')).replace(/http:\/\/127\.0\.0\.1:5173/g, origin);
    const captureStations = eval(`(${source})`);
    result = await captureStations(page, { neutralDiagnostic: true });
    // Same conservative chair-use fixture as the movement regression: every chair
    // pulled back 0.4 m and at least 0.75 m deep. No people or seating system implied.
    const occupiedChairs = createSpace('office').objects.filter(item => item.kind === 'chair').map(chair => {
      const yaw = chair.yaw * Math.PI / 180;
      return { id: chair.id, east: chair.east - Math.sin(yaw) * .4, north: chair.north + Math.cos(yaw) * .4, depth: Math.max(chair.depth, .75) };
    });
    const occupied = await captureStations(page, { neutralDiagnostic: true, occupiedChairs });
    result.captures.push(...occupied.captures);
    for (const capture of result.captures) {
      const { lights } = capture.neutralDiagnostic;
      if (!lights.length || lights.some(light => light.color !== 'ffffff' || light.ground && light.ground !== '888888')) throw Error('Runtime light tints were not neutralized');
    }
  } finally {
    await page.unroute(pattern);
    const restoredResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/src/studio/viewport.js');
    await page.goto(`${origin}/studio.html`);
    await page.waitForSelector('body[data-studio-ready="true"]');
    const restoredSource = await (await restoredResponse).text();
    if (createHash('sha256').update(restoredSource).digest('hex') !== sourceSha256) throw Error('Restored viewport response does not match the original module');
    if (await page.locator('#studio-viewport').getAttribute('data-neutral-diagnostic')) throw Error('Neutral diagnostic remained after restoring the renderer');
  }
  return { ...result, sourceSha256, restored: true, scope: 'Response-only neutral lighting diagnostic over the daylight preset; materials and emissive colors unchanged. Not a saved v1 lighting option or human design approval.' };
}
