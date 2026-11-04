#!/usr/bin/env node
// Occupied deploy and rollback of the moved Ribbon bench, across two builds in one process. No network, no browser.
// The earlier build must sit inside this worktree so its modules resolve this worktree's node_modules:
//   git archive --prefix=.runtime/ribbon-spine/earlier/ <base-sha> server shared preview config package.json | tar -x
//   node scripts/rehearse-spine-seat-rollback.mjs .runtime/ribbon-spine/earlier
// Evidence for local worlds only: it does not stand in for the real-service occupied rollback.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const target = process.argv[2];
if (!target) { console.error('usage: rehearse-spine-seat-rollback.mjs <earlier build directory>'); process.exit(2); }
const BENCH = 'bench:osm-node-8172494966';
const load = async base => {
  const { createSharedWorld } = await import(new URL('server/world.js', base));
  const { loadDistrictData } = await import(new URL('server/district-data.js', base));
  const { benchSeats } = await import(new URL('preview/src/world-interactions.js', base));
  return { createSharedWorld, data: await loadDistrictData(), benchSeats };
};
const next = await load(new URL('../', import.meta.url));
const prev = await load(pathToFileURL(`${resolve(target)}/`));
const seatOf = build => build.benchSeats(build.data).find(seat => seat.buildId === BENCH);
const open = build => build.createSharedWorld(build.data, { now: () => 1000 });

let failed = false;
const report = (name, ok, detail) => { failed ||= !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(detail)}`); };

for (const [name, from, to] of [['player seated, rollback new to earlier', next, prev], ['player seated, deploy earlier to new', prev, next]]) {
  const world = open(from);
  world.join({ userId: 'a', name: 'Alice' });
  const travel = world.command('a', { type: 'travel', position: seatOf(from).approach }), sit = world.command('a', { type: 'sit', buildId: BENCH, slot: 0 });
  if (!travel.ok || !sit.ok) throw new Error(`could not seat the player: ${JSON.stringify({ travel, sit })}`);
  const restored = open(to), result = restored.restore(JSON.parse(JSON.stringify(world.checkpoint())));
  const player = result.ok ? restored.snapshot().players.find(entry => entry.id === 'a') : null;
  report(name, result.ok && player?.sitting?.buildId === BENCH, { result, sitting: player?.sitting?.buildId, position: player?.position.slice(0, 2).map(value => +value.toFixed(3)) });
}

// A resting resident's seat is not validated like a player's, but the town must still load.
for (const [name, from, to] of [['resident resting, rollback new to earlier', next, prev], ['resident resting, deploy earlier to new', prev, next]]) {
  const world = open(from);
  world.join({ userId: 'a', name: 'Alice' });
  const checkpoint = JSON.parse(JSON.stringify(world.checkpoint())), seat = seatOf(from);
  const locals = checkpoint.payload.state?.locals ?? checkpoint.payload.community?.locals ?? checkpoint.payload.locals;
  const resident = locals?.find(entry => entry.life);
  if (!resident) throw new Error('no resident in the checkpoint: the rehearsal needs updating');
  resident.position = [seat.x, seat.north, resident.position[2]];
  resident.life.seat = { id: seat.id, heading: seat.heading, height: seat.height };
  resident.life.status = 'resting on a bench';
  const { checksum: _checksum, ...envelope } = checkpoint;
  checkpoint.checksum = createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  const result = open(to).restore(checkpoint);
  report(name, result.ok, { result });
}
process.exit(failed ? 1 : 0);
