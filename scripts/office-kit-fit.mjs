// Desk fit check for #362, read-only. The penthouse plan (preview/src/office-layouts.js) has
// no desk footprints yet: #362 must supply measured ones, and the import contract posted on
// #362 says each must keep its approach anchor clear for the turning body and leave every
// required route walkable. This overlays a supplied kit's own proposed desk colliders on the
// plan and applies those rules, with every other seat occupied, so design and Val can see
// whether the kit's numbers would pass before anything is imported (R19 is still open).
//
//   node scripts/office-kit-fit.mjs <kit-dir>   # reads <kit-dir>/layout.json, prints a JSON report
//
// Nothing is copied from the kit, and the report is not a design approval.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AVATAR_ENVELOPE } from '../preview/src/workplace-room.js';
import { OFFICE_LAYOUT_PENTHOUSE, officeLayout, officeLevelFree, officeLevelSegmentFree, officeSeats } from '../preview/src/office-layouts.js';

const L0 = 'jevica-office/l0';
const contains = (box, [x, d]) => x >= box.x0 && x <= box.x1 && d >= box.d0 && d <= box.d1;
const gap = (box, [x, d]) => Math.hypot(x - Math.max(box.x0, Math.min(x, box.x1)), d - Math.max(box.d0, Math.min(d, box.d1)));

// Breadth-first search on a 0.2 m grid, as the plan tests do: is there a path for the turning body?
export function walkable(layout, levelId, from, to, occupied = []) {
  const step = 0.2, at = ([i, j]) => [from[0] + i * step, from[1] + j * step];
  if (!officeLevelFree(layout, levelId, from, occupied)) return false;
  const seen = new Set(['0,0']), queue = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const here = at(queue[head]);
    if (Math.hypot(here[0] - to[0], here[1] - to[1]) <= step && officeLevelSegmentFree(layout, levelId, here, to, occupied)) return true;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = [queue[head][0] + di, queue[head][1] + dj], key = next.join();
      if (seen.has(key) || !officeLevelFree(layout, levelId, at(next), occupied)) continue;
      seen.add(key); queue.push(next);
    }
  }
  return false;
}

/** Applies #362's desk rules to a kit layout ({stations, colliders}); `routes` are the contract's. */
export function checkKitDesks(kit, routes) {
  const plan = officeLayout(OFFICE_LAYOUT_PENTHOUSE), problems = [];
  const anchors = new Map(plan.anchors.map(item => [item.id, item]));
  const floorColliders = (kit.colliders ?? []).filter(c => (c.y0 ?? 0) < 0.5 && Number.isFinite(c.x0) && Number.isFinite(c.d0));
  const desks = [], footprints = new Map();
  for (const station of plan.anchors.filter(item => item.kind === 'approach')) {
    const proposed = (kit.stations ?? []).find(item => item.id === station.id);
    // The desk is the floor collider holding the kit's desk centre, never a chair.
    const box = proposed && floorColliders.find(c => contains(c, [proposed.x, proposed.d]) && !/chair/.test(c.id));
    if (!box) { problems.push(`${station.id}: no desk collider at the kit's desk centre`); desks.push({ station: station.id, ok: false }); continue; }
    const clearance = gap(box, station.position), seat = station.seat;
    const ok = clearance >= AVATAR_ENVELOPE.turningRadius && !contains(box, seat) && (box.y1 ?? 0) <= 1.2;
    if (!ok) problems.push(`${station.id}: ${box.id} leaves its approach ${clearance.toFixed(3)} m clear (needs ${AVATAR_ENVELOPE.turningRadius}), covers its seat, or stands over 1.2 m`);
    desks.push({ station: station.id, collider: box.id, footprint: [box.x0, box.x1, box.d0, box.d1], height: box.y1 ?? null, approachClearanceM: Number(clearance.toFixed(3)), ok });
    footprints.set(box.id, box);
  }
  // The plan with the proposed desks as main-floor obstacles.
  const candidate = structuredClone(plan), main = candidate.levels.find(level => level.id === L0);
  for (const box of footprints.values()) main.obstacles.push({ id: `kit:${box.id}`, kind: 'desk', x0: box.x0, x1: box.x1, d0: box.d0, d1: box.d1, height: box.y1 ?? 0.76 });
  for (const o of main.obstacles.filter(item => item.kind !== 'desk'))
    for (const box of footprints.values()) if (box.x0 < o.x1 && box.x1 > o.x0 && box.d0 < o.d1 && box.d1 > o.d0) problems.push(`${box.id} overlaps ${o.id}`);
  const seats = officeSeats(candidate), results = [];
  for (const route of routes.filter(item => item.required && item.kind === 'walk')) {
    const from = anchors.get(route.from), to = anchors.get(route.to);
    const occupied = seats.filter(seat => seat.levelId === from.levelId && seat.workstation !== route.to && seat.workstation !== route.from);
    const ok = walkable(candidate, from.levelId, from.position, to.position, occupied);
    if (!ok) problems.push(`${route.from} -> ${route.to} is not walkable with the proposed desks and ${occupied.map(seat => seat.id).join(', ')} occupied`);
    results.push({ from: route.from, to: route.to, occupied: occupied.map(seat => seat.id), ok });
  }
  return { ok: !problems.length, desks, routes: results, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const kitDir = process.argv[2];
  if (!kitDir) { console.error('Usage: node scripts/office-kit-fit.mjs <kit-dir>'); process.exit(2); }
  const raw = readFileSync(join(kitDir, 'layout.json'));
  const contract = JSON.parse(readFileSync(new URL('../docs/design/office-ipic/layout-contract.json', import.meta.url)));
  const place = contract.places.find(item => item.id === 'office-penthouse-proposed');
  const report = { kit: { layoutSha256: createHash('sha256').update(raw).digest('hex') }, contract: contract.layoutVersion,
    scope: 'Proposed kit desk colliders against the #362 import rules; not imported, not a design approval', ...checkKitDesks(JSON.parse(raw), place.routes) };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
