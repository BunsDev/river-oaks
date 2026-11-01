import { districtRibbonPlan } from './ribbon-district.js';
import { matureTreePlacements } from './landscape-models.js';
import { treePits } from './street-furniture.js';

// Street trees against the District Ribbon spine (#840, increment 1; Val's decision 2 on #835).
// The Ribbon's exclusions stop posts and seats, not trees, so this measures each drawn tree
// (landscape-models.js matureTreePlacements, the placements the renderer and the tree pits use)
// against the spine's walk and canopy. Data and measurement only: nothing here moves a tree.
//
// The tree model is the Five Rooms contract's (#838: siteFromDistrict, siteExclusions and
// crownFindings in shared/city-kit/five-rooms-layout.js on feat/five-rooms-layout-825-20261101),
// so the two checks agree tree for tree. A crown is a disc of the drawn radius whose underside is
// the lowest LiDAR branch end (or 55 % of the height when none is recorded). It passes through the
// canopy when the disc overlaps a walk module and its underside is below the slab top (clear
// height + 0.4 m). A pit (1.3 m grate + 0.1 m frame, a square) blocks the spine when it overlaps a
// walk module or a post. Replace these rules with the contract's own once #838 merges.
export const RIBBON_TREE_RULES = Object.freeze({ slab: 0.4, crownBaseShare: 0.55, pitGrate: 1.3, pitFrame: 0.1 });

// Trees that block the spine, accepted for M0 by Val's decision 2 on #835 (2026-11-01 09:40Z):
// "accept street trees near the canopy for M0; tree exclusions land in Landscape (#840)".
// Keyed by stem position (source east, north), so moving the spine's start or renumbering its posts
// and modules never invalidates an entry. `crownGapCm` is the crown underside minus the slab top in
// centimetres (negative: below it), `through` and `pit` allow the crown through the canopy and the
// pit in the walk or under a post. The test fails on a blocking tree without an entry, on a crown
// gap that drifts by more than 1 cm, and on a tree that blocks in a way its entry does not allow.
const PIT_AND_CROWN = 'pit in the 2.0 m walk or under a post and crown through the canopy; no crown trim or in-pit offset clears it (decision for Val on #840)';
const PIT_ONLY = 'pit in the 2.0 m walk; its crown clears the slab top (decision for Val on #840)';
export const DISTRICT_RIBBON_TREE_DECLARED = Object.freeze([
  { stem: [-2761, -1279], crownGapCm: -81, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2761, -1273], crownGapCm: -18, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2761, -1263], crownGapCm: -28, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2759, -1257], crownGapCm: -11, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2759, -1251], crownGapCm: -47, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2759, -1219], crownGapCm: -21, through: true, pit: true, reason: PIT_AND_CROWN },
  { stem: [-2759, -1205], crownGapCm: 24, through: false, pit: true, reason: PIT_ONLY },
  { stem: [-2759, -1199], crownGapCm: -38, through: true, pit: true, reason: PIT_AND_CROWN },
].map(entry => Object.freeze({ ...entry, stem: Object.freeze(entry.stem) })));

const mm = value => Math.round(value * 1000) / 1000;
function moduleShape(module) {
  const dx = module.to[0] - module.from[0], dy = module.to[1] - module.from[1], length = Math.hypot(dx, dy);
  const n = [-dy / length * module.width / 2, dx / length * module.width / 2];
  return [[module.from[0] + n[0], module.from[1] + n[1]], [module.to[0] + n[0], module.to[1] + n[1]], [module.to[0] - n[0], module.to[1] - n[1]], [module.from[0] - n[0], module.from[1] - n[1]]];
}
const square = ([x, y], half) => [[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]];
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
}
const crosses = (p, shape) => shape.map((a, i) => { const b = shape[(i + 1) % shape.length]; return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); });
const inside = (p, shape) => { const c = crosses(p, shape); return c.every(v => v >= 0) || c.every(v => v <= 0); };
// Signed distance from a point to a convex polygon: negative inside it.
const signedDistance = (p, shape) => { const d = Math.min(...shape.map((a, i) => segmentDistance(p, a, shape[(i + 1) % shape.length]))); return inside(p, shape) ? -d : d; };
// Do two convex polygons share interior area? Touching edges do not count (as in ribbon-layout.js).
function overlaps(a, b) {
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], axis = [q[1] - p[1], p[0] - q[0]], size = Math.hypot(axis[0], axis[1]) || 1;
    const pa = a.map(v => v[0] * axis[0] + v[1] * axis[1]), pb = b.map(v => v[0] * axis[0] + v[1] * axis[1]);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= 1e-6 * size) return false;
  }
  return true;
}

// One row per drawn tree within `within` metres of the spine's walk. `planGap` is the stem's signed
// distance to the walk (negative: the stem stands on it); `crownGap` the crown underside minus the
// slab top; `through` the crown disc overlapping the walk with its underside below the slab top;
// `pit` what the pit's square overlaps: 'walk', else a standing 'post', else null; `blocks` either. `tree` and `pitId` are the #838
// contract's ids (tree-<placement index>, tree-pit-<pit index>) for cross-reference only.
export function districtRibbonTreeClearance(world, { plan = districtRibbonPlan(world), within = 15, placements = matureTreePlacements(world), pits = treePits(world) } = {}) {
  const rules = RIBBON_TREE_RULES, shapes = plan.modules.map(module => ({ module, shape: moduleShape(module) }));
  const posts = plan.posts.map(post => square(post.position, 0.15));
  const supports = new Map((world?.vegetation?.branch_supports ?? []).map(tree => [`${mm(tree.position[0])},${mm(tree.position[1])}`, tree]));
  const pitAt = new Map(pits.map((pit, i) => [`${mm(pit[0])},${mm(-pit[2])}`, i]));
  const rows = [];
  placements.forEach((tree, i) => {
    const stem = [tree.position[0], -tree.position[2]], key = `${mm(stem[0])},${mm(stem[1])}`;
    const nearest = shapes.reduce((best, item) => { const d = signedDistance(stem, item.shape); return d < best.d ? { d, item } : best; }, { d: Infinity });
    if (nearest.d > within) return;
    const support = supports.get(key), ends = support?.endpoints?.length ? support.endpoints.map(p => p[2]) : null;
    const crownBase = ends ? Math.min(...ends) : tree.height * rules.crownBaseShare;
    const crownGap = crownBase - (nearest.item.module.clearHeight + rules.slab), through = nearest.d < tree.radius && crownGap < 0;
    const pitIndex = pitAt.get(key), pitShape = square(stem, rules.pitGrate / 2 + rules.pitFrame);
    const pit = pitIndex === undefined ? null : shapes.some(item => overlaps(pitShape, item.shape)) ? 'walk' : posts.some(post => overlaps(pitShape, post)) ? 'post' : null;
    rows.push({
      stem: stem.map(mm), tree: `tree-${i}`, pitId: pitIndex === undefined ? null : `tree-pit-${pitIndex}`,
      radius: mm(tree.radius), height: mm(tree.height), crownBase: mm(crownBase), crownBaseFrom: ends ? 'lidar' : 'share',
      planGap: mm(nearest.d), crownGap: mm(crownGap), crownGapCm: Math.round(crownGap * 100), through, pit, blocks: through || pit !== null,
    });
  });
  return rows;
}
