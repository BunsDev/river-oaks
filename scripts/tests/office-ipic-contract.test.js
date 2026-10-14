import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readPacket, validateLayoutContract, validateCameraManifest, fileExistsUnder, LAYOUT_VERSION } from '../office-ipic-contract.mjs';
import { OFFICE_ROOM, OFFICE_SPAWN, OFFICE_SPEED } from '../../preview/src/office-contract.js';
import { ARRIVAL } from '../../preview/src/office-arrival-model.js';
import { AVATAR_ENVELOPE, findRoute, bodyClearance } from '../../preview/src/workplace-room.js';
import { IPIC_FLIGHTS, IPIC_CAMERAS, ipicSeatSites } from '../../preview/src/ipic-plan.js';
import { storeRoomsFor } from '../../preview/src/store-rooms.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const world = JSON.parse(readFileSync(join(root, 'preview/public/data/district.json'), 'utf8'));
const ipicRoom = storeRoomsFor(world).find(room => room.interior === 'ipic-photo-v1');
const live = { officeRoom: OFFICE_ROOM, officeSpawn: OFFICE_SPAWN, officeSpeed: OFFICE_SPEED, arrival: ARRIVAL, envelope: AVATAR_ENVELOPE,
  ipicFlights: IPIC_FLIGHTS, ipicCameras: IPIC_CAMERAS, ipicRoom, ipicSeatIds: ipicSeatSites([ipicRoom]).map(seat => seat.id) };
const clone = value => structuredClone(value);
const packet = readPacket(root);

test('the committed packet validates against the live office and IPIC plans', () => {
  assert.equal(packet.layout.layoutVersion, LAYOUT_VERSION);
  assert.deepEqual(validateLayoutContract(packet.layout, { live }), []);
  assert.deepEqual(validateCameraManifest(packet.cameras, packet.layout, { fileExists: fileExistsUnder(root), live }), []);
  assert.ok(ipicRoom, 'the IPIC room exists in the mapped district');
});

test('observed office routes are walkable for the largest turning body while other stations are occupied', () => {
  const office = packet.layout.places.find(place => place.id === 'office-current');
  const anchor = id => office.anchors.find(a => a.id === id).position;
  const stationOf = id => OFFICE_ROOM.stations.find(station => id.startsWith(`${station.id}-`));
  const seat = station => [...station.seat, AVATAR_ENVELOPE.seatedRadius];
  for (const route of office.routes.filter(r => r.kind === 'walk' && r.required)) {
    const own = stationOf(route.from) ?? stationOf(route.to);
    // Walking to a station means the others are occupied; any other walk must survive every occupancy.
    const cases = own ? [OFFICE_ROOM.stations.filter(station => station !== own)] : [...OFFICE_ROOM.stations.map(station => [station]), OFFICE_ROOM.stations];
    for (const occupants of cases) {
      const found = findRoute(OFFICE_ROOM, anchor(route.from), anchor(route.to), { radius: bodyClearance(OFFICE_ROOM), blockers: occupants.map(seat) });
      assert.ok(found, `${route.from} -> ${route.to} with ${occupants.map(s => s.id).join('+') || 'nobody'} seated`);
    }
  }
});

test('stale versions, bad axes and short revisions fail closed', () => {
  const stale = clone(packet.layout); stale.layoutVersion = 'office-ipic-baseline-0';
  assert.match(validateLayoutContract(stale).join('\n'), /stale layoutVersion/);
  const future = clone(packet.layout); future.schemaVersion = 2;
  assert.match(validateLayoutContract(future).join('\n'), /unknown schemaVersion/);
  const axes = clone(packet.layout); axes.axes.three = '[x, d, h]';
  assert.match(validateLayoutContract(axes).join('\n'), /invalid axes/);
  const revision = clone(packet.layout); revision.sourceRevision = '489a60e4';
  assert.match(validateLayoutContract(revision).join('\n'), /sourceRevision/);
  const cameras = clone(packet.cameras); cameras.layoutVersion = 'office-ipic-baseline-2';
  assert.match(validateCameraManifest(cameras, packet.layout).join('\n'), /stale layoutVersion/);
});

test('duplicate ids and disconnected required routes are rejected', () => {
  const duplicate = clone(packet.layout);
  const ipic = duplicate.places.find(place => place.id === 'ipic');
  ipic.anchors.push({ ...ipic.anchors[1] });
  assert.match(validateLayoutContract(duplicate).join('\n'), /duplicate anchor reception-desk/);
  const disconnected = clone(packet.layout);
  const office = disconnected.places.find(place => place.id === 'office-current');
  office.routes = office.routes.filter(route => route.to !== 'review-socket');
  assert.match(validateLayoutContract(disconnected).join('\n'), /review-socket is disconnected from spawn/);
  const island = clone(packet.layout);
  island.places[0].routes.find(route => route.from === 'spawn' && route.to === 'review-socket').required = false;
  island.places[0].routes.find(route => route.from === 'station-1-approach' && route.to === 'review-socket').required = false;
  island.places[0].routes.find(route => route.from === 'station-2-approach' && route.to === 'review-socket').required = false;
  island.places[0].routes.push({ from: 'entrance', to: 'outside', kind: 'walk', required: true });
  assert.match(validateLayoutContract(island).join('\n'), /required route entrance -> outside is disconnected from spawn by required routes/);
  const unknown = clone(packet.layout);
  unknown.places[0].routes.push({ from: 'spawn', to: 'nowhere', kind: 'walk', required: true });
  assert.match(validateLayoutContract(unknown).join('\n'), /unknown anchor/);
  const duplicatePlace = clone(packet.layout); duplicatePlace.places.push(clone(duplicatePlace.places[0]));
  assert.match(validateLayoutContract(duplicatePlace).join('\n'), /duplicate place/);
});

test('observed numbers cannot drift from the live plan modules', () => {
  const drifted = clone(packet.layout);
  const office = drifted.places.find(place => place.id === 'office-current');
  office.bounds.width = 30;
  office.anchors.find(a => a.id === 'station-1-seat').position = [-3, 2.2];
  const problems = validateLayoutContract(drifted, { live }).join('\n');
  assert.match(problems, /width 30 differs from the live plan 9/);
  assert.match(problems, /anchor station-1-seat .* differs from the live/);
  const flights = clone(packet.layout);
  flights.places.find(place => place.id === 'ipic').flights[1].base = 2.5;
  assert.match(validateLayoutContract(flights, { live }).join('\n'), /flight 1 differs from IPIC_FLIGHTS/);
  const seat = clone(packet.layout);
  seat.places.find(place => place.id === 'ipic').anchors.find(a => a.id === 'recliner-1-3').seatId = 'bench:ipic-recliner-9-9:0';
  assert.match(validateLayoutContract(seat, { live }).join('\n'), /unknown seat bench:ipic-recliner-9-9:0/);
  const envelope = clone(packet.layout); envelope.avatarEnvelope.turningRadius = 0.5;
  assert.match(validateLayoutContract(envelope, { live }).join('\n'), /turningRadius 0.5 differs/);
});

test('cameras must resolve their place, photos, runners and reused IPIC views', () => {
  const missingPhoto = clone(packet.cameras);
  missingPhoto.cameras.find(c => c.id === 'T1').photo = 'assets/ipic/references/IMG_0000.jpg';
  const problems = validateCameraManifest(missingPhoto, packet.layout, { fileExists: fileExistsUnder(root), live }).join('\n');
  assert.match(problems, /photo assets\/ipic\/references\/IMG_0000.jpg does not resolve/);
  assert.match(problems, /photo differs from IPIC_CAMERAS\[reception\]/);
  const movedView = clone(packet.cameras);
  movedView.cameras.find(c => c.id === 'T3').eye = [0, 7.65, 27.3];
  assert.match(validateCameraManifest(movedView, packet.layout, { live }).join('\n'), /eye\/target differ from IPIC_CAMERAS\[auditorium\]/);
  const wrongPlace = clone(packet.cameras);
  wrongPlace.cameras.find(c => c.id === 'O1').place = 'office-penthouse-proposed';
  assert.match(validateCameraManifest(wrongPlace, packet.layout).join('\n'), /observed camera on a proposed place/);
  const noRunner = clone(packet.cameras);
  delete noRunner.cameras.find(c => c.id === 'O2').runner;
  assert.match(validateCameraManifest(noRunner, packet.layout).join('\n'), /needs a runner/);
  const unresolvedReceipt = clone(packet.cameras);
  unresolvedReceipt.cameras.find(c => c.id === 'O3').receipt = 'data/reports/missing.json';
  assert.match(validateCameraManifest(unresolvedReceipt, packet.layout, { fileExists: fileExistsUnder(root) }).join('\n'), /receipt data\/reports\/missing.json does not resolve/);
  const duplicate = clone(packet.cameras); duplicate.cameras.push({ ...duplicate.cameras[0] });
  assert.match(validateCameraManifest(duplicate, packet.layout).join('\n'), /duplicate camera O1/);
});

test('an unfit proposal must hand its resolution to a named owner', () => {
  const fit = clone(packet.layout);
  const penthouse = fit.places.find(place => place.id === 'office-penthouse-proposed');
  assert.equal(penthouse.fit.volumeFitsAtCurrentFloor, false);
  assert.ok(penthouse.fit.topOfProposedVolume > penthouse.fit.buildingHeightEstimate);
  penthouse.fit.resolution = 'none';
  assert.match(validateLayoutContract(fit).join('\n'), /must name its resolution/);
});
