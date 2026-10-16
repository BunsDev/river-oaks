async page => {
  const {mkdir, writeFile} = await import('node:fs/promises');
  const checks = [], samples = [], errors = [];
  const saveCanvas = async (id, path) => {
    const png = await page.locator('#' + id).evaluate(canvas => canvas.toDataURL('image/png'));
    await writeFile(path, Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
  };
  const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(label); };
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({reducedMotion: 'no-preference'}); await page.setViewportSize({width: 1260, height: 680});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/jevica.html?appearance=sable-human&remote=1&face=none');
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const {matrix, exclusions} = await page.evaluate(async () => {
    const module = await import('/audit/character-wardrobe-matrix.js');
    return {matrix: module.characterWardrobeMatrix(), exclusions: module.CHARACTER_WARDROBE_EXCLUSIONS};
  });
  await mkdir('.runtime/character-studio/wardrobe', {recursive: true});
  const progress = status => writeFile('.runtime/character-studio/wardrobe/progress.json', JSON.stringify({status, checks, samples, exclusions, errors}, null, 2) + '\n');
  for (const row of matrix) {
    const {appearanceId, pose} = row;
    await page.goto(`http://127.0.0.1:5173/e2e/fixtures/jevica.html?appearance=${appearanceId}&remote=1&face=none`);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    try {
      const result = await page.evaluate(async row => {
        const f = window.jevicaFixture, {THREE} = f;
        let colors, costume;
        if (row.character === 'sable') {
          const {customizedCharacterDefinition} = await import('/src/character-customization.js');
          const {createCharacterMaterials} = await import('/src/character-studio-materials.js');
          colors = createCharacterMaterials(f.avatar.object);
          colors.apply(customizedCharacterDefinition('fixture-owner', row.appearanceId, {palette: 'rose', hair: 'espresso'}));
        }
        if (row.costume === 'jevica') {
          const {createPlayerCostume} = await import('/src/player-costume.js');
          costume = createPlayerCostume(f.avatar, 'jevica');
        }
        window.disposeWardrobe = () => { colors?.dispose(); costume?.dispose(); f.avatar.dispose(); f.renderer.dispose(); f.renderer.forceContextLoss(); };
        f.renderer.setSize(420, 640); f.camera.aspect = 420 / 640; f.camera.updateProjectionMatrix();
        const canvas = document.createElement('canvas'); canvas.id = 'wardrobe-strip'; canvas.width = 1260; canvas.height = 680 * row.frames.length;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#eeeae5'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
        const seated = row.pose === 'sit', snapshots = [];
        const skirt = f.avatar.rig.model.getObjectByName('Vesper velvet wrap skirt');
        if (row.character === 'vesper' && (!skirt?.isSkinnedMesh || !f.avatar.rig.model.getObjectByName('Vesper wrap trim')?.isSkinnedMesh)) throw new Error('Vesper requires the fitted wrap and its trim');
        const {skirtContactFixture} = await import('/tests/helpers/skirt-contact.js');
        const contact = seated && skirt ? skirtContactFixture(f.avatar.rig.model, f.avatar.rig.model.getObjectByName('Jevica'), skirt) : null;
        f.avatar.object.position.y = seated ? .55 - f.avatar.rig.hipHeight + .025 : 0;
        const point = new THREE.Vector3(), instance = new THREE.Matrix4(), transform = new THREE.Matrix4();
        for (let frame = 0; frame <= row.frames.at(-1); frame++) {
          const time = frame * 1000 / 60, distance = time / 1000 * row.speed;
          f.avatar.object.position.z = distance;
          f.avatar.update(time, row.pose === 'wave' ? 'wave' : 'continue', false, {speed: row.speed, distance, beast: row.beast,
            riding: seated, ridingKind: seated ? 'seat' : undefined, seatToFloor: seated ? .55 : undefined, gestureTime: time / 1000}, () => 0);
          costume?.update(false, time);
          if (!row.frames.includes(frame)) continue;
          f.avatar.object.position.z = 0; f.scene.updateMatrixWorld(true);
          let finite = true, meshes = 0, vertices = 0;
          const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], textures = new Set(), materials = new Set();
          f.avatar.object.traverse(node => {
            finite &&= node.matrixWorld.elements.every(Number.isFinite);
            if (!node.isMesh) return;
            for (let parent = node; parent; parent = parent.parent) if (!parent.visible) return;
            meshes++;
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
              materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
            }
            for (let copy = 0; copy < (node.isInstancedMesh ? node.count : 1); copy++) {
              if (node.isInstancedMesh) { node.getMatrixAt(copy, instance); transform.multiplyMatrices(node.matrixWorld, instance); } else transform.copy(node.matrixWorld);
              for (let i = 0; i < node.geometry.attributes.position.count; i++) {
                node.getVertexPosition(i, point).applyMatrix4(transform); vertices++;
                finite &&= Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
                for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], point.getComponent(k)); max[k] = Math.max(max[k], point.getComponent(k)); }
              }
            }
          });
          const feet = ['foot_l', 'foot_r'].map(name => f.avatar.rig.model.getObjectByName(name).getWorldPosition(new THREE.Vector3()).sub(f.avatar.object.position).toArray());
          const render = [], offset = snapshots.length * 680;
          for (const [i, [view, x, z]] of [['front', 0, 4.2], ['side', 4.2, 0], ['rear', 0, -4.2]].entries()) {
            f.camera.position.set(x, 1.15, z); f.camera.lookAt(0, 1, 0); costume?.updateOptics(f.camera, 640);
            f.renderer.render(f.scene, f.camera); ctx.drawImage(f.renderer.domElement, i * 420, offset);
            ctx.fillStyle = '#302c28'; ctx.fillText(`${row.appearanceId} · ${row.pose} · ${view} · ${(time / 1000).toFixed(2)}s`, i * 420 + 210, offset + 666);
            render.push({...f.renderer.info.render});
          }
          if (seated) {
            f.camera.position.set(0, 2.2, 2.3); f.camera.lookAt(0, .65, 0); costume?.updateOptics(f.camera, 640); f.renderer.render(f.scene, f.camera);
            const above = document.createElement('canvas'); above.id = 'wardrobe-above'; above.width = 420; above.height = 640;
            above.getContext('2d').drawImage(f.renderer.domElement, 0, 0); document.body.append(above);
          }
          snapshots.push({frame, seconds: time / 1000, finite, meshes, vertices, materials: materials.size, bounds: {min, max}, feet,
            decoded: [...textures].map(texture => ({name: texture.name, width: texture.image?.width, height: texture.image?.height})), beastWeight: f.avatar.beastMotion, render});
          f.avatar.object.position.z = distance;
        }
        f.renderer.domElement.style.display = 'none'; document.body.append(canvas);
        const gl = f.renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        const thighContact = contact?.sample() ?? null; contact?.dispose();
        return {thighContact, appearanceId: row.appearanceId, pose: row.pose, rig: f.avatar.profile, snapshots,
          renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), userAgent: navigator.userAgent};
      }, row);
      samples.push(result);
      await saveCanvas('wardrobe-strip', `output/playwright/character-wardrobe-${appearanceId}-${pose}.png`);
      if (pose === 'sit') await saveCanvas('wardrobe-above', `output/playwright/character-wardrobe-${appearanceId}-sit-above.png`);
      await progress('running');
      check(result.rig === row.rig, `${appearanceId}/${pose}: correct shipped rig`);
      check(result.snapshots.length === row.frames.length, `${appearanceId}/${pose}: all scheduled phases captured`);
      check(result.snapshots.every(s => s.finite && s.meshes > 0 && s.vertices > 0 && s.bounds.max.every((v, i) => v - s.bounds.min[i] < 10)), `${appearanceId}/${pose}: finite bounded visible geometry including instances`);
      check(result.snapshots.every(s => s.decoded.length > 0 && s.decoded.every(t => t.width > 0 && t.height > 0)), `${appearanceId}/${pose}: material textures decoded`);
      check(result.snapshots.every(s => s.render.length === 3 && s.render.every(r => r.calls > 0 && r.triangles > 0)), `${appearanceId}/${pose}: all views rendered geometry`);
      if (row.character === 'vesper' && pose === 'sit') check(result.thighContact?.tested > 200 && result.thighContact.penetrating === 0, `${appearanceId}/${pose}: seated wrap clears sampled upper thighs`);
      if (row.beast) check(result.snapshots.every(s => s.beastWeight > .95), `${appearanceId}/${pose}: beast locomotion active`);
      if (row.speed) {
        const first = result.snapshots[0].feet;
        check(result.snapshots.slice(1).some(s => s.feet.some((foot, i) => foot.some((v, k) => Math.abs(v - first[i][k]) > .001))), `${appearanceId}/${pose}: gait advances across sampled phases`);
      }
      await progress('running'); console.log(`Wardrobe ${appearanceId}/${pose}: ${result.snapshots.length} phases`);
    } catch (error) { await progress('failed'); throw error; }
    finally { await page.evaluate(() => window.disposeWardrobe?.()); }
  }
  check(errors.length === 0, `No runtime errors: ${errors.join('; ')}`); await progress('passed');
  return {passed: true, checks, samples, exclusions, visualReview: 'pending',
    scope: 'All authored bundles, fixed poses and four sampled phases per moving gait. Actual geometry, instances, texture decode and advancing feet are checked. Captures require visual review; no automatic garment collision, attachment quality, continuous-cycle, approved-device or human acceptance claim.'};
}
