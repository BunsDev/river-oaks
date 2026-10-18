import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createTown } from '../town.js';

// #420 through the real local service boundary: HTTP publication and drafts, the
// WebSocket town, two fixture clients and the protocol gate. Loopback fixture
// identities only: the first session is the owner, later ones are guests.
const pilot = JSON.parse(readFileSync(new URL('./fixtures/cafe-pilot-region.json', import.meta.url)));
const withoutCafe = () => { const region = structuredClone(pilot); delete region.buildings[0].interior.space; return region; };
const ROOM = 'venue-corner-cafe', LEVEL = 'corner-cafe/l0';

async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startTown(t) {
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const temporary = await mkdtemp(join(tmpdir(), 'river-oaks-cafe-420-'));
  const town = await createTown({ origin, env: { RIVER_OAKS_DEV_AUTH: 'local', RIVER_OAKS_ACCEPTANCE_FIXTURE: '1',
    MODERATION_FILE: join(temporary, 'moderation.json'), WAITLIST_FILE: join(temporary, 'waitlist.json') }, devAuth: 'local', staticRoot: null });
  await new Promise(resolve => town.server.listen(port, '127.0.0.1', resolve));
  const sockets = [];
  t.after(async () => { for (const socket of sockets) socket.terminate(); await town.close(); await rm(temporary, { recursive: true, force: true }); });
  const session = async () => {
    const response = await fetch(origin + '/auth/session');
    return { identity: await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  const post = (account, path, data = {}) => fetch(origin + path, { method: 'POST', headers: { Origin: origin, Cookie: account.cookie,
    'X-CSRF-Token': account.identity.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const worldData = async (account, id) => (await (await fetch(origin + `/api/world-data?world=${id}`, { headers: { Cookie: account.cookie } })).json());
  // Open one town socket; resolves with the socket and its first snapshot, or the refusal.
  const open = async (account, worldId, protocol) => {
    const ticketResponse = await post(account, `/api/multiplayer/ticket?world=${worldId}`);
    assert.equal(ticketResponse.status, 200);
    const access = await ticketResponse.json();
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?world=${worldId}&protocol=${protocol}&ticket=${access.ticket}`,
      { headers: { Origin: origin, Cookie: account.cookie } });
    sockets.push(socket);
    const snapshots = [];
    socket.on('message', raw => { const message = JSON.parse(raw); if (message.type === 'snapshot') snapshots.push(message); });
    let poll;
    const first = await new Promise(resolve => {
      socket.once('unexpected-response', (_, response) => resolve({ refused: response.statusCode }));
      socket.once('error', error => resolve({ refused: Number(/\d{3}/.exec(error.message)?.[0]) }));
      poll = setInterval(() => { if (snapshots.length) resolve({ snapshot: snapshots[0] }); }, 5);
    }).finally(() => clearInterval(poll));
    return { socket, access, snapshots, ...first, latest: () => snapshots.at(-1) };
  };
  const command = (socket, requestId, body) => new Promise((resolve, reject) => {
    const receive = raw => { const value = JSON.parse(raw); if (value.type === 'result' && value.requestId === requestId) { socket.off('message', receive); resolve(value); } };
    socket.on('message', receive); socket.once('error', reject); socket.send(JSON.stringify({ requestId, ...body }));
  });
  return { town, origin, session, post, worldData, open, command };
}

// Walk a straight line in small, timed poses, as a client does.
async function walk(command, socket, label, from, to, step = 0.3) {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]), steps = Math.ceil(distance / step);
  let result;
  for (let index = 1; index <= steps; index++) {
    const t = index / steps, position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 0];
    await wait(110);
    result = await command(socket, `${label}-${index}`, { type: 'pose', position, yaw: Math.PI, altitude: 0 });
    assert.equal(result.ok, true, `${label} step ${index}: ${result.error}`);
  }
  return result;
}

test('two clients see one approved Café, enter, walk, reconnect and leave; an older client is refused there only', async t => {
  const { post, session, worldData, open, command } = await startTown(t);
  const owner = await session(), guest = await session();
  const publish = (account, data) => post(account, '/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', ...data });
  assert.equal((await publish(guest, { region: pilot })).status, 403, 'a guest cannot publish');
  const forged = structuredClone(pilot); forged.buildings[0].interior.space.approved = true;
  assert.equal((await publish(owner, { region: forged })).status, 400, 'a client approval claim is not a field');
  const stale = structuredClone(pilot); stale.buildings[0].interior.space.sha256 = '0'.repeat(64);
  const staleResponse = await publish(owner, { region: stale });
  assert.equal(staleResponse.status, 409);
  assert.deepEqual(await staleResponse.json(), { error: 'approved_space_stale', detail: 'The approved space revision does not match the digest this region expects.' });
  const crowded = structuredClone(pilot); crowded.trees.push({ id: 'terrace-tree', position: [5, -14], height_m: 6, crown_radius_m: 2 });
  assert.deepEqual(await (await publish(owner, { region: crowded })).json(), { error: 'approved_space_neighbor', detail: "Corner Café's terrace floor would stand on a tree." });
  assert.equal((await publish(owner, { region: pilot })).status, 201);
  const duplicate = await publish(owner, { region: pilot });
  assert.equal(duplicate.status, 409); assert.equal((await duplicate.json()).error, 'world_exists');

  // Both clients receive the same server-resolved plan.
  const [ownerData, guestData] = [await worldData(owner, 'harbour-cafe'), await worldData(guest, 'harbour-cafe')];
  assert.equal(ownerData.regionSha256, guestData.regionSha256);
  assert.deepEqual(ownerData.world.buildingInteriors, guestData.world.buildingInteriors);
  const plan = ownerData.world.buildingInteriors.find(item => item.kind === 'approved-space');
  assert.equal(plan.source.documentSha256, pilot.buildings[0].interior.space.sha256);

  // An older client keeps every other world and is refused only here.
  const old = await open(guest, 'harbour-cafe', 3);
  assert.equal(old.access.protocolVersion, 4);
  assert.equal(old.refused, 426);
  const elsewhere = await open(guest, 'river-oaks', 3);
  assert.equal(elsewhere.snapshot.protocolVersion, 3);
  elsewhere.socket.close(); await wait(50);

  const ownerTown = await open(owner, 'harbour-cafe', 4), guestTown = await open(guest, 'harbour-cafe', 4);
  for (const joined of [ownerTown, guestTown]) {
    assert.equal(joined.snapshot.protocolVersion, 4);
    assert.equal(joined.snapshot.regionSha256, ownerData.regionSha256);
  }
  const entered = await command(guestTown.socket, 'enter', { type: 'travel', storeId: ROOM, mode: 'enter' });
  assert.equal(entered.ok, true); assert.equal(entered.player.levelId, LEVEL);
  assert.equal((await command(ownerTown.socket, 'owner-enter', { type: 'travel', storeId: ROOM, mode: 'enter' })).player.levelId, LEVEL);
  // Walk the reviewed route from the entry to seating, service and preparation.
  const [seating, service, preparation] = plan.routes.targets;
  let at = entered.player.position;
  for (const target of [seating, service, preparation]) {
    const result = await walk(command, guestTown.socket, target.id, at, target.position);
    assert.equal(result.player.levelId, LEVEL);
    at = result.player.position;
  }
  // The service counter is solid for the guest exactly as the plan says.
  const counter = plan.space.objects.find(item => item.id === 'service-counter-left');
  await wait(400);
  assert.equal((await command(guestTown.socket, 'into-counter', { type: 'pose', position: [counter.east, counter.north, 0], yaw: 0, altitude: 0 })).ok, false);
  await wait(200);
  const seen = ownerTown.latest().players.find(player => player.id === guest.identity.user.id);
  assert.equal(seen.levelId, LEVEL);
  assert.ok(Math.hypot(seen.position[0] - at[0], seen.position[1] - at[1]) < 0.05, 'the owner sees the guest where the server put them');

  // Reconnect inside the grace period: the guest is still on the Café floor.
  const closed = new Promise(resolve => guestTown.socket.once('close', resolve));
  guestTown.socket.close(); await closed;
  const again = await open(guest, 'harbour-cafe', 4);
  const back = again.snapshot.players.find(player => player.id === guest.identity.user.id);
  assert.equal(back.levelId, LEVEL);
  assert.ok(Math.hypot(back.position[0] - at[0], back.position[1] - at[1]) < 0.05);

  // Walk back to the doorway and leave by the door.
  await walk(command, again.socket, 'back', at, [0, -10.5]);
  const left = await command(again.socket, 'leave', { type: 'travel', storeId: ROOM, mode: 'leave' });
  assert.equal(left.ok, true); assert.equal(left.player.levelId, null);
  const terrace = plan.routes.targets.find(target => target.label === 'terrace');
  await wait(300);
  const outside = await walk(command, again.socket, 'terrace', left.player.position, plan.routes.arrival);
  const atTerrace = await walk(command, again.socket, 'terrace-stand', outside.player.position, terrace.position);
  assert.equal(atTerrace.player.levelId, null);
});

test('a failed activation keeps the live world; revision and rollback move occupants out and keep their data', async t => {
  const { town, post, session, worldData, open, command } = await startTown(t);
  const owner = await session(), guest = await session();
  const draft = (action, data) => post(owner, `/api/world-draft/${action}`, data);
  assert.equal((await post(owner, '/api/worlds', { id: 'harbour-cafe', title: 'Harbour Café', region: withoutCafe() })).status, 201);
  const plainData = await worldData(owner, 'harbour-cafe');
  assert.equal(plainData.world.buildingInteriors, undefined);

  // The owner's creation outdoors, a second one to delete later, and a guest in the old restaurant room.
  const ownerTown = await open(owner, 'harbour-cafe', 3);
  assert.equal(ownerTown.snapshot.protocolVersion, 3);
  assert.equal((await command(ownerTown.socket, 'to-corner', { type: 'travel', placeId: 'west-corner' })).ok, true);
  const kept = await command(ownerTown.socket, 'keep', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [-40, -37.5], yaw: 0 });
  assert.equal(kept.ok, true, kept.error);
  const removed = await command(ownerTown.socket, 'later', { type: 'build', action: 'place', kind: 'seat', finish: 'rose', position: [-38, -38.5], yaw: 0 });
  assert.equal(removed.ok, true, removed.error);
  const guestTown = await open(guest, 'harbour-cafe', 3);
  assert.equal((await command(guestTown.socket, 'in', { type: 'travel', storeId: ROOM, mode: 'enter' })).ok, true);

  const load = async () => (await (await draft('load', { id: 'harbour-cafe' })).json());
  let editable = await load();
  assert.equal((await draft('save', { id: 'harbour-cafe', baseRegionSha256: editable.world.regionSha256, expectedDraftVersion: 0, region: pilot })).status, 200);

  // Storage fails at the final state change: nothing changes and nobody is moved.
  const applyRevision = town.catalog.applyRevision.bind(town.catalog);
  town.catalog.applyRevision = async () => { throw new Error('synthetic storage failure'); };
  const failed = await draft('apply', { id: 'harbour-cafe', expectedDraftVersion: 1 });
  assert.equal(failed.status, 400);
  assert.equal((await failed.json()).error, 'Request could not be completed.');
  town.catalog.applyRevision = applyRevision;
  assert.equal((await worldData(owner, 'harbour-cafe')).regionSha256, plainData.regionSha256);
  await wait(100);
  assert.equal(guestTown.socket.readyState, WebSocket.OPEN);
  assert.equal(guestTown.latest().players.find(player => player.id === guest.identity.user.id).levelId, null);

  // A different account cannot place the Café into this owner's world.
  assert.equal((await town.catalog.revisionCandidate('harbour-cafe', 1, guest.identity.user.id)).reason, 'not_owner');

  // The Café is placed: occupants are disconnected explicitly, never moved under new collision.
  const guestClosed = new Promise(resolve => guestTown.socket.once('close', code => resolve(code)));
  const applied = await draft('apply', { id: 'harbour-cafe', expectedDraftVersion: 1 });
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).disconnectedPlayers, 2);
  assert.equal(await guestClosed, 4000);
  const duplicate = await draft('apply', { id: 'harbour-cafe', expectedDraftVersion: 1 });
  assert.equal(duplicate.status, 409, 'a repeated apply changes nothing');
  const cafeData = await worldData(owner, 'harbour-cafe');
  assert.ok(cafeData.world.buildingInteriors.some(item => item.kind === 'approved-space'));
  const guestCafe = await open(guest, 'harbour-cafe', 4);
  assert.equal(guestCafe.snapshot.protocolVersion, 4);
  const rejoined = guestCafe.snapshot.players.find(player => player.id === guest.identity.user.id);
  assert.equal(rejoined.levelId, null, 'the guest starts outside, not inside the replaced room');
  assert.deepEqual(guestCafe.snapshot.builds.map(item => item.id).sort(), [kept.item.id, removed.item.id].sort(), 'creations are carried forward');

  // A deletion made after the old version stays deleted when that version is restored.
  const ownerCafe = await open(owner, 'harbour-cafe', 4);
  await wait(1100); // the town's one-second travel cooldown survives the revision with each ledger
  const corner = await command(ownerCafe.socket, 'to-corner-2', { type: 'travel', placeId: 'west-corner' });
  assert.equal(corner.ok, true, corner.error);
  assert.equal((await command(ownerCafe.socket, 'remove', { type: 'build', action: 'remove', id: removed.item.id })).ok, true);
  assert.equal((await command(guestCafe.socket, 'in-cafe', { type: 'travel', storeId: ROOM, mode: 'enter' })).player.levelId, LEVEL);
  const history = await (await draft('history', { id: 'harbour-cafe' })).json();
  assert.deepEqual(history.versions.map(version => version.revision), [1]);
  const plainVersion = await (await draft('version', { id: 'harbour-cafe', revision: 1, baseRegionSha256: history.world.regionSha256 })).json();
  assert.equal(plainVersion.region.buildings[0].interior.space, undefined);
  assert.equal((await draft('save', { id: 'harbour-cafe', baseRegionSha256: history.world.regionSha256, expectedDraftVersion: 0, region: plainVersion.region })).status, 200);
  const cafeClosed = new Promise(resolve => guestCafe.socket.once('close', code => resolve(code)));
  const rolledBack = await draft('apply', { id: 'harbour-cafe', expectedDraftVersion: 1 });
  assert.equal(rolledBack.status, 200);
  assert.equal(await cafeClosed, 4000, 'the guest on the Café floor is disconnected, not left inside new collision');
  const restored = await worldData(owner, 'harbour-cafe');
  assert.equal(restored.world.buildingInteriors, undefined);
  const guestPlain = await open(guest, 'harbour-cafe', 3);
  assert.equal(guestPlain.snapshot.players.find(player => player.id === guest.identity.user.id).levelId, null);
  assert.deepEqual(guestPlain.snapshot.builds.map(item => item.id), [kept.item.id], 'the deleted creation does not return');

  // Revocation lands while the Café revision is being prepared: the plain world stays live.
  editable = await load();
  const cafeVersion = await (await draft('version', { id: 'harbour-cafe', revision: 2, baseRegionSha256: editable.world.regionSha256 })).json();
  assert.equal((await draft('save', { id: 'harbour-cafe', baseRegionSha256: editable.world.regionSha256, expectedDraftVersion: 0, region: cafeVersion.region })).status, 200);
  const revisionCandidate = town.catalog.revisionCandidate.bind(town.catalog);
  town.catalog.revisionCandidate = async (...args) => {
    const candidate = await revisionCandidate(...args);
    assert.equal((await town.catalog.revokeApprovedSpace('corner-cafe@1')).ok, true);
    return candidate;
  };
  const revoked = await draft('apply', { id: 'harbour-cafe', expectedDraftVersion: 1 });
  town.catalog.revisionCandidate = revisionCandidate;
  assert.equal(revoked.status, 409);
  assert.equal((await revoked.json()).error, 'approved_space_revoked');
  assert.equal((await worldData(owner, 'harbour-cafe')).regionSha256, restored.regionSha256);
  await wait(100);
  assert.equal(guestPlain.socket.readyState, WebSocket.OPEN);
  // The fence holds for new worlds too.
  const blocked = await post(owner, '/api/worlds', { id: 'second-cafe', title: 'Second Café', region: pilot });
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).error, 'approved_space_revoked');
});
