import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APPROVED_SPACES, approvedSpaceRecord, validApprovedSpaceDeclaration } from '../src/approved-spaces.js';
import { CURRENT_SPACE_ASSETS } from '../src/approved-space-plan.js';
import { buildApprovedSpaceInterior } from '../src/approved-space-interior.js';
import { storeRoomsFor } from '../src/store-rooms.js';
import { canCullExterior } from '../src/interior-exterior-culling.js';
import { worldProtocolVersion, supportsWorldProtocol, acceptsWorldProtocol } from '../src/world-contract.js';
import { compileRegionPackage } from '../../server/region-package.js';

// #420: the client side of an approved furnished space.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const pilot = JSON.parse(readFileSync(new URL('../../server/tests/fixtures/cafe-pilot-region.json', import.meta.url)));
const compiled = () => compileRegionPackage(pilot, 'Harbour Café', { worldId: 'harbour-cafe' });

test('each approved record is immutable, matches its reviewed digest, and pins the assets that draw it', () => {
  for (const record of APPROVED_SPACES) {
    assert.ok(Object.isFrozen(record) && Object.isFrozen(record.space.objects[0]));
    assert.equal(sha256(JSON.stringify(record.space)), record.documentSha256, `${record.id}@${record.revision}`);
    for (const file of record.assets.files) assert.equal(sha256(readFileSync(new URL(`../../${file.path}`, import.meta.url))), file.sha256,
      `${file.path} changed after ${record.id}@${record.revision} was reviewed: review the new appearance, record the next revision and update CURRENT_SPACE_ASSETS`);
    assert.equal(sha256(JSON.stringify(record.assets.files)), record.assets.sha256);
    assert.equal(record.approval.by, 'Val');
  }
  assert.deepEqual({ id: APPROVED_SPACES[0].assets.id, sha256: APPROVED_SPACES[0].assets.sha256 }, { ...CURRENT_SPACE_ASSETS });
  assert.equal(approvedSpaceRecord('corner-cafe', 1), APPROVED_SPACES[0]);
  assert.equal(approvedSpaceRecord('corner-cafe', 2), null);
  const declaration = { id: 'corner-cafe', revision: 1, sha256: APPROVED_SPACES[0].documentSha256 };
  assert.equal(validApprovedSpaceDeclaration(declaration), true);
  for (const forged of [{ ...declaration, approved: true }, { id: 'corner-cafe', revision: 1 }, { ...declaration, revision: 1.5 }, { ...declaration, sha256: 'CAFE' }])
    assert.equal(validApprovedSpaceDeclaration(forged), false);
});

test('a client draws the plan it was sent: indoor detail, an outdoor terrace and pooled lamps', () => {
  const world = compiled(), room = storeRoomsFor(world).find(item => item.approvedSpace);
  const plan = room.approvedSpace;
  const indoor = buildApprovedSpaceInterior(room, { part: 'indoor' }), outdoor = buildApprovedSpaceInterior(room, { part: 'outdoor' });
  const ids = group => { const found = []; group.traverse(node => { if (node.userData.studioId) found.push(node.userData.studioId); }); return found.sort(); };
  assert.deepEqual(ids(indoor), plan.space.objects.filter(item => !item.outdoor).map(item => item.id).sort());
  assert.deepEqual(ids(outdoor), plan.space.objects.filter(item => item.outdoor).map(item => item.id).sort());
  for (const group of [indoor, outdoor]) {
    let lights = 0, environment = 0;
    group.traverse(node => { if (node.isLight) lights++; if (node.name === '@environment' || node.name === 'Arrival') environment++; });
    assert.equal(lights, 0, 'no editor lights in town');
    assert.equal(environment, 0, 'no editor ground or arrival marker in town');
  }
  // Pendants become pooled light positions at their placed height, inside the room.
  assert.equal(indoor.userData.lightPositions.length, 2);
  for (const { position } of indoor.userData.lightPositions) {
    assert.ok(room.contains(position.x, -position.z));
    assert.ok(position.y > 1.5 && position.y < plan.levels[0].clearHeight);
  }
  // Each placed form sits where the plan says, in world metres.
  const counter = plan.space.objects.find(item => item.id === 'service-counter-left');
  let node; indoor.traverse(item => { if (item.userData.studioId === counter.id) node = item; });
  assert.deepEqual([node.position.x, node.position.z, node.scale.x], [counter.east, -counter.north, counter.width]);
  // The terrace stands on the drawn plaza paving; the café floor stays on the doorway datum.
  assert.equal(indoor.position.y, plan.levels[0].floorElevation);
  assert.ok(Math.abs(outdoor.position.y - plan.levels[0].floorElevation - 0.175) < 1e-9, 'the paving plus a 5 mm lift');
  indoor.userData.dispose(); outdoor.userData.dispose();
  assert.equal(indoor.children.length, 0);
});

test('a plan this client does not implement fails closed with a refresh message', () => {
  const world = compiled();
  const future = { ...world, buildingInteriors: world.buildingInteriors.map(plan => ({ ...plan, adapterVersion: 2 })) };
  assert.throws(() => storeRoomsFor(future), /newer version of River Oaks/);
  const unknown = { ...world, buildingInteriors: world.buildingInteriors.map(plan => ({ ...plan, kind: 'uploaded-mesh' })) };
  assert.throws(() => storeRoomsFor(unknown), /newer version of River Oaks/);
});

test('protocol 4 is asked for only by worlds that place an approved space', () => {
  const world = compiled();
  assert.equal(worldProtocolVersion(world), 4);
  assert.equal(worldProtocolVersion({ ...world, buildingInteriors: [] }), 3);
  assert.equal(worldProtocolVersion(null), 3);
  assert.deepEqual([2, 3, 4, 5].map(supportsWorldProtocol), [false, true, true, false]);
  assert.equal(acceptsWorldProtocol('3', 4), false);
  assert.equal(acceptsWorldProtocol('4', 4), true);
  assert.equal(acceptsWorldProtocol('3', 3), true);
  assert.equal(acceptsWorldProtocol('5', 3), false);
  assert.equal(acceptsWorldProtocol('4.0', 3), false);
  assert.equal(acceptsWorldProtocol(null, 3), false);
});

test('the street stays drawn from inside an approved space, which is glazed on more than its frontage', () => {
  const world = compiled(), room = storeRoomsFor(world).find(item => item.approvedSpace);
  const inside = room.toWorld(0, 6);
  const camera = { position: { x: inside[0], y: room.floor + 1.68, z: -inside[1] } };
  assert.equal(canCullExterior(camera, room), false);
});
