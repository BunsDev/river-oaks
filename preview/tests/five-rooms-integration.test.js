import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWalkingEnvironment } from '../src/walking.js';
import { districtRibbonPlan, DISTRICT_RIBBON_LANE } from '../src/ribbon-district.js';
import { buildRibbon } from '../src/ribbon-finish.js';
import { buildFiveRoomsShells } from '../src/five-rooms/index.js';
import { fiveRoomsFootprints, venueSolids, frontageFrame, FIVE_ROOMS_SOLIDS } from '../src/five-rooms/solids.js';
import { CAMPUS_BODY } from '../../shared/garden-campus-layout.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const world = read('../public/data/district.json'), contract = read('../../config/ribbon/five-rooms.json');
const environment = createWalkingEnvironment(world), before = createWalkingEnvironment(world, [], null, { fiveRooms: false });
const vertices = geometry => { const p = geometry.attributes.position, out = []; for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]); return out; };

test('the solids are the Ribbon posts and the shell parts in front of the mapped walls, for the District only', () => {
  const groups = fiveRoomsFootprints(world), plan = districtRibbonPlan(world);
  const posts = groups.flat().filter(disc => disc[2] === FIVE_ROOMS_SOLIDS.post);
  assert.notEqual(FIVE_ROOMS_SOLIDS.post, FIVE_ROOMS_SOLIDS.strip.radius);
  assert.equal(posts.length, plan.posts.length, 'one disc per drawn post');
  assert.equal(groups.length, Math.ceil(plan.posts.length / 10) + contract.venues.length);
  assert.equal(venueSolids(contract.venues.find(venue => venue.id === 'venue:studios-overlook'), world).length, 4, 'four hoop legs at the threshold');
  // A creator world without the central lane gets none.
  assert.deepEqual(fiveRoomsFootprints({ ...world, roads: world.roads.filter(road => road.id !== DISTRICT_RIBBON_LANE) }), []);
  assert.deepEqual(fiveRoomsFootprints(null), []);
});

test('every solid stands on something drawn: posts on the finished Ribbon, shell discs on the shell', () => {
  const ribbon = buildRibbon({ world, groundAt: () => 0 }), shells = buildFiveRoomsShells(contract, { finish: 'pink-jet-age' });
  const postMesh = ribbon.children.find(mesh => mesh.name === 'Ribbon posts'), m = new THREE.Matrix4(), p = new THREE.Vector3();
  const drawnPosts = Array.from({ length: postMesh.count }, (_, i) => { postMesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); return [p.x, -p.z]; });
  for (const [east, north] of districtRibbonPlan(world).posts.map(post => post.position)) assert.ok(drawnPosts.some(([x, y]) => Math.hypot(x - east, y - north) < 0.01), `post at ${east}, ${north}`);
  // Each disc's centre, at hip, chest or head height, lies within its radius (plus a margin) of a
  // drawn triangle: the solid matches a drawn part, not empty air.
  const triangles = shells.children.flatMap(mesh => { const v = vertices(mesh.geometry), out = []; for (let i = 0; i + 2 < v.length; i += 3) out.push(new THREE.Triangle(...v.slice(i, i + 3).map(q => new THREE.Vector3(...q)))); return out; });
  const boxes = triangles.map(t => new THREE.Box3().setFromPoints([t.a, t.b, t.c]));
  const closest = new THREE.Vector3(), centre = new THREE.Vector3();
  for (const venue of contract.venues) for (const [east, north, radius] of venueSolids(venue, world)) {
    const hit = [0.3, 1, 2].some(h => {
      centre.set(east, venue.floor.height + h, -north);
      return triangles.some((t, i) => boxes[i].distanceToPoint(centre) <= radius + 0.12 && t.closestPointToPoint(centre, closest).distanceTo(centre) <= radius + 0.12);
    });
    assert.ok(hit, `${venue.id} disc at ${east}, ${north} has no drawn part`);
  }
  ribbon.userData.dispose(); shells.userData.dispose();
});

test('walking: a post and a shell frontage block a body, and the old tenant doors stay open', () => {
  const post = districtRibbonPlan(world).posts[5];
  assert.equal(environment.isFree(post.position[0], -post.position[1]), false, 'a post is solid');
  for (const venue of contract.venues.filter(item => item.kind === 'bay')) {
    const frame = frontageFrame(venue), [disc] = venueSolids(venue, world);
    assert.equal(environment.isFree(disc[0], -disc[1]), false, `${venue.id} frontage is solid`);
    // Val, 2026-11-01: until decision 5 the retired tenants' doors stay usable.
    for (const id of venue.retire.tenants) {
      const store = world.stores.find(item => item.id === id), out = 0.9, at = [store.facade[0] + store.outward[0] * out, store.facade[1] + store.outward[1] * out];
      if (before.isFree(at[0], -at[1])) assert.equal(environment.isFree(at[0], -at[1]), true, `${venue.id}: ${store.name} door approach at ${at.map(v => v.toFixed(2))}`);
    }
    assert.ok(frame.x1 > frame.x0);
  }
});

test('the Ribbon walk from the spawn past the IPIC entrance is clear for the 1.01 m body', () => {
  const plan = districtRibbonPlan(world), half = CAMPUS_BODY.bodyHalfWidth, ipic = contract.venues.find(venue => venue.id === 'venue:starlight-screen').entrances[0].centre;
  // Walk each module's centreline, and the body's edges inside the walk, from the first module
  // to the one beside the IPIC entrance; walking.js holds the 0.35 m body radius.
  const offset = half - 0.35;
  let reached = false, checked = 0;
  for (const module of plan.modules) {
    const dir = [Math.cos(module.yaw), Math.sin(module.yaw)], n = [-dir[1], dir[0]], steps = Math.ceil(module.length / 0.2);
    for (let i = 0; i <= steps; i++) for (const side of [-offset, 0, offset]) {
      const t = i / steps, x = module.from[0] + (module.to[0] - module.from[0]) * t + n[0] * side, y = module.from[1] + (module.to[1] - module.from[1]) * t + n[1] * side;
      assert.equal(environment.isFree(x, -y), true, `${module.id} at ${x.toFixed(2)}, ${y.toFixed(2)} (side ${side.toFixed(2)})`);
      checked++;
    }
    const mid = [(module.from[0] + module.to[0]) / 2, (module.from[1] + module.to[1]) / 2];
    if (Math.hypot(mid[0] - ipic[0], mid[1] - ipic[1]) < 4) { reached = true; break; }
  }
  assert.ok(reached, 'the walk reaches the IPIC entrance');
  assert.ok(checked > 100);
});

test('classic and pink walk the same: collision does not read the finish', () => {
  // walking.js takes no finish; the solids are a function of the world alone.
  assert.equal(createWalkingEnvironment.length <= 4, true);
  const a = fiveRoomsFootprints(world), b = fiveRoomsFootprints(structuredClone(world));
  assert.deepEqual(b, a);
});
