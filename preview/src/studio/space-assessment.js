// Bounded local guidance, using the same collision world and movement as Studio.
import { buildSpaceWorld, isSpaceDocument, validateSpace, spaceObjectBlocks } from './space-document.js';
import { spaceRouteProfile } from './space-templates.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from '../walking.js';

export const SPACE_ROUTE_BUDGET = 30000;
const GRID = .25;
export function normalizeAssessmentContext(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2
    || typeof value.templateId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value.templateId)
    || !Number.isSafeInteger(value.profileVersion) || value.profileVersion < 1 || value.profileVersion > 10000) {
    throw Error('Invalid template assessment context. Open the bare v1 file to recover it.');
  }
  return { templateId: value.templateId, profileVersion: value.profileVersion };
}

// Start each straight leg at steady normal walking speed. This exercises the
// actual 120 Hz collision/support substeps, including sliding: reaching a nearby
// free sample is insufficient if the controller cannot reach the exact endpoint.
export function spaceMovementSegment(environment, from, to) {
  const dx = to[0] - from[0], dn = to[1] - from[1], distance = Math.hypot(dx, dn);
  if (!environment.isFree(from[0], -from[1]) || !environment.isFree(to[0], -to[1])) return false;
  if (distance === 0) return true;
  const state = createWalkingState(environment, from);
  const input = { strafe: dx / distance, forward: dn / distance };
  state.velocity = [input.strafe * 1.65, -input.forward * 1.65];
  for (let remaining = distance / 1.65; remaining > 1e-10;) {
    const dt = Math.min(.08, remaining);
    stepWalking(state, environment, input, dt);
    remaining -= dt;
  }
  return Math.hypot(state.position[0] - to[0], state.position[2] + to[1]) < 1e-7;
}

export function assessSpace(space, context, { revision = 0, maxWork = SPACE_ROUTE_BUDGET } = {}) {
  context = normalizeAssessmentContext(context);
  const result = { status: 'not-assessed', revision, context, controller: 'studio-walking-v1',
    radius: .35, eyeHeight: 1.68, grid: GRID, work: 0, findings: [], routes: [] };
  const profile = spaceRouteProfile(context);
  if (!isSpaceDocument(space) || !profile) return result;
  validateSpace(space);
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) throw Error('Use a finite route work budget.');
  const nearby = target => space.objects.filter(spaceObjectBlocks)
    .sort((a,b) => Math.hypot(a.east-target.position[0],a.north-target.position[1]) - Math.hypot(b.east-target.position[0],b.north-target.position[1]))
    .slice(0,3).map(o=>o.id);
  const finding = (ruleId, target, message, objectIds = []) => ({ ruleId, targetId: target?.id ?? 'exit',
    objectIds, route: `arrival → ${target?.label ?? 'exit'} → exit`, revision, message });
  for (const target of profile.targets) {
    if (!space.objects.some(o => o.id === target.objectId && o.kind === target.kind)) {
      result.findings.push(finding('required-role', target, `Restore ${target.objectId} (${target.kind}) for ${target.label}.`, [target.objectId]));
    }
  }
  if (result.findings.length) return { ...result, status: 'blocked' };
  const environment = createWalkingEnvironment(buildSpaceWorld(space));
  const [west, south, east, north] = space.bounds_m;
  const edges = new Map(), key = p => `${p[0]},${p[1]}`;
  const exhausted = Symbol('budget');
  const spend = () => { if (++result.work > Math.min(SPACE_ROUTE_BUDGET, maxWork)) throw exhausted; };
  const edge = (a, b) => {
    const id = [key(a), key(b)].sort().join('|');
    if (!edges.has(id)) {
      spend();
      edges.set(id, spaceMovementSegment(environment, a, b) && spaceMovementSegment(environment, b, a));
    }
    return edges.get(id);
  };
  // A small A* frontier. Grid size and expanded/edge work are hard bounded.
  const route = (from, to) => {
    if (!environment.isFree(from[0], -from[1]) || !environment.isFree(to[0], -to[1])) return null;
    const start = { p: from, ix: 0, iy: 0, cost: 0, parent: null }, open = [start], best = new Map([[key(from), 0]]);
    const distance = p => Math.abs(p[0] - to[0]) + Math.abs(p[1] - to[1]);
    while (open.length) {
      spend();
      let index = 0;
      for (let i = 1; i < open.length; i++) if (open[i].cost + distance(open[i].p) < open[index].cost + distance(open[index].p)) index = i;
      const current = open.splice(index, 1)[0];
      if (current.cost !== best.get(key(current.p))) continue;
      if (Math.hypot(current.p[0] - to[0], current.p[1] - to[1]) <= GRID && edge(current.p, to)) {
        const points = [to];
        for (let node = current; node; node = node.parent) points.push(node.p);
        return points.reverse();
      }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const ix = current.ix + dx, iy = current.iy + dy;
        const p = [from[0] + ix * GRID, from[1] + iy * GRID], cost = current.cost + GRID;
        if (p[0] < west || p[0] > east || p[1] < south || p[1] > north || (best.get(key(p)) ?? Infinity) <= cost) continue;
        if (!edge(current.p, p)) continue;
        best.set(key(p), cost); open.push({ p, ix, iy, cost, parent: current });
      }
    }
    return null;
  };
  // Exit is fixed by the selected recipe: moving spawn into a room cannot evade
  // the entrance route. Every edge is checked in both directions.
  const targets = [{ id: 'exit', label: 'exit', position: profile.exit }, ...profile.targets];
  let target;
  try {
    for (target of targets) {
      const points = route(space.spawn, target.position);
      if (!points) {
        result.findings.push(finding('required-route', target,
          `Clear the route to ${target.label} at ${target.position.join(', ')} m; move or resize the obstructing furnishing.`, nearby(target)));
        return { ...result, status: 'blocked' };
      }
      result.routes.push({ targetId: target.id, points, returnChecked: true });
    }
  } catch (error) {
    if (error !== exhausted) throw error;
    result.findings.push(finding('route-budget', target, 'Route assessment reached its work limit. Simplify the layout and assess again.'));
    return { ...result, status: 'blocked' };
  }
  return { ...result, status: 'passed' };
}
