// The Gardens' public circulation as matched views (#508 slice b): an eye-height camera on
// every Floor 4 gallery, both skywalks, all six terraces and all three roofs, each derived
// from the contract (#506) rather than placed by hand, and each marked on the design plan it
// should be read against (docs/design/garden-campus/views). garden-campus-views.mjs renders
// them; tests/garden-campus-circulation-views.test.js holds them to public support.
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';

export const EYE = 1.68;
const LOOK = 1.2, FOV = 70;
const mid = (a, b) => (a + b) / 2;

// scripts/garden-campus-views.mjs draws the plans with planFrame(s, pad): x = pad + u·s,
// y = pad + (181.3 − v)·s. Floor 4 is planFrame(6), the site plan planFrame(4, 60).
export const PLANS = {
  'floor-4': { file: 'docs/design/garden-campus/views/floor-4.svg', s: 6, pad: 40 },
  'site-plan': { file: 'docs/design/garden-campus/views/site-plan.svg', s: 4, pad: 60 },
};
export const planPoint = (plan, [u, v]) => { const { s, pad } = PLANS[plan];return [pad + u * s, pad + (181.3 - v) * s]; };

const camera = (id, name, level, surfaceId, [u, v], [tu, tv]) => ({
  id, name, levelId: level.id, surfaceId, plan: level.z === 13 ? 'floor-4' : 'site-plan', fov: FOV,
  position: [u, v, level.z + EYE], target: [tu, tv, level.z + LOOK],
});

/** Every public circulation view, in walking order: Floor 4 first, then terraces, then roofs. */
export function circulationCameras() {
  const levels = campusLevels(), byId = new Map(levels.flatMap(level => level.surfaces.map(surface => [surface.id, { level, surface }])));
  const l3 = levels.find(level => level.z === 13), views = [];
  // Floor 4: each gallery looks along its length toward the skywalk it meets (T3 back to B23).
  for (const tower of CAMPUS.towers) {
    const { surface: { rect: [u0, v0, u1, v1] } } = byId.get(`${tower.id}-F4-public`), u = mid(u0, u1), south = tower.id === 'T3';
    views.push(camera(`f4-${tower.id.toLowerCase()}-gallery`, `${tower.name} Floor 4 gallery, ${south ? 'south to B23' : 'north to the next skywalk'}`,
      l3, `${tower.id}-F4-public`, [u, south ? v1 - 1.2 : v0 + 1.2], [u, south ? v0 - 4 : v1 + 4]));
  }
  // Both skywalks from the north end of their guarded deck (B12 lands on T2's terrace beyond
  // it), looking back the way a returning resident walks.
  for (const bridge of CAMPUS.bridges) {
    const [u0, v0, u1] = bridge.clear, u = mid(u0, u1);
    views.push(camera(`f4-${bridge.id.toLowerCase()}-south`, `${bridge.name}, south from the ${bridge.to.tower} end`, l3, bridge.id, [u, bridge.guardSpan[1] - 1], [u, v0 - 4]));
  }
  // Terraces: from the passage door, along the long strip to the corner where it turns west.
  for (const level of levels) for (const passage of level.surfaces.filter(surface => surface.kind === 'passage')) {
    const terrace = passage.id.replace(/-passage$/, ''), { surface: { rect: [u0, v0, u1] } } = byId.get(`${terrace}/0`), door = mid(passage.rect[1], passage.rect[3]);
    views.push(camera(`${terrace.toLowerCase()}`, `${terrace} from its passage door, south to the corner`, level, `${terrace}/0`, [mid(u0, u1), door], [mid(u0, u1), v0]));
  }
  // Roofs: from the headhouse landing, north along the roof garden.
  for (const tower of CAMPUS.towers) {
    const { roof } = tower, level = levels.find(item => item.z === roof.z), [lu, lv] = roof.headhouse.landing;
    views.push(camera(`${roof.id.toLowerCase()}`, `${tower.name} roof garden from the headhouse landing, north`, level, roof.id, [lu, lv], [lu, roof.rect[3] - 0.5]));
  }
  return views;
}
