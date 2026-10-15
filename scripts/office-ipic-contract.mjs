// Validates the Office + IPIC packet (#360): docs/design/office-ipic/layout-contract.json and
// camera-manifest.json. The JSON is a review contract, not a second geometry truth: when the
// live plan modules are passed in, every "observed" number is checked against them, so the
// packet cannot drift from preview/src/office-contract.js and preview/src/ipic-plan.js.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const LAYOUT_VERSION = 'office-ipic-baseline-1';
export const PACKET_DIR = 'docs/design/office-ipic';
const STATUSES = new Set(['observed', 'inferred', 'proposed']);
const ROUTE_KINDS = new Set(['walk', 'cinematic', 'sit', 'escalator', 'stairs', 'lift', 'sightline', 'portal']);
const finitePair = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const finiteTriple = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const near = (a, b, tolerance = 0.011) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const unique = (items, label, problems) => {
  const seen = new Set();
  for (const id of items) { if (seen.has(id)) problems.push(`duplicate ${label} ${id}`); seen.add(id); }
};

export function readPacket(root = '.') {
  const read = name => JSON.parse(readFileSync(join(root, PACKET_DIR, name), 'utf8'));
  return { layout: read('layout-contract.json'), cameras: read('camera-manifest.json') };
}

/** Problems with the layout contract; [] means valid. `live` holds the runtime plan modules. */
export function validateLayoutContract(contract, { live = null, expectedVersion = LAYOUT_VERSION } = {}) {
  const problems = [];
  if (!contract || typeof contract !== 'object') return ['contract is not an object'];
  if (contract.schemaVersion !== 1) problems.push(`unknown schemaVersion ${contract.schemaVersion}`);
  if (contract.layoutVersion !== expectedVersion) problems.push(`stale layoutVersion ${contract.layoutVersion}, expected ${expectedVersion}`);
  if (!/^[0-9a-f]{40}$/.test(contract.sourceRevision ?? '')) problems.push('sourceRevision is not a full commit sha');
  if (contract.units !== 'metres') problems.push(`units must be metres, got ${contract.units}`);
  if (contract.axes?.three !== '[x, h, -d]') problems.push(`invalid axes.three ${contract.axes?.three}`);
  if (!Array.isArray(contract.geometrySources) || !contract.geometrySources.length) problems.push('no geometrySources');
  else unique(contract.geometrySources.map(s => s.id), 'geometry source', problems);
  const sources = new Set((contract.geometrySources ?? []).map(s => s.id));
  if (!Array.isArray(contract.places) || !contract.places.length) { problems.push('no places'); return problems; }
  unique(contract.places.map(p => p.id), 'place', problems);
  for (const place of contract.places) {
    const at = `place ${place.id}`;
    if (!STATUSES.has(place.status)) problems.push(`${at}: unknown status ${place.status}`);
    if (!sources.has(place.source)) problems.push(`${at}: unknown geometry source ${place.source}`);
    const levels = new Set((place.levels ?? []).map(l => l.id));
    unique([...(place.levels ?? []).map(l => l.id)], `${at} level`, problems);
    if (!levels.size) problems.push(`${at}: no levels`);
    for (const level of place.levels ?? []) if (!Number.isFinite(level.elevation)) problems.push(`${at}: level ${level.id} has no finite elevation`);
    const anchors = new Map();
    for (const anchor of place.anchors ?? []) {
      if (anchors.has(anchor.id)) problems.push(`${at}: duplicate anchor ${anchor.id}`);
      anchors.set(anchor.id, anchor);
      if (!finitePair(anchor.position)) problems.push(`${at}: anchor ${anchor.id} has no finite [x, d] position`);
      if (!levels.has(anchor.level)) problems.push(`${at}: anchor ${anchor.id} names unknown level ${anchor.level}`);
    }
    if (!anchors.has(place.spawn)) problems.push(`${at}: spawn ${place.spawn} is not an anchor`);
    const required = new Map([...anchors.keys()].map(id => [id, new Set()])), any = new Map([...anchors.keys()].map(id => [id, new Set()]));
    for (const route of place.routes ?? []) {
      const label = `${at}: route ${route.from} -> ${route.to}`;
      if (!anchors.has(route.from) || !anchors.has(route.to)) { problems.push(`${label} names an unknown anchor`); continue; }
      if (!ROUTE_KINDS.has(route.kind)) problems.push(`${label} has unknown kind ${route.kind}`);
      if (typeof route.required !== 'boolean') problems.push(`${label} must say whether it is required`);
      any.get(route.from).add(route.to); any.get(route.to).add(route.from);
      if (route.required) { required.get(route.from).add(route.to); required.get(route.to).add(route.from); }
    }
    // Every anchor must be reachable from the spawn, and every required route must join the
    // spawn through required routes alone, so a required island cannot hide behind an optional link.
    if (anchors.has(place.spawn)) {
      const reach = graph => { const seen = new Set([place.spawn]), queue = [place.spawn]; while (queue.length) for (const next of graph.get(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); } return seen; };
      const reachable = reach(any), requiredReach = reach(required);
      for (const id of anchors.keys()) if (!reachable.has(id)) problems.push(`${at}: anchor ${id} is disconnected from ${place.spawn}`);
      for (const route of (place.routes ?? []).filter(r => r.required && anchors.has(r.from) && anchors.has(r.to)))
        if (!requiredReach.has(route.from) || !requiredReach.has(route.to)) problems.push(`${at}: required route ${route.from} -> ${route.to} is disconnected from ${place.spawn} by required routes`);
    }
    if (place.status === 'proposed' && place.fit && place.fit.volumeFitsAtCurrentFloor === false && place.fit.resolution !== 'val-decision') problems.push(`${at}: an unfit proposal must name its resolution`);
    // A recorded fit decision must name a listed option, clear the proposed volume
    // it was taken for, and agree with the contract's decision list.
    const decision = place.fit?.decision;
    if (decision) {
      if (!Number.isInteger(decision.option) || typeof place.fit.options?.[decision.option] !== 'string') problems.push(`${at}: fit decision names no listed option`);
      const entry = (contract.decisions ?? []).find(d => d.id === decision.decisionId);
      if (entry?.status !== 'decided') problems.push(`${at}: fit decision ${decision.decisionId} is not marked decided`);
      const top = decision.officeFloorElevation + place.fit.kitClearHeight;
      if (!near(decision.ceilingElevation, top)) problems.push(`${at}: fit decision ceiling ${decision.ceilingElevation} is not floor + clear height ${top}`);
      if (decision.raisedBuildingHeight !== undefined && !(decision.raisedBuildingHeight >= decision.towerTop && decision.towerTop > decision.ceilingElevation))
        problems.push(`${at}: raised building ${decision.raisedBuildingHeight} and tower top ${decision.towerTop} must enclose the ceiling ${decision.ceilingElevation}`);
    }
    if (live && place.status === 'observed' && place.source === 'office') checkOffice(place, live, problems);
    if (live && place.source === 'ipic') checkIpic(place, live, problems);
  }
  if (live?.envelope && contract.avatarEnvelope) {
    for (const key of ['bodyHalfWidth', 'turningRadius', 'height', 'seatedRadius']) if (!near(contract.avatarEnvelope[key], live.envelope[key], 1e-9)) problems.push(`avatarEnvelope.${key} ${contract.avatarEnvelope[key]} differs from the live ${live.envelope[key]}`);
  }
  return problems;
}

function checkOffice(place, live, problems) {
  const room = live.officeRoom, at = `place ${place.id}`;
  if (!room) { problems.push(`${at}: live office room missing`); return; }
  for (const [key, value] of Object.entries(place.bounds ?? {})) if (!near(room[key], value)) problems.push(`${at}: ${key} ${value} differs from the live plan ${room[key]}`);
  for (const key of ['x', 'halfWidth', 'height']) if (!near(place.door?.[key], room.door[key])) problems.push(`${at}: door.${key} differs from the live plan`);
  if (live.officeSpawn && !near(place.speed, live.officeSpeed, 1e-9)) problems.push(`${at}: speed differs from OFFICE_SPEED`);
  const expect = (id, point) => {
    const anchor = (place.anchors ?? []).find(a => a.id === id);
    if (!anchor) problems.push(`${at}: live plan point ${id} has no anchor`);
    else if (!near(anchor.position[0], point[0]) || !near(anchor.position[1], point[1])) problems.push(`${at}: anchor ${id} ${anchor.position} differs from the live ${point}`);
  };
  if (live.officeSpawn) expect('spawn', live.officeSpawn);
  expect('entrance', room.entrance); expect('outside', room.outside); expect('review-socket', room.review.socket);
  for (const station of room.stations) { expect(`${station.id}-approach`, station.approach); expect(`${station.id}-seat`, station.seat); }
  if (live.arrival && !near(-(live.arrival.carStop), (place.anchors ?? []).find(a => a.id === 'elevator-car')?.position?.[1])) problems.push(`${at}: elevator-car differs from ARRIVAL.carStop`);
  if (live.arrival && !near(place.levels?.[0]?.elevation, live.arrival.officeElevation)) problems.push(`${at}: level elevation differs from ARRIVAL.officeElevation`);
}

function checkIpic(place, live, problems) {
  const at = `place ${place.id}`;
  if (!live.ipicFlights || !live.ipicCameras) { problems.push(`${at}: live IPIC plan missing`); return; }
  const flights = place.flights ?? [];
  if (flights.length !== live.ipicFlights.length) problems.push(`${at}: flight count differs from IPIC_FLIGHTS`);
  flights.forEach((flight, index) => { const liveFlight = live.ipicFlights[index]; if (!liveFlight || !['start', 'end', 'base'].every(k => near(flight[k], liveFlight[k]))) problems.push(`${at}: flight ${index} differs from IPIC_FLIGHTS`); });
  if (live.ipicRoom) {
    for (const key of ['depth', 'height']) if (!near(place.bounds?.[key], live.ipicRoom[key])) problems.push(`${at}: ${key} differs from the live room`);
    if (!near(place.bounds?.width, live.ipicRoom.width)) problems.push(`${at}: width differs from the live room ${live.ipicRoom.width}`);
    for (const level of place.levels ?? []) for (const d of level.dRange ?? []) if (!near(live.ipicRoom.floorAt(...live.ipicRoom.toWorld(0, d)) - live.ipicRoom.floor, level.elevation)) problems.push(`${at}: level ${level.id} elevation differs from floorAt(d=${d})`);
    const seatIds = new Set(live.ipicSeatIds ?? []);
    for (const anchor of place.anchors ?? []) if (anchor.seatId && !seatIds.has(anchor.seatId)) problems.push(`${at}: seat anchor ${anchor.id} names unknown seat ${anchor.seatId}`);
  }
}

/** Problems with the camera manifest against its contract; `fileExists` resolves photo/runner/receipt paths. */
export function validateCameraManifest(manifest, contract, { fileExists = null, expectedVersion = LAYOUT_VERSION, live = null } = {}) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest is not an object'];
  if (manifest.schemaVersion !== 1) problems.push(`unknown schemaVersion ${manifest.schemaVersion}`);
  if (manifest.layoutVersion !== expectedVersion) problems.push(`stale layoutVersion ${manifest.layoutVersion}`);
  if (manifest.sourceRevision !== contract?.sourceRevision) problems.push('camera sourceRevision differs from the layout contract');
  const places = new Map((contract?.places ?? []).map(p => [p.id, p]));
  if (!Array.isArray(manifest.cameras) || !manifest.cameras.length) { problems.push('no cameras'); return problems; }
  unique(manifest.cameras.map(c => c.id), 'camera', problems);
  for (const camera of manifest.cameras) {
    const at = `camera ${camera.id}`;
    const place = places.get(camera.place);
    if (!place) { problems.push(`${at}: unknown place ${camera.place}`); continue; }
    if (!['observed', 'proposed'].includes(camera.status)) problems.push(`${at}: unknown status ${camera.status}`);
    if (camera.status === 'observed' && place.status === 'proposed') problems.push(`${at}: observed camera on a proposed place`);
    if (!finiteTriple(camera.eye) || !finiteTriple(camera.target)) problems.push(`${at}: eye and target must be finite [x, h, d]`);
    if (!(camera.fov > 0 && camera.fov < 180)) problems.push(`${at}: fov out of range`);
    if (camera.status === 'observed') {
      for (const key of ['runner', 'receipt']) {
        if (typeof camera[key] !== 'string') problems.push(`${at}: observed camera needs a ${key}`);
        else if (fileExists && !fileExists(camera[key].replace(/^node /, ''))) problems.push(`${at}: ${key} ${camera[key]} does not resolve`);
      }
    }
    if (camera.photo !== undefined) {
      if (camera.available === false) continue;
      if (typeof camera.photo !== 'string') problems.push(`${at}: photo must be a path`);
      else if (fileExists && !fileExists(camera.photo)) problems.push(`${at}: photo ${camera.photo} does not resolve`);
    }
    if (camera.reuse !== undefined && live?.ipicCameras) {
      const source = live.ipicCameras.find(c => c.name === camera.reuse);
      if (!source) problems.push(`${at}: reuses unknown IPIC camera ${camera.reuse}`);
      else {
        if (!source.eye.every((v, i) => near(v, camera.eye[i])) || !source.target.every((v, i) => near(v, camera.target[i]))) problems.push(`${at}: eye/target differ from IPIC_CAMERAS[${camera.reuse}]`);
        if (camera.photo && !camera.photo.endsWith(source.photo)) problems.push(`${at}: photo differs from IPIC_CAMERAS[${camera.reuse}]`);
      }
    }
  }
  return problems;
}

export const fileExistsUnder = root => path => existsSync(join(root, path));
