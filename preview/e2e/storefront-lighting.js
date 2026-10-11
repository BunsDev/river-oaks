async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => (document.querySelector('#canvas-host')?.dataset.multiplayer==='joined'));
  await page.waitForFunction(() => JSON.parse(document.querySelector('#canvas-host').dataset.reflections ?? 'null')?.captures >= 1);
  const toggle = page.locator('#panel-toggle');
  // The rail sidebar shows one section at a time; select the tab a control lives in first.
  const rail = section => openHudSpace(page, section);
  const voices = async () => { await rail('settings-section'); await page.locator('details.rail-disclosure', { hasText: 'Voices' }).evaluate(details => { details.open = true; }); };
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  await rail('explore-section');
  await page.locator('#destination').selectOption({ label: 'Cartier' });
  await page.locator('#visit-destination').click();
  await page.waitForTimeout(2800);
  const probe = () => page.locator('#canvas-host').evaluate(element => JSON.parse(element.dataset.reflections));
  const first = await probe();
  await page.waitForTimeout(2300);
  check((await probe()).captures === first.captures, 'Standing still must reuse the probe');
  await page.screenshot({ path: 'output/playwright/storefront-lighting-clear.png' });
  await rail('settings-section');
  await page.locator('#weather').selectOption('overcast');
  await page.waitForFunction(count => JSON.parse(document.querySelector('#canvas-host').dataset.reflections).captures > count, first.captures);
  const overcast = await probe();
  check(!overcast.failed, 'Weather must refresh the local reflection');
  await page.screenshot({ path: 'output/playwright/storefront-lighting-overcast.png' });
  await page.locator('#weather').selectOption('clear');

  // Exercise the actual GLSL and source-derived door openings, not shader strings.
  const optics = await page.evaluate(async () => {
    const moduleUrl = performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/three\.js\?/.test(url));
    if (!moduleUrl) throw new Error('The running Vite Three.js module was not observed');
    const THREE = await import(moduleUrl);
    const { thinStorefrontGlass } = await import('/src/storefront-materials.js');
    const { buildDistrictBuildings } = await import('/src/district.js');
    const world = await fetch('/data/district.json').then(response => response.json());
    const buildings = buildDistrictBuildings(world); buildings.updateMatrixWorld(true);
    const glass = buildings.userData.reflectionExclusions.filter(mesh => mesh.material === buildings.userData.reflectionMaterials[0]);
    const entrances = world.stores.map(store => {
      const [x, north, base] = store.facade, [nx, ny] = store.outward;
      const ray = new THREE.Raycaster(new THREE.Vector3(x + nx * 2, base + 1.5, -north - ny * 2), new THREE.Vector3(-nx, 0, ny), 0, 3);
      return { name: store.name, panes: ray.intersectObjects(glass).length };
    });
    buildings.userData.dispose();
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(128, 128);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#0000ff');
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 20); camera.position.z = 5;
    const faces = Array.from({ length: 6 }, () => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
      const context = canvas.getContext('2d'); context.fillStyle = '#00ff00'; context.fillRect(0, 0, 16, 16); return canvas;
    });
    const environment = new THREE.CubeTexture(faces); environment.needsUpdate = true;
    const material = thinStorefrontGlass(); material.envMap = environment;
    const geometry = new THREE.PlaneGeometry(10, 10); const pane = new THREE.Mesh(geometry, material); scene.add(pane);
    const pixel = angle => {
      pane.rotation.y = angle; renderer.render(scene, camera);
      const bytes = new Uint8Array(4), gl = renderer.getContext(); gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return [...bytes];
    };
    const facing = pixel(0), grazing = pixel(80 * Math.PI / 180), glError = renderer.getContext().getError();
    geometry.dispose(); material.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss();
    return { facing, grazing, glError, entrances };
  });
  check(optics.glError === 0, 'Optics must compile and render without a WebGL error');
  check(optics.facing[2] > 220 && optics.facing[1] < 30, 'Head-on glass must reveal the blue room behind it');
  check(optics.grazing[1] > optics.facing[1] + 50 && optics.grazing[2] < optics.facing[2] - 50, 'Grazing glass must reflect more of the green environment');
  check(optics.entrances.every(entry => entry.panes === 1), `Each doorway needs exactly one glass sheet: ${JSON.stringify(optics.entrances.filter(entry => entry.panes !== 1))}`);

  await page.locator('#canvas-host').focus();
  await page.keyboard.down('KeyS'); await page.waitForTimeout(900); await page.keyboard.up('KeyS');
  await page.mouse.move(1200, 450); await page.mouse.down(); await page.mouse.move(1420, 450, { steps: 12 }); await page.mouse.up();
  await page.setViewportSize({ width: 3840, height: 2160 });
  await toggle.click(); await page.waitForTimeout(1300);
  const buffer = await page.locator('#canvas-host canvas').evaluate(canvas => [canvas.width, canvas.height]);
  check(buffer[0] === 3840 && buffer[1] === 2160, 'The screenshot must use native UHD');
  await page.screenshot({ path: 'output/playwright/storefront-lighting-4k.png' });
  const frames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const sample = now => {
      if (previous !== undefined) samples.push(now - previous); previous = now;
      if (samples.length < 180) requestAnimationFrame(sample);
      else { samples.sort((a, b) => a - b); resolve({ samples: samples.length, median_ms: samples[90], p95_ms: samples[171], max_ms: samples.at(-1) }); }
    }; requestAnimationFrame(sample);
  }));
  const stats = await page.locator('#canvas-host').evaluate(element => JSON.parse(element.dataset.renderStats));
  const refreshFrames = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const sample = now => {
      if (previous !== undefined) samples.push(now - previous); previous = now;
      if (samples.length === 10) {
        const weather = document.querySelector('#weather'); weather.value = 'overcast'; weather.dispatchEvent(new Event('change'));
      }
      if (samples.length < 180) requestAnimationFrame(sample);
      else { samples.sort((a, b) => a - b); resolve({ samples: samples.length, median_ms: samples[90], p95_ms: samples[171], max_ms: samples.at(-1) }); }
    }; requestAnimationFrame(sample);
  }));
  const finalProbe = await probe();
  check(finalProbe.captures > overcast.captures && !finalProbe.failed, 'The UHD weather refresh must complete');
  check(await page.locator('#canvas-host canvas').evaluate(canvas => canvas.getContext('webgl2').getError()) === 0, 'District WebGL must remain clean');
  check(errors.length === 0, `Browser errors: ${errors.join('; ')}`);
  return { optics, firstProbe: first, weatherProbe: overcast, finalProbe, buffer, stats, frame_sample: frames, weather_refresh_sample: refreshFrames, frame_sample_scope: 'Local Chrome street view with moving residents; not UE5 or target-GPU performance proof', browserErrors: errors };
}
