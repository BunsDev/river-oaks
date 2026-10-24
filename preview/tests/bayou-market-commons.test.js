import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDistrictData } from '../../server/district-data.js';
import { COMMONS_REVISION } from '../../shared/east-garden-commons-layout.js';
import { LANTERN_REACH } from '../../shared/commons-destination.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../src/walking.js';
import { plazaSalonSeats } from '../src/plaza-salon-plan.js';
import { buildEastGardenCommons } from '../src/east-garden-commons.js';

// Bayou Market Commons as both runtimes load it: the real District, Gardens and
// Commons composition, and the real walking environment.
const world = await loadDistrictData({ districtRevision: COMMONS_REVISION });
const layout = world.eastGardenCommons, plan = layout.destination, environment = createWalkingEnvironment(world);
const free = (east, north) => environment.isFree(east, -north);
const local = ([x, y]) => [layout.edge + x, -1335 + y];

// Flood fill on the real movement environment from the District side of the gateway.
function reachable(step = .25) {
  const [west, south, east, north] = [layout.edge - 6, -1376, layout.edge + 116, -1294];
  const columns = Math.ceil((east - west) / step) + 1, rows = Math.ceil((north - south) / step) + 1, seen = new Uint8Array(columns * rows);
  const at = (i, j) => [west + i * step, south + j * step], open = new Uint8Array(columns * rows);
  let walkable = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) { const [x, y] = at(i, j); if (free(x, y)) { open[j * columns + i] = 1; if (x > layout.edge) walkable++; } }
  const start = [Math.round((layout.edge - 2 - west) / step), Math.round((-1335 - south) / step)], queue = [start[1] * columns + start[0]];
  assert.equal(open[queue[0]], 1, 'gateway start is walkable');
  seen[queue[0]] = 1;
  let reached = 0;
  while (queue.length) {
    const index = queue.pop(), i = index % columns, j = (index - i) / columns, [x, y] = at(i, j);
    if (x > layout.edge) reached++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, next = nj * columns + ni;
      if (ni < 0 || nj < 0 || ni >= columns || nj >= rows || !open[next] || seen[next]) continue;
      const [nx, ny] = at(ni, nj);
      // The walking controller's step limit applies between neighbouring samples.
      if (Math.abs(environment.groundAt(nx, -ny) - environment.groundAt(x, -y)) > .4) continue;
      seen[next] = 1; queue.push(next);
    }
  }
  return { walkable, reached, has: ([x, y]) => Boolean(seen[Math.round((y - south) / step) * columns + Math.round((x - west) / step)]) };
}

test('the destination composes onto the approved Commons without moving it', () => {
  assert.equal(layout.revision, COMMONS_REVISION);
  assert.equal(plan.id, 'bayou-market-commons');
  assert.deepEqual(plan.anchor, [layout.edge, -1335]);
  assert.equal(layout.surfaces[0].id, 'east-garden-commons/promenade');
  assert.equal(layout.surfaces[1].id, 'east-garden-commons/plaza');
  assert.ok(layout.pavilion && layout.activity.tableId === 'chess-commons');
  assert.equal(new Set(layout.solids.map(solid => solid.id)).size, layout.solids.length);
  // Every destination piece stays inside the registered Commons bounds or is visual-only edge context.
  const [w, s, e, n] = [layout.edge, -1375, layout.edge + 115, -1295];
  for (const piece of plan.pieces.filter(item => !['building/context', 'landscape/bayou', 'furniture/railing'].includes(item.piece))) {
    const [x0, y0, x1, y1] = piece.rect ?? [...piece.at, ...piece.at];
    // Plans round to the millimetre.
    assert.ok(x0 >= w - 1e-3 && x1 <= e + 1e-3 && y0 >= s - 1e-3 && y1 <= n + 1e-3, piece.id);
  }
});

test('every walkable sample connects to the District gateway: no dead ends', () => {
  const reach = reachable();
  assert.equal(reach.reached, reach.walkable, `${reach.walkable - reach.reached} isolated samples`);
  assert.ok(reach.walkable > 4 * 4000, `walkable samples ${reach.walkable}`);
  const targets = {
    'market street east end': local([40, 0]), 'north sidewalk': local([30, 6]), 'south sidewalk': local([30, -6]),
    'garden court': local([24, -16]), 'terrace': local([52, 12]), 'under the water tower': local([106, 0]),
    'pavilion side': local([93, 13]), 'rain garden path': local([95, -30]),
  };
  for (const [name, point] of Object.entries(targets)) assert.ok(reach.has(point), name);
  for (const lantern of plan.lanterns) assert.ok([[-1.2, 0], [1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dy]) => reach.has([lantern.at[0] + dx, lantern.at[1] + dy])), lantern.id);
  for (const seat of plazaSalonSeats(world).filter(item => item.buildId.includes('chess-commons'))) assert.ok(reach.has(seat.approach), seat.buildId);
});

test('buildings, furniture and edges block walking; sidewalks and the court do not', () => {
  for (const shell of plan.pieces.filter(piece => piece.piece === 'building/shell')) {
    const [w, s, e, n] = shell.rect;
    assert.equal(free((w + e) / 2, (s + n) / 2), false, `inside ${shell.id}`);
  }
  // The walkable edge is the facade: half a metre in front is open, a body width into it is not.
  const corner = plan.pieces.find(piece => piece.id === 'bayou-market-commons/market-row/parcel-0');
  assert.equal(free((corner.rect[0] + corner.rect[2]) / 2, corner.rect[1] - .5), true);
  assert.equal(free((corner.rect[0] + corner.rect[2]) / 2, corner.rect[1] - .1), false);
  for (const solid of plan.solids) assert.equal(free((solid.rect[0] + solid.rect[2]) / 2, (solid.rect[1] + solid.rect[3]) / 2), false, solid.id);
  // Lane to sidewalk and sidewalk to court have no eroded seams.
  for (let y = -16.5; y <= 6.5; y += .1) if (!plan.solids.some(solid => Math.abs(solid.rect[0] - (layout.edge + 24)) < 1 && y > solid.rect[1] - .4 && y < solid.rect[3] + .4))
    assert.ok(free(layout.edge + 22, -1335 + y), `cross-street sample ${y.toFixed(1)}`);
  assert.equal(free(...local([80, 39.5])), false, 'north hedge');
  assert.equal(free(...local([116, 0])), false, 'bayou edge');
  assert.equal(environment.canFly(...[local([20, 20])].map(([x, y]) => [x, layout.ground + 30, -y])[0]), false, 'no flight over closed blocks');
});

test('the walking controller crosses from the District down Market Street into the court and back', () => {
  const start = [layout.edge - 1, -1335, 0], walker = createWalkingState(environment, start, -Math.PI / 2);
  const go = (yaw, seconds) => { walker.yaw = yaw; walker.velocity = [0, 0]; walker.acceleration = [0, 0]; for (let t = 0; t < seconds; t += .04) stepWalking(walker, environment, { forward: 1 }, .04); };
  go(-Math.PI / 2, 22); // east along the street centreline
  assert.ok(walker.position[0] > layout.edge + 24, `east ${walker.position[0] - layout.edge}`);
  const toCourt = layout.edge + 24 - walker.position[0];
  go(toCourt > 0 ? -Math.PI / 2 : Math.PI / 2, Math.abs(toCourt) / 1.4);
  go(Math.PI, 7); // south (scene +z) across the sidewalk into the court
  assert.ok(-walker.position[2] < -1335 - 9, `court reached at north ${-walker.position[2]}`);
  go(0, 7); go(Math.PI / 2, 25);
  assert.ok(walker.position[0] < layout.edge + 1, `back toward the District ${walker.position[0] - layout.edge}`);
});

test('every lantern can be lit from walkable ground within the server reach', () => {
  for (const lantern of plan.lanterns) {
    const spots = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) for (const r of [.9, 1.4, 2]) spots.push([lantern.at[0] + Math.cos(a) * r, lantern.at[1] + Math.sin(a) * r]);
    assert.ok(spots.some(([x, y]) => free(x, y) && Math.hypot(x - lantern.at[0], y - lantern.at[1]) <= LANTERN_REACH - .2), lantern.id);
  }
});

test('the composed scene builds within budget and releases what it owns', () => {
  const group = buildEastGardenCommons(layout), meshes = [];
  group.traverse(item => { if (item.isMesh) meshes.push(item); });
  assert.ok(meshes.length <= 70 + 20, `meshes ${meshes.length}`);
  assert.equal(group.userData.lanterns.size, plan.lanterns.length);
  const geometries = new Set(meshes.map(mesh => mesh.geometry));
  let disposed = 0; for (const geometry of geometries) geometry.addEventListener('dispose', () => disposed++);
  group.userData.dispose(); group.userData.dispose();
  assert.equal(disposed, geometries.size); assert.equal(group.children.length, 0);
});

test('the Bayou Market stalls line the green, block bodies and leave room to browse in front', async () => {
  const stalls = plan.pieces.filter(piece => piece.piece === 'furniture/market-stall');
  assert.equal(stalls.length, 4);
  assert.equal(new Set(stalls.map(stall => stall.sign)).size, 4, 'each stall has its own name');
  const reach = reachable();
  for (const stall of stalls) {
    assert.ok(plan.solids.some(solid => solid.id === stall.id), `${stall.id} is solid`);
    assert.equal(free(...stall.at), false, `${stall.id} blocks bodies`);
    // The counter faces the lawn (south); a shopper stands in front of it.
    assert.ok(reach.has([stall.at[0], stall.at[1] - 2]), `${stall.id} front is reachable`);
  }
  // Mown turf, not the bare gravel of the untinted grass maps.
  const { buildCityKit } = await import('../src/city-kit/render.js');
  const kit = buildCityKit(plan, { groundAt: () => 0, ground: 0 }), lawns = [];
  kit.traverse(item => { if (item.isMesh && item.material.name.startsWith('city-kit/lawn')) lawns.push(item.material); });
  assert.ok(lawns.length);
  for (const lawn of lawns) assert.ok(lawn.color.g > lawn.color.r * 1.1 && lawn.color.g > lawn.color.b * 1.2, `lawn tint ${lawn.color.getHexString()}`);
  kit.userData.dispose();
});
