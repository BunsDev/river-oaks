// Rollback rehearsal (#777): town checkpoints written by this PR's server (flying, mid maneuver,
// after a maneuver, carrying a passenger) are restored by the base branch's server (#737), which
// must publish none of the new fields and let everyone move. Then roll forward: this PR restores
// what the base server saved, including after the passenger left. Prints one JSON row per case.
//
//   git archive origin/feat/landowner-hovercraft-20261028 | tar -x -C <dir>
//   ln -s "$PWD/node_modules" <dir>/node_modules
//   node scripts/ribbonwing/rollback-rehearsal.mjs <dir>
import { pathToFileURL } from 'node:url';
import { createSharedWorld as createWorld } from '../../server/world.js';
const base = process.argv[2];
const { createSharedWorld: createBaseWorld } = await import(pathToFileURL(`${base}/server/world.js`).href);
const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY';
const data = { scene: 'district', bounds_m: [-30, -30, 30, 30], walkSpawn: [-12, -14, 0], collisionPolygons: [], stores: [], buildings: [], communityLocations: [] };
const scenario = name => {
  let time = 1000;
  const world = createWorld(data, { now: () => time, isAdmin: () => false });
  world.join({ userId: OWNER, name: 'Jevica' });world.join({ userId: 'alice', name: 'alice' });
  const self = (id = OWNER) => world.snapshot().players.find(p => p.id === id);
  const yaw = -Math.PI / 2;
  if (name === 'passenger') {
    // Park the craft beside alice, invite, board.
    const { position } = self();time += 1000;world.command(OWNER, { type: 'pose', position, yaw, altitude: 0, vehicle: 'hover' });
    const a = self('alice');time += 1000;world.command('alice', { type: 'pose', position: [position[0] + 1.5, position[1], a.position[2]], yaw, altitude: 0 });
    const inv = world.command(OWNER, { type: 'ribbonwing', action: 'invite', peerId: 'alice' }), board = world.command('alice', { type: 'ribbonwing', action: 'board', pilotId: OWNER });
    if (!inv.ok || !board.ok) return { time, error: `setup ${JSON.stringify([inv.error, board.error])}` };
    return { time, saved: world.checkpoint() };
  }
  let { position } = self(), at = 0;
  while (at < 10) { time += 1000;at = Math.min(10, at + 3.2);world.command(OWNER, { type: 'pose', position, yaw, altitude: at, vehicle: 'hover' }); }
  time += 1000;world.command(OWNER, { type: 'pose', position, yaw, altitude: 10, vehicle: 'hover' });
  if (name !== 'flying') { const r = world.command(OWNER, { type: 'maneuver', kind: 'roll', id: 'r1', seq: 1 });if (!r.ok) return { time, error: r.error }; }
  time += name === 'after maneuver' ? 4000 : 800;world.snapshot();
  return { time, saved: world.checkpoint() };
};
const results = {};
for (const name of ['flying', 'mid maneuver', 'after maneuver', 'passenger']) {
  const { time, saved, error } = scenario(name);
  if (error) { results[name] = { setup: error };continue; }
  const owner = saved.payload.players.find(p => p.id === OWNER);
  const extra = ['maneuver', 'maneuverSeq', 'lastManeuverId', 'passengerId', 'passengerOf', 'ribbonwingInvite'].filter(key => saved.payload.players.some(p => Object.hasOwn(p, key)));
  const back = createBaseWorld(data, { now: () => time, isAdmin: () => false }), result = back.restore(saved);
  const row = { checkpointVersion: saved.version, newFields: extra, restore: result.ok ? 'ok' : result.error, ownerVehicle: owner.vehicle, ownerAltitude: +owner.altitude.toFixed(2) };
  if (result.ok) {
    const keys = ['maneuver', 'maneuverSeq', 'lastManeuverId', 'passengerId', 'passengerOf'];
    const published = back.snapshot().players.flatMap(p => keys.filter(key => Object.hasOwn(p, key)).map(key => `${p.id === OWNER ? 'owner' : p.id}.${key}`));
    const kept = back.checkpoint().payload.players.flatMap(p => keys.filter(key => Object.hasOwn(p, key)).map(key => `${p.id === OWNER ? 'owner' : p.id}.${key}`));
    // Both can still move: the owner a small hover step, alice a step on foot.
    const o = back.snapshot().players.find(p => p.id === OWNER), a = back.snapshot().players.find(p => p.id === 'alice');
    const ownerMove = back.command(OWNER, { type: 'pose', position: [o.position[0], o.position[1] + .5, o.position[2]], yaw: o.yaw, altitude: o.altitude, vehicle: o.vehicle ?? undefined });
    const aliceMove = back.command('alice', { type: 'pose', position: [a.position[0] + .5, a.position[1], a.position[2]], yaw: a.yaw, altitude: 0 });
    // Roll forward: #737 has run a while (both moved); re-land this PR and restore #737's checkpoint.
    const forward = createWorld(data, { now: () => time + 2000, isAdmin: () => false }).restore(back.checkpoint());
    row.rollForward = forward.ok ? 'ok' : forward.error;
    if (name === 'passenger') {
      // Under #737 alice leaves while the owner still carries her stale seat.
      back.leave('alice');
      const after = createWorld(data, { now: () => time + 3000, isAdmin: () => false }), r = after.restore(back.checkpoint());
      row.rollForwardAfterPassengerLeft = r.ok ? `ok (owner passengerId ${JSON.stringify(after.snapshot().players.find(p => p.id === OWNER)?.passengerId ?? null)})` : r.error;
    }
    Object.assign(row, { publishedAfterRestore: published, keptInNextCheckpoint: kept, ownerMove: ownerMove.ok ? 'ok' : ownerMove.error, aliceMove: aliceMove.ok ? 'ok' : aliceMove.error });
  }
  results[name] = row;
}
console.log(JSON.stringify(results, null, 1));
