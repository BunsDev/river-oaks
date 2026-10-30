// Depth layers and the shared shader patches in the composed town, run at the Commons revision
// (the District, the Gardens campus and the Commons together). Parallel faces of different
// materials that sit too close for the depth buffer fight: the farther one shows through in
// patches that crawl as the camera moves (Val saw a planter's brass slab through its mulch).
// The journey measures this renderer's depth reach (evidence), scans the loaded world at three
// stations with the fixed, conservative depth model (the gate: the same on every runner), then
// renders each shared shader patch on the meshes it must handle (instanced, batched, unmapped)
// and fails on any shader that does not compile. Pairs that predate this journey are listed in
// depth-layers-known.json and burn down; any pair not on that list fails. To rewrite the list
// after fixing some, run with RIVER_OAKS_DEPTH_LAYERS_RECORD=1.
async page => {
  const checks = [], errors = [], shaderErrors = [];
  const check = (condition, message, detail) => { if (!condition) throw new Error(`${message}${detail === undefined ? '' : ` ${JSON.stringify(detail).slice(0, 1500)}`}`); checks.push(message); };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/Shader Error|Program Info Log|VALIDATE_STATUS/.test(message.text())) shaderErrors.push(message.text().slice(0, 500)); });
  const {createCampusStartupReadiness}=await import('./garden-campus-readiness.js');
  const readiness=createCampusStartupReadiness();readiness.track(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1&render-audit=1');
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
    // A synchronous million-face DEV scan can outlast a software runner's heartbeat. Admit the
    // next action on a proved responsive connection, without changing production timeouts or retrying commands.
    if (position) { await readiness.joined(page);await travel(position); }
    await settle();
    const started = Date.now(), { faces, truncated, fights, occurrences } = await page.evaluate(() => window.__riverRenderAudit.depthFights({occurrences:true}));
    check(!truncated, `the scan ${station} covered every face`, { faces });
    scans.push({ station, seconds: (Date.now() - started) / 1000, faces, fights, occurrences });
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
  const { collectDepthOccurrences, compareDepthBaseline, burnDownDepthBaseline, formatDepthBaseline } = await import('../src/depth-layer-baseline.js');
  let baseline=JSON.parse(await readFile(list,'utf8'));
  const occurrences=collectDepthOccurrences(scans);
  // Migration is explicit and only available for the legacy class-only file. Run it on the
  // recorded, unchanged geometry before fixing defects; never use it to accept a new version-2 regression.
  if (process.env.RIVER_OAKS_DEPTH_LAYERS_MIGRATE === '1') {
    if (baseline.version===2) throw new Error('Depth occurrence baseline already migrated');
    const {execFileSync}=await import('node:child_process');
    const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
    if (head!=='3d666a2982b1c422f1ad7e1d0acde9dc3b8d13e8') throw new Error('Migration must run on the recorded geometry baseline');
    execFileSync('git',['diff','--exit-code','HEAD','--','preview/src/city-kit','preview/src/district.js','preview/src/reference-facades.js','preview/src/reference-blocks.js','preview/src/store-interiors.js','preview/src/ipic-interior.js','preview/src/garden-campus.js','preview/src/green-roofs.js'],{stdio:'pipe'});
    baseline={...baseline,version:2,geometryBaseline:'3d666a2982b1c422f1ad7e1d0acde9dc3b8d13e8',occurrences};
    await writeFile(list,formatDepthBaseline(baseline));
  }
  const known = new Set(baseline.pairs.map(key)), fresh = compareDepthBaseline(baseline,occurrences), gone = [...known].filter(k => !groups.has(k));
  if (fresh.length) {
    const error = new Error(`${fresh.length} new or enlarged depth occurrences: ${fresh.slice(0, 8).map(g => `${g.a} / ${g.b} at ${g.cell.map(v=>v*4)}`).join('; ')}`);
    error.journeyEvidence = { slack, precision: precision.onsets, fresh, groups: found, scans: scans.map(({ station, seconds, faces }) => ({ station, seconds, faces })) };
    throw error;
  }
  if (process.env.RIVER_OAKS_DEPTH_LAYERS_RECORD === '1') {
    baseline=burnDownDepthBaseline(baseline,occurrences);
    baseline.pairs=found.map(({a,b,gap,stations,widest,fightMetres,at})=>({a,b,gap,stations,widest,fightMetres,at}));
    await writeFile(list,formatDepthBaseline(baseline));
  }
  checks.push(`no new, enlarged or relocated conflict beyond ${baseline.occurrences.length} bounded depth occurrences`);

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
      if (mesh.isInstancedMesh || mesh.isBatchedMesh) { mesh.setMatrixAt(0, matrix); if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true; } else mesh.matrix.copy(matrix);
      mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.updateMatrixWorld(true); return mesh;
    };
    // A room 10–14 m east and north; outdoor ground drawn inside it is cut away.
    const room = { footprint: [[10, 10], [14, 10], [14, 14], [10, 14]], facade: [10, 10], right: [1, 0], aMin: 0, aMax: 4, depth: 4, floor: 0, toLocal: (east, north) => [east - 10, north - 10] };
    const clipCase = kind => {
      const clip = createRoomGroundClip([room]), scene = new THREE.Scene();
      const ground = kind==='batched' ? new THREE.BatchedMesh(1,64,64,white()) : kind==='instanced' ? new THREE.InstancedMesh(plane(), white(), 1) : new THREE.Mesh(plane(), white());
      if (kind==='batched') ground.addInstance(ground.addGeometry(plane()));
      const parent=new THREE.Group();scene.add(parent);parent.add(ground);
      if (kind==='batched') parent.position.set(3,0,-4);
      clip.apply(scene);
      placed(ground, 12-parent.position.x, 12+parent.position.z); const inside = lit(scene, above(12, 12));
      placed(ground, 30-parent.position.x, 30+parent.position.z); const outside = lit(scene, above(30, 30));
      clip.dispose(); return { inside, outside };
    };
    const plainClip = clipCase('plain'), instancedClip = clipCase('instanced'), batchedClip = clipCase('batched');
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
    return { plainClip, instancedClip, batchedClip, fade, surface, compileErrors };
  });
  // Every patch is judged before any failure is reported, so one run names all that regressed.
  const judged = [
    [patches.plainClip.inside < .05 && patches.plainClip.outside > .95, 'outdoor ground inside a room footprint is cut away, and kept outside it', patches.plainClip],
    [patches.instancedClip.inside < .05 && patches.instancedClip.outside > .95, 'the room clip cuts instanced ground where the instance stands, not at its geometry origin', patches.instancedClip],
    [patches.batchedClip.inside < .05 && patches.batchedClip.outside > .95, 'the room clip composes batch placement with a translated parent', patches.batchedClip],
    [patches.fade.near < .05 && patches.fade.far > .95, 'the near-camera fade dissolves a batched mesh by where the batch places it', patches.fade],
    [patches.surface > .95 && patches.compileErrors.length === 0, 'a paver surface without a colour map compiles and draws', { surface: patches.surface, errors: patches.compileErrors.map(error => error.slice(0, 300)) }],
  ];
  const failed = judged.filter(([ok]) => !ok);
  check(failed.length === 0, `shader patches failed: ${failed.map(([, message]) => message).join('; ')}`, failed.map(([, message, detail]) => ({ message, detail })));
  for (const [, message] of judged) checks.push(message);
  check(shaderErrors.length === 0, 'every shader in the town compiled', shaderErrors.slice(0, 3));
  check(errors.length === 0, 'no page errors', errors.slice(0, 3));
  return { passed: true, checks, precision: precision.onsets, slack, known: known.size, remaining: found.length, knownOccurrences: baseline.occurrences.length, observedOccurrences: occurrences.length, fixedSinceListed: gone, scans: scans.map(({ station, seconds, faces, fights }) => ({ station, seconds, faces, fights: fights.length })), patches };
}
