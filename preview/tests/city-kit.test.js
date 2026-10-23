import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIT_CONVENTIONS, KIT_MATERIALS, KIT_PIECES, KIT_STYLES } from '../../shared/city-kit/catalog.js';
import { assembleNeighborhood, canonicalJSON, insideRect, placePlan, walkableConnectivity } from '../../shared/city-kit/assemble.js';
import { buildCityKit } from '../src/city-kit/render.js';

const read = name => JSON.parse(readFileSync(new URL(`../../config/destinations/${name}.json`, import.meta.url)));
const commons = read('bayou-market-commons'), yale = read('nineteenth-and-yale');
// The Commons street starts at the approved promenade, which its own recipe does not repeat.
const commonsEntry = { entry: [0, 0], extraSurfaces: [{ rect: [-3, -3, 82, 3] }] };
const piecesOf = (plan, prefix) => plan.pieces.filter(piece => piece.id.startsWith(prefix));

test('kit pieces, styles and materials are complete and consistent', () => {
  for (const [name, piece] of Object.entries(KIT_PIECES)) {
    assert.match(name, /^[a-z]+\/[a-z-]+$/);
    assert.ok(['street', 'building', 'facade', 'roof', 'landscape', 'furniture', 'landmark'].includes(piece.family), name);
    assert.ok(['surface', 'solid', 'shell', 'none'].includes(piece.collision), name);
    assert.ok(Number.isFinite(piece.triangles), name);
    if (piece.material) assert.ok(KIT_MATERIALS[piece.material], `${name} material`);
  }
  for (const [name, style] of Object.entries(KIT_STYLES)) {
    for (const material of [...style.wall, style.trim, style.accent, ...style.awnings]) assert.ok(KIT_MATERIALS[material], `${name}: ${material}`);
    for (const variant of style.storefronts) assert.ok(KIT_PIECES['facade/storefront'].variants.includes(variant), `${name}: ${variant}`);
    for (const roof of style.roofs) assert.ok(KIT_PIECES[`roof/${roof}`], `${name}: ${roof}`);
  }
  assert.ok(KIT_CONVENTIONS.licensing.includes('Original'));
});

test('assembly is reproducible byte for byte and independent of recipe key order', () => {
  const a = assembleNeighborhood(commons), b = assembleNeighborhood(structuredClone(commons));
  assert.equal(canonicalJSON(a), canonicalJSON(b));
  const reordered = Object.fromEntries(Object.entries(commons).reverse());
  assert.equal(assembleNeighborhood(reordered).hash, a.hash);
  // Committed locks are the regeneration contract (scripts/destination.mjs check).
  for (const [recipe, name] of [[commons, 'bayou-market-commons'], [yale, 'nineteenth-and-yale']])
    assert.equal(assembleNeighborhood(recipe).hash, read(`${name}.lock`).hash, `${name} lock`);
});

test('a seed varies only what the recipe leaves open', () => {
  const base = assembleNeighborhood(commons), other = assembleNeighborhood(commons, { seed: 7 });
  assert.notEqual(base.hash, other.hash);
  const shells = plan => piecesOf(plan, 'bayou-market-commons/market-row/').filter(piece => piece.piece === 'building/shell').map(piece => [piece.rect, piece.storeys, piece.wall]);
  assert.notDeepEqual(shells(base), shells(other));
  // Authored streets, court, landmark and lanterns never move with the seed.
  for (const plan of [base, other, assembleNeighborhood(commons, { seed: 99 })]) {
    assert.deepEqual(plan.lanterns, base.lanterns);
    assert.deepEqual(plan.surfaces, base.surfaces);
    assert.deepEqual(piecesOf(plan, 'bayou-market-commons/bayou-lantern-tower'), piecesOf(base, 'bayou-market-commons/bayou-lantern-tower'));
  }
  // Streams are per stable ID: re-rhythming one block leaves the other's pieces unchanged.
  const changed = structuredClone(commons); changed.blocks[1].bays = [6, 7.5]; changed.blocks[1].storeys = [2, 3];
  const regenerated = assembleNeighborhood(changed);
  assert.notDeepEqual(piecesOf(regenerated, 'bayou-market-commons/garden-court/'), piecesOf(base, 'bayou-market-commons/garden-court/'));
  assert.deepEqual(piecesOf(regenerated, 'bayou-market-commons/market-row/'), piecesOf(base, 'bayou-market-commons/market-row/'));
});

test('manual overrides and additions survive regeneration and are never silently dropped', () => {
  const plan = assembleNeighborhood(commons), corner = plan.pieces.find(piece => piece.id === 'bayou-market-commons/market-row/parcel-0');
  assert.equal(corner.sign, 'Teal Door Books'); assert.equal(corner.storeys, 3); assert.equal(corner.height, 4.6 + 2 * 3.5); assert.equal(corner.override, 'edited');
  // A suppressed tree takes its pit and its collision solid with it.
  assert.ok(!plan.pieces.some(piece => piece.id.startsWith('bayou-market-commons/market-street/tree-s-0')));
  assert.ok(!plan.solids.some(solid => solid.id === 'bayou-market-commons/market-street/tree-s-0'));
  assert.ok(plan.solids.some(solid => solid.id === 'bayou-market-commons/manual/bike-rack-0'));
  // A pinned shop name leaves the generator's pool: no other shop repeats it.
  const signs = plan.pieces.filter(piece => piece.sign).map(piece => piece.sign);
  assert.equal(new Set(signs).size, signs.length);
  for (let seed = 0; seed < 24; seed++) {
    const regenerated = assembleNeighborhood(commons, { seed }), { applied, orphaned, added } = regenerated.provenance.overrides;
    assert.deepEqual([...applied, ...orphaned].sort(), Object.keys(commons.overrides).sort(), `seed ${seed}`);
    assert.deepEqual(added, ['bayou-market-commons/manual/bike-rack-0']);
    for (const id of applied) assert.ok(regenerated.pieces.find(piece => piece.id === id)?.override ?? !regenerated.pieces.some(piece => piece.id === id));
  }
  // The recipe stores intent; regeneration never rewrites it.
  assert.deepEqual(read('bayou-market-commons').overrides, commons.overrides);
});

test('invalid recipes and overrides fail with a reason instead of producing a broken plan', () => {
  const bad = [
    [recipe => { recipe.overrides['bayou-market-commons/market-row/parcel-0'] = { set: { glass: 'mirror' } }; }, /cannot set glass/],
    [recipe => { recipe.overrides['elsewhere/piece'] = { suppress: true }; }, /stable piece ID/],
    [recipe => { recipe.additions.push({ id: 'bench-in-shop', piece: 'furniture/bench', at: [20, 12] }); }, /not inside walkable ground/],
    [recipe => { recipe.blocks[0].style = 'brutalist'; }, /style/],
    [recipe => { recipe.streets[0].to = [47, 5]; }, /must run east/],
    [recipe => { recipe.kit = 'city-kit-0'; }, /kit must be/],
    [recipe => { recipe.furniture.push({ ...recipe.furniture[0] }); }, /item id/],
  ];
  for (const [mutate, message] of bad) { const recipe = structuredClone(commons); mutate(recipe); assert.throws(() => assembleNeighborhood(recipe), message); }
});

test('every seed yields fully connected walkable ground with every lantern and court reachable', () => {
  for (let seed = 0; seed < 16; seed++) {
    const plan = assembleNeighborhood(commons, { seed }), reach = walkableConnectivity(plan, commonsEntry);
    assert.equal(reach.reached, reach.total, `seed ${seed}: dead-end pockets`);
    for (const lantern of plan.lanterns) assert.ok([[-1, 0], [1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.reachable([lantern.at[0] + dx, lantern.at[1] + dy])), `${seed}: ${lantern.id}`);
    // No solid stands in a shop: every one sits inside walkable ground.
    for (const solid of plan.solids) assert.ok(plan.surfaces.some(surface => insideRect(surface.rect, solid.rect[0], solid.rect[1]) && insideRect(surface.rect, solid.rect[2], solid.rect[3])), solid.id);
    const yalePlan = assembleNeighborhood(yale, { seed }), yaleReach = walkableConnectivity(yalePlan, { entry: [1, 64] });
    assert.equal(yaleReach.reached, yaleReach.total, `yale seed ${seed}`);
  }
});

test('the two Commons blocks are distinct assemblies of the same kit', () => {
  const plan = assembleNeighborhood(commons), shells = id => piecesOf(plan, `bayou-market-commons/${id}/`).filter(piece => piece.piece === 'building/shell' && !piece.id.endsWith('/rear'));
  const market = shells('market-row'), court = shells('garden-court');
  assert.ok(market.length >= 4 && court.length >= 4);
  assert.ok(market.every(piece => piece.style === 'market-row') && court.every(piece => piece.style === 'garden-court'));
  assert.equal(new Set([...market, ...court].map(piece => piece.wall)).size >= 3, true);
  assert.ok(court.some(piece => piece.variant === 'loggia') && market.some(piece => ['canopy', 'awning'].includes(piece.variant)));
  assert.ok(plan.surfaces.some(surface => surface.id === 'bayou-market-commons/garden-court/court'));
  // Every primary frontage faces the street it lines.
  assert.ok(market.every(piece => piece.faces[0] === 'south') && court.every(piece => piece.faces[0] === 'north'));
});

test('a second neighborhood reuses the kit with an intersection and an east-facing court', () => {
  const plan = assembleNeighborhood(yale);
  const kinds = new Set(plan.pieces.map(piece => piece.piece));
  for (const kind of ['street/intersection', 'street/crosswalk', 'building/shell', 'landscape/street-tree', 'furniture/lamp']) assert.ok(kinds.has(kind), kind);
  assert.equal(plan.pieces.filter(piece => piece.piece === 'street/crosswalk').length, 4);
  // Clipped paving never overlaps the crossing.
  const box = plan.pieces.find(piece => piece.id.endsWith('/centre')).rect;
  for (const piece of plan.pieces.filter(item => ['street/shared-lane', 'street/sidewalk'].includes(item.piece) && !item.id.includes('-x-')))
    assert.ok(piece.rect[2] <= box[0] - 3 || piece.rect[0] >= box[2] + 3 || piece.rect[3] <= box[1] - 3 || piece.rect[1] >= box[3] + 3 || !(piece.rect[0] < box[2] && piece.rect[2] > box[0] && piece.rect[1] < box[3] && piece.rect[3] > box[1]), piece.id);
  const court = plan.pieces.filter(piece => piece.id.startsWith('nineteenth-and-yale/southeast-court/') && piece.piece === 'building/shell' && !piece.id.endsWith('/rear'));
  assert.ok(court.length && court.every(piece => piece.faces[0] === 'west'));
  assert.ok(plan.pieces.some(piece => piece.style === 'heights-row' && piece.roof === 'sawtooth'));
  const signs = plan.pieces.filter(piece => piece.sign).map(piece => piece.sign);
  assert.equal(new Set(signs).size, signs.length, 'no repeated shop names');
  // Same kit, different place: no shared building footprint or style mix with the Commons.
  assert.notEqual(plan.hash, assembleNeighborhood(commons).hash);
});

test('plans stay inside the kit budgets and translate exactly to world coordinates', () => {
  for (const recipe of [commons, yale]) {
    const plan = assembleNeighborhood(recipe), budgets = KIT_CONVENTIONS.budgets;
    assert.ok(plan.stats.triangles <= budgets.trianglesPerNeighborhood, `${recipe.id} triangles ${plan.stats.triangles}`);
    assert.ok(plan.stats.solids <= budgets.solidsPerNeighborhood && plan.stats.materials <= budgets.materialsPerNeighborhood);
  }
  const plan = assembleNeighborhood(commons), placed = placePlan(plan, [-2666.336078522973, -1335]);
  assert.deepEqual(placed.lanterns[0].at, [Math.round((-2666.336078522973 + plan.lanterns[0].at[0]) * 1000) / 1000, -1335 + plan.lanterns[0].at[1]]);
  assert.equal(placed.hash, plan.hash);
});

test('the renderer batches by material, culls detail by distance and disposes everything it made', async () => {
  const THREE = await import('three');
  const plan = assembleNeighborhood(commons), kit = buildCityKit(plan, { groundAt: () => 0, ground: 0 });
  const geometries = new Set(), materials = new Set();
  // Sprites share Three's one sprite geometry, which is never ours to dispose.
  kit.traverse(item => { if (item.isMesh) geometries.add(item.geometry); if (item.isMesh || item.isSprite) materials.add(item.material); });
  const meshes = []; kit.traverse(item => { if (item.isMesh) meshes.push(item); });
  assert.ok(meshes.length <= KIT_CONVENTIONS.budgets.drawCallsPerNeighborhood, `draw calls ${meshes.length}`);
  assert.equal(kit.userData.lanterns.size, 5);
  assert.ok(kit.userData.tower);
  assert.equal(kit.children.find(child => child.name.endsWith('trees')).userData.placements, plan.pieces.filter(piece => piece.piece === 'landscape/street-tree').length + 12, 'street trees plus the far bank of the bayou');
  // Detail batches hide from far away and return up close.
  const details = kit.children.filter(child => child.name.endsWith(' detail'));
  kit.userData.update(new THREE.Vector3(5000, 0, 5000)); assert.ok(details.every(group => !group.visible));
  kit.userData.update(new THREE.Vector3(20, 2, 0)); assert.ok(details.some(group => group.visible));
  // Lantern state is driven by the shared snapshot.
  const first = plan.lanterns[0].id;
  kit.userData.setLanterns(new Set([first]), false);
  assert.ok(kit.userData.lanterns.get(first).children.some(item => item.material?.emissiveIntensity > 0));
  let disposedGeometries = 0, disposedMaterials = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => disposedGeometries++);
  for (const material of materials) material.addEventListener('dispose', () => disposedMaterials++);
  kit.userData.dispose(); kit.userData.dispose();
  assert.equal(disposedGeometries, geometries.size); assert.equal(disposedMaterials, materials.size); assert.equal(kit.children.length, 0);
});
