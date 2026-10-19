import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greenRoofPlan, roofDiscFits, buildGreenRoofs } from '../src/green-roofs.js';
const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
test('authored roofs reproduce without changing district or observed records', () => {
  const before = JSON.stringify(world), a = greenRoofPlan(world);
  assert.deepEqual(a, greenRoofPlan(structuredClone(world)));
  assert.equal(JSON.stringify(world), before);
  assert.equal(a.surfaces.length, 4);
  for (const surface of a.surfaces) {
    assert.ok(surface.beds.length > 0, surface.id);
    for (const bed of surface.beds) assert.ok(roofDiscFits(surface, bed.at, bed.radius));
  }
  assert.equal(a.exclusions.length, world.buildings.length - 4);
});
test('complete planting discs respect concave boundaries, tower voids and service margins', () => {
  const surface = { ring: [[0,0],[20,0],[20,8],[8,8],[8,20],[0,20],[0,0]], voids: [], services: [] };
  assert.equal(roofDiscFits(surface, [7,7], 2), false);
  assert.equal(roofDiscFits(surface, [4,4], 1), true);
  surface.voids = [[[2,2],[6,2],[6,6],[2,6],[2,2]]];
  assert.equal(roofDiscFits(surface, [4,4], 1), false);
  surface.voids = []; surface.services = [{ at: [4,4], radius: 2 }];
  assert.equal(roofDiscFits(surface, [4,4], 1), false);
});
test('rendered beds are bounded below existing flight exclusion and have no new lights', () => {
  const group = buildGreenRoofs(world);
  let count = 0;
  group.traverse(object => { assert.ok(!object.isLight); if (object.isInstancedMesh) { assert.ok(object.count > 0); count += object.count; } });
  assert.ok(count > 100);
  for (const surface of group.userData.roofPlan.surfaces) {
    const building = world.buildings.find(b => b.id === surface.id);
    assert.ok(surface.y + .38 + 1 < building.center[2] + building.size[2] + 2.6);
  }
});

test('every rendered instance is supported by a reviewed roof and stays inside its flight envelope', async () => {
  const THREE = await import('three');
  const group = buildGreenRoofs(world), plan = group.userData.roofPlan;
  const matrix = new THREE.Matrix4(), bounds = new THREE.Box3(), center = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    mesh.geometry.computeBoundingBox();
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix); bounds.copy(mesh.geometry.boundingBox).applyMatrix4(matrix).applyMatrix4(mesh.matrixWorld); bounds.getCenter(center);
      const surface = plan.surfaces.find(s => Math.abs(bounds.min.y - s.y) < 1.5 && [...s.beds,...s.fields,...s.seats,...s.paths.map(at => ({at,radius:1.2}))].some(b => Math.hypot(center.x - b.at[0], center.z + b.at[1]) < b.radius));
      assert.ok(surface, `${mesh.name} has a supported roof`);
      assert.ok(bounds.min.y >= surface.y - .001, `${mesh.name} does not penetrate roof`);
      const building = world.buildings.find(b => b.id === surface.id);
      assert.ok(bounds.max.y < building.center[2] + building.size[2] + 2.6, `${mesh.name} below flight envelope`);
    }
  });
});

test('unsupported worlds create no GPU resources', () => {
  const group = buildGreenRoofs({ buildings: [], stores: [] });
  assert.equal(group.children.length, 0);
});

test('office skyline captures the planted neighbours, then restores matrices and disposes the visit', async () => {
  const THREE = await import('three');
  const { createOfficeSkyline } = await import('../src/office-skyline.js');
  const scene = new THREE.Scene(), roofs = buildGreenRoofs(world); scene.add(roofs); scene.updateMatrixWorld(true);
  const matrices = () => { const values = []; roofs.traverse(mesh => { if (mesh.isInstancedMesh) values.push(Array.from(mesh.instanceMatrix.array)); }); return values; };
  const original = matrices();
  const ipic = greenRoofPlan(world).surfaces.find(s => s.id === 'osm-way-625330798');
  let target = null, faces = 0, observedNeighbour = false;
  const renderer = { coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false }, autoClear: false,
    shadowMap: { autoUpdate: true, needsUpdate: false }, info: { programs: [] },
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget(value) { target = value; },
    render(drawnScene) {
      if(drawnScene !== scene) return; // Snapshot face-copy passes do not draw the district.
      faces++;
      roofs.traverse(mesh => {
        if (!mesh.isInstancedMesh) return;
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix);
          if (matrix.elements[0] !== 0 && Math.abs(matrix.elements[13] - ipic.y) < 1.5) observedNeighbour = true;
        }
      });
    },
  };
  const host = world.buildings.find(b => b.id === 'osm-way-625330785');
  for (let visit = 0; visit < 2; visit++) {
    const skyline = createOfficeSkyline({ renderer, scene, eye: new THREE.Vector3(host.center[0], 48, -host.center[1]), floorY: 47,
      hostBuildingId: host.id, hostBuildingIndex: 0, hostRing: host.ring.map(([x,n]) => [x,-n]), size: 16 });
    assert.equal(skyline.capture(), true); assert.equal(skyline.capture(), false);
    assert.ok(observedNeighbour); assert.equal(faces, (visit + 1) * 6);
    assert.deepEqual(matrices(), original);
    skyline.dispose(); assert.equal(skyline.capture(), false); assert.equal(scene.background, null);
  }
});

test('fine foliage switches with the viewing camera while broad fields remain', async () => {
  const THREE = await import('three'), group = buildGreenRoofs(world), camera = new THREE.PerspectiveCamera();
  const lods = []; group.traverse(object => { if (object.isLOD) lods.push(object); });
  assert.ok(lods.length > 0);
  group.updateMatrixWorld(true);
  for (const lod of lods) {
    camera.position.copy(lod.position); camera.updateMatrixWorld(true); lod.update(camera);
    assert.equal(lod.levels[0].object.visible, true);
    camera.position.copy(lod.position).add(new THREE.Vector3(0,0,80)); camera.updateMatrixWorld(true); lod.update(camera);
    assert.equal(lod.levels[0].object.visible, false);
    assert.equal(lod.levels[1].object.visible, true);
    const mesh = lod.levels[0].object;
    assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).toArray(), [0,0,0], 'LOD preserves authored world transforms');
  }
  assert.ok(group.children.filter(object => object.name === 'Roof field').every(object => object.visible));
});

test('low fields, paths and seats reserve complete supported footprints', () => {
  const plan = greenRoofPlan(world), garden = plan.surfaces.find(s => s.treatment === 'garden');
  assert.equal(garden.seats.length, 2); assert.ok(garden.paths.length > 20);
  for (const surface of plan.surfaces) {
    assert.ok(surface.fields.length > 0);
    for (const field of surface.fields) {
      assert.ok(roofDiscFits(surface, field.at, field.radius));
      assert.ok(surface.seats.every(seat => Math.hypot(field.at[0]-seat.at[0],field.at[1]-seat.at[1]) > field.radius+seat.radius));
    }
    for (const point of surface.paths) assert.ok(roofDiscFits(surface,point,1.1));
    for (const seat of surface.seats) assert.ok(roofDiscFits(surface,seat.at,seat.radius));
  }
});

test('each continuous field triangle remains in its validated roof cells and leaves the pavilion void open', async () => {
  const THREE = await import('three'), group = buildGreenRoofs(world), plan = group.userData.roofPlan;
  let fields = 0;
  group.traverse(mesh => {
    if (mesh.name !== 'Roof field') return;
    fields++;
    const surface = plan.surfaces.find(s => s.id === mesh.userData.roofSurface), positions = mesh.geometry.attributes.position;
    assert.ok(surface);
    for (let i = 0; i < positions.count; i += 3) {
      const x = (positions.getX(i) + positions.getX(i+1) + positions.getX(i+2)) / 3;
      const n = -(positions.getZ(i) + positions.getZ(i+1) + positions.getZ(i+2)) / 3;
      assert.ok(surface.fields.some(cell => Math.abs(x-cell.at[0]) <= cell.size/2+.001 && Math.abs(n-cell.at[1]) <= cell.size/2+.001), `${surface.id} triangle has roof support`);
    }
    if (surface.id === 'osm-way-625330792') {
      const ring = surface.voids[0], center = ring.slice(0,-1).reduce((sum,p) => [sum[0]+p[0]/(ring.length-1),sum[1]+p[1]/(ring.length-1)],[0,0]);
      mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(new THREE.Vector3(center[0],surface.y+5,-center[1]),new THREE.Vector3(0,-1,0));
      assert.equal(ray.intersectObject(mesh).length,0,'no planting surface covers the pavilion');
    }
  });
  assert.equal(fields,4);
});

test('both focal garden pockets contain raised foliage beyond the two isolated island planters', async () => {
  const THREE = await import('three'), group = buildGreenRoofs(world), surface = group.userData.roofPlan.surfaces.find(s=>s.treatment==='garden');
  const south = Math.min(...surface.ring.map(p=>p[1])), pockets = [south+10,south+27], seen = [0,0], matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse(mesh=>{
    if(!mesh.isInstancedMesh || !/Procedural|ornamental grass/.test(mesh.name))return;
    for(let i=0;i<mesh.count;i++) {
      mesh.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
      if(point.y < surface.y+surface.fieldDepth-.01 || point.y > surface.y+surface.fieldDepth+1)continue;
      if(surface.beds.some(b=>Math.hypot(point.x-b.at[0],-point.z-b.at[1])<b.radius))continue;
      pockets.forEach((n,index)=>{if(Math.abs(-point.z-n)<4.5 && surface.fields.some(f=>Math.hypot(point.x-f.at[0],-point.z-f.at[1])<f.radius))seen[index]++;});
    }
  });
  assert.ok(seen.every(count=>count>0), `both field pockets have visible planting: ${seen}`);
});

test('actual live office roof outlook includes a planted neighbour from its terrace eye', async () => {
  const THREE = await import('three');
  const { officeLobbyFor } = await import('../src/office-contract.js');
  const { ARRIVAL } = await import('../src/office-arrival-model.js');
  const { officeLayout, officeView } = await import('../src/office-layouts.js');
  const site = officeLobbyFor(world), n = site.outward, layout = officeLayout('office-penthouse-1');
  // Same lobby placement as district.js. Live rays originate at the actual
  // terrace eye, preserving positional parallax instead of a fixed capture eye.
  const frame = new THREE.Matrix4().makeRotationY(Math.atan2(n[0], -n[1]));
  frame.setPosition(site.facade[0] - n[0] * ARRIVAL.facadeOffset, site.floor, -site.facade[1] + n[1] * ARRIVAL.facadeOffset);
  const view = officeView(layout, 'roof-gardens');
  const origin = new THREE.Vector3(view.eye[0],view.eye[1],-view.eye[2]).applyMatrix4(frame);
  origin.y += ARRIVAL.officeElevation;
  const direction = new THREE.Vector3(view.target[0]-view.eye[0], view.target[1]-view.eye[1], view.eye[2]-view.target[2]).transformDirection(frame);
  const roofs = buildGreenRoofs(world); roofs.updateMatrixWorld(true);
  const fields = []; roofs.traverse(mesh => { if (mesh.userData.roofSurface) fields.push(mesh); });
  const camera = new THREE.PerspectiveCamera(62, 4/3, .5, 6000);
  camera.position.copy(origin); camera.lookAt(origin.clone().add(direction)); camera.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), hits = [];
  // The central maintenance lane should remain bare. Sample the surrounding
  // central viewport, rather than requiring planting under the centre pixel.
  for (const x of [-.4,-.2,0,.2,.4]) for (const y of [-.2,0,.2]) {
    ray.setFromCamera(new THREE.Vector2(x,y), camera);
    hits.push(...ray.intersectObjects(fields, false));
  }
  const neighbour = hits.find(hit => hit.object.userData.roofSurface === 'osm-way-625330792');
  assert.ok(neighbour, 'the actual live viewport includes authored podium planting');
  assert.ok(neighbour.distance > 20 && neighbour.distance < 100, 'a neighbouring podium, not an invented distant backdrop');
});
