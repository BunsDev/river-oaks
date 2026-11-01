// Depth layers and the shared shader patches in the composed town, run at the Commons revision
// (the District, the Gardens campus and the Commons together). Parallel faces of different
// materials that sit too close for the depth buffer fight: the farther one shows through in
// patches that crawl as the camera moves (Val saw a planter's brass slab through its mulch).
// The journey measures this renderer's depth reach (evidence), scans the loaded world at three
// stations with the fixed, conservative depth model (the gate: the same on every runner), then
// renders each shared shader patch on the meshes it must handle (instanced, batched, unmapped)
// and fails on any shader that does not compile. Pairs that predate this journey are listed in
// depth-layers-known.json and burn down; any pair not on that list fails. To rewrite the list
// after fixing some, run with RIVER_OAKS_DEPTH_LAYERS_RECORD=1. The town is scanned under the
// classic city-kit finish unless RIVER_OAKS_FINISH names another (`pink-jet-age`, #836): the
// name goes to the page as `?finish=` (render-quality.js readFinishPreference), so the same
// known list and gate apply to every finish.
async page => {
  const checks = [], errors = [], shaderErrors = [];
  const check = (condition, message, detail) => { if (!condition) throw new Error(`${message}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 1500)}`}`); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|Program Info Log|VALIDATE_STATUS/.test(message.text())) shaderErrors.push(message.text().slice(0, 500)); });
  const finish = /^[a-z][a-z0-9-]{0,31}$/.test(process.env.RIVER_OAKS_FINISH ?? '') ? process.env.RIVER_OAKS_FINISH : 'classic';
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:5173/?motion-debug=1&render-audit=1&finish=${finish}`);
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 180000 });
  await page.waitForFunction(() => document.querySelector('#canvas-host').dataset.playerReady === 'true', null, { timeout: 180000 });

  // The depth buffer's reach on this renderer, recorded beside the fixed model the gate uses.
  const precision = await page.evaluate(() => window.__riverRenderAudit.depthPrecision());
  const measured = precision.onsets.filter(onset => onset.slack !== null), slack = Math.max(...measured.map(onset => onset.slack));
  check(measured.length > 0 && Number.isFinite(slack), "this renderer's depth reach was measured", precision.onsets);

  const travel = async ([east, north]) => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await page.evaluate(position => window.__riverMultiplayerCommand({ type: 'travel', position }), [east, north]);
      if (result?.ok) break;
      if (result?.error !== 'travel_cooldown') throw new Error(`travel refused ${JSON.stringify(result)}`);
      await page.waitForTimeout(1100);
    }
    await page.waitForFunction(([east, north]) => { const p = window.__riverCarriage().pose.position; return Math.hypot(p[0] - east, -p[2] - north) < 2.5; }, [east, north], { timeout: 30000 });
  };
  // Streaming and level of detail settle when the drawn geometry stops changing.
  const settle = async () => {
    let last = null, steady = 0;
    for (let i = 0; i < 90 && steady < 4; i++) {
      await page.waitForTimeout(1000);
      const geometries = await page.evaluate(() => JSON.parse(document.querySelector('#canvas-host').dataset.renderStats || '{}').geometries ?? null);
      steady = geometries !== null && geometries === last ? steady + 1 : 0; last = geometries;
    }
  };
  const stations = [['the District arrival', null], ['east of the Gardens campus', [-2688, -1290]], ['inside the Commons', [-2606, -1335]]];
  const scans = [];
  for (const [station, position] of stations) {
    if (position) await travel(position);
    await settle();
    const started = Date.now(), { faces, truncated, fights } = await page.evaluate(() => window.__riverRenderAudit.depthFights());
    check(!truncated, `the scan ${station} covered every face`, { faces });
    scans.push({ station, seconds: (Date.now() - started) / 1000, faces, fights });
  }
  // Grouped by the two surfaces and their gap; the full list goes into the report as evidence.
  const groups = new Map();
  for (const scan of scans) for (const fight of scan.fights) {
    const key = `${fight.a} ~ ${fight.b} ~ ${fight.gap.toFixed(4)}`, group = groups.get(key) ?? { a: fight.a, b: fight.b, gap: +fight.gap.toFixed(4), stations: [], pairs: 0, widest: 0, fightMetres: Math.round(fight.fightMetres), at: fight.at };
    if (!group.stations.includes(scan.station)) group.stations.push(scan.station);
    group.pairs += fight.count; if (fight.size > group.widest) { group.widest = +fight.size.toFixed(2); group.at = fight.at.map(v => +v.toFixed(1)); }
    groups.set(key, group);
  }
  const { readFile, writeFile } = await import('node:fs/promises'), list = 'preview/e2e/depth-layers-known.json', key = g => `${g.a} ~ ${g.b} ~ ${(+g.gap).toFixed(4)}`;
  const found = [...groups.values()].sort((p, q) => key(p) < key(q) ? -1 : 1);
  // One pair per line, so a fix shows as the lines it removes.
  if (process.env.RIVER_OAKS_DEPTH_LAYERS_RECORD === '1') await writeFile(list, `{\n "note": ${JSON.stringify('Surface pairs that fought for depth before preview/e2e/depth-layers.js; fix them and rerun with RIVER_OAKS_DEPTH_LAYERS_RECORD=1 to shrink this list.')},\n "pairs": [\n${found.map(({ a, b, gap, stations, widest, fightMetres, at }) => `  ${JSON.stringify({ a, b, gap, stations, widest, fightMetres, at })}`).join(',\n')}\n ]\n}\n`);
  const known = new Set(JSON.parse(await readFile(list, 'utf8')).pairs.map(key)), fresh = found.filter(g => !known.has(key(g))), gone = [...known].filter(k => !groups.has(k));
  if (fresh.length) {
    const error = new Error(`${fresh.length} new pairs of surfaces fight for depth within sight: ${fresh.slice(0, 8).map(g => `${g.a} / ${g.b} ${g.gap * 1000} mm at ${g.at}`).join('; ')}`);
    error.journeyEvidence = { finish, slack, precision: precision.onsets, fresh, groups: found, scans: scans.map(({ station, seconds, faces }) => ({ station, seconds, faces })) };
    throw error;
  }
  checks.push(`no surface pair fights for depth within sight beyond the ${known.size} listed in ${list}`);

  // The shared shader patches, with their real modules, on the meshes they must handle.
  const patches = await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/three\.js\?/.test(name));
    const THREE = await import(url);
    const { createRoomGroundClip } = await import('/src/room-ground-clip.js');
    const { seeThroughNearCamera } = await import('/src/near-camera-fade.js');
    const { physicalSurface } = await import('/src/materials.js');
    const size = 32, canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true }), compileErrors = [];
    renderer.setPixelRatio(1); renderer.setSize(size, size, false);
    renderer.debug.onShaderError = (gl, program) => compileErrors.push(gl.getProgramInfoLog(program) || 'shader error');
    const pixels = new Uint8Array(size * size * 4), lit = (scene, camera) => {
      renderer.setClearColor(0x000000, 1); renderer.render(scene, camera);
      const gl = renderer.getContext(); gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let count = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 60) count++;
      return count / (size * size);
    };
    const above = (east, north, height = 5) => { const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 50); camera.position.set(east, height, -north); camera.up.set(0, 0, -1); camera.lookAt(east, 0, -north); return camera; };
    const plane = () => new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2), white = () => new THREE.MeshBasicMaterial({ color: 0xffffff });
    // A plain mesh moves by its own matrix; an instanced one by its instance's.
    const placed = (mesh, east, north) => {
      const matrix = new THREE.Matrix4().makeTranslation(east, 0, -north);
      if (mesh.isInstancedMesh) { mesh.setMatrixAt(0, matrix); mesh.instanceMatrix.needsUpdate = true; } else mesh.matrix.copy(matrix);
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.updateMatrixWorld(true); return mesh;
    };
    // A room 10–14 m east and north; outdoor ground drawn inside it is cut away.
    const room = { footprint: [[10, 10], [14, 10], [14, 14], [10, 14]], facade: [10, 10], right: [1, 0], aMin: 0, aMax: 4, depth: 4, floor: 0, toLocal: (east, north) => [east - 10, north - 10] };
    const clipCase = instanced => {
      const clip = createRoomGroundClip([room]), scene = new THREE.Scene();
      const ground = instanced ? new THREE.InstancedMesh(plane(), white(), 1) : new THREE.Mesh(plane(), white());
      scene.add(ground); clip.apply(scene);
      placed(ground, 12, 12); const inside = lit(scene, above(12, 12));
      placed(ground, 30, 30); const outside = lit(scene, above(30, 30));
      clip.dispose(); return { inside, outside };
    };
    const plainClip = clipCase(false), instancedClip = clipCase(true);
    // A batched quad a metre under the camera dissolves; six metres under it, it is whole.
    const fadeCase = () => {
      const material = seeThroughNearCamera(white()), batch = new THREE.BatchedMesh(1, 64, 64, material);
      const id = batch.addInstance(batch.addGeometry(plane()));
      batch.setMatrixAt(id, new THREE.Matrix4().makeTranslation(50, 0, -50)); batch.frustumCulled = false;
      const scene = new THREE.Scene(); scene.add(batch);
      return { near: lit(scene, above(50, 50, 1)), far: lit(scene, above(50, 50, 6)) };
    };
    const fade = fadeCase();
    // A paver surface without a colour map still compiles its variation.
    const unmapped = new THREE.Mesh(plane(), physicalSurface('district-paver', { variation: .06, map: null }));
    const lights = new THREE.Scene(); lights.add(unmapped, new THREE.AmbientLight(0xffffff, 3));
    const surface = lit(lights, above(0, 0));
    renderer.dispose();
    return { plainClip, instancedClip, fade, surface, compileErrors };
  });
  // Every patch is judged before any failure is reported, so one run names all that regressed.
  const judged = [
    [patches.plainClip.inside < .05 && patches.plainClip.outside > .95, 'outdoor ground inside a room footprint is cut away, and kept outside it', patches.plainClip],
    [patches.instancedClip.inside < .05 && patches.instancedClip.outside > .95, 'the room clip cuts instanced ground where the instance stands, not at its geometry origin', patches.instancedClip],
    [patches.fade.near < .05 && patches.fade.far > .95, 'the near-camera fade dissolves a batched mesh by where the batch places it', patches.fade],
    [patches.surface > .95 && patches.compileErrors.length === 0, 'a paver surface without a colour map compiles and draws', { surface: patches.surface, errors: patches.compileErrors.map(error => error.slice(0, 300)) }],
  ];
  const failed = judged.filter(([ok]) => !ok);
  check(failed.length === 0, `shader patches failed: ${failed.map(([, message]) => message).join('; ')}`, failed.map(([, message, detail]) => ({ message, detail })));
  for (const [, message] of judged) checks.push(message);
  check(shaderErrors.length === 0, 'every shader in the town compiled', shaderErrors.slice(0, 3));
  check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  return { passed: true, checks, finish, precision: precision.onsets, slack, known: known.size, remaining: found.length, fixedSinceListed: gone, scans: scans.map(({ station, seconds, faces, fights }) => ({ station, seconds, faces, fights: fights.length })), patches };
}
