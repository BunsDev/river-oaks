import districtSpine from '../../config/ribbon/district-spine.json' with { type: 'json' };
import { groundSurfaceHeight } from './world-surface.js';

// The drawn street trees carry leaves from about 12 % of their height, far below the crown base the
// Five Rooms contract measures, so clearing the data alone leaves foliage in the walk (#840). The
// District therefore clears a volume along the main spine: as wide as the canopy, up to just past its
// top. It works on the fragment, so every level of detail obeys it with no new mesh, draw call or
// texture, and Pink and Classic draw the same trees. Trunks all stand outside it, which
// preview/tests/ribbon-spine-corridor.test.js enforces. Sun shadows keep the whole crown: they
// fall on the canopy and the ground, and a shadow is no obstacle. The ambient occlusion pass overrides
// materials and cannot discard, so bark in a batch that reaches the volume stays out of it
// (landscape-models.js), as leaves already do; otherwise branches that are not drawn would darken the walk.
const LANE = 'osm-way-583333526-0';
// RIBBON_FINISH's slab, and its overhang plus bullnose; the corridor test binds them. Not imported,
// since ribbon-finish.js reaches back to the street kit that loads the trees.
const SLAB = 0.4, CANOPY_EDGE = 0.24;
export function ribbonCrownClearance(world) {
  if (world?.scene !== 'district' || !world.roads?.some(road => road.id === LANE)) return null;
  const spine = districtSpine.segments[0], points = spine.points;
  // The canopy follows the ground, so the volume reaches the highest top along the walk.
  let ground = -Infinity;
  points.slice(1).forEach((to, i) => {
    const from = points[i], steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]));
    for (let k = 0; k <= steps; k++) ground = Math.max(ground, groundSurfaceHeight(world, from[0] + (to[0] - from[0]) * k / steps, -(from[1] + (to[1] - from[1]) * k / steps)));
  });
  return { points, halfWidth: spine.width / 2 + CANOPY_EDGE + 0.05, top: ground + spine.clearHeight + SLAB + 0.05 };
}

const glsl = value => value.toFixed(3);
// The GLSL test for a fragment in the volume. Scene z is -north; vRoWorld comes from near-camera-fade.js,
// which every tree material carries. Exported so the core tests can evaluate the expression itself.
export function ribbonClearanceCondition(clearance) {
  const runs = clearance.points.slice(1).map((to, i) => [clearance.points[i], to]);
  const gaps = runs.map(([a, b]) => `roRibbonGap(vRoWorld.xz, vec2(${glsl(a[0])}, ${glsl(-a[1])}), vec2(${glsl(b[0])}, ${glsl(-b[1])})) < ${glsl(clearance.halfWidth)}`);
  return `vRoWorld.y < ${glsl(clearance.top)} && (${gaps.join(' || ')})`;
}
// Does a crown of this radius, at this stem (scene frame), reach into the volume?
export function reachesRibbonClearance(clearance, [x, , z], radius) {
  const reach = clearance.halfWidth + radius;
  return clearance.points.slice(1).some((to, i) => {
    const a = clearance.points[i], dx = to[0] - a[0], dy = to[1] - a[1], north = -z;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - north) < reach;
  });
}
export function clearCrownsAlongRibbon(material, clearance) {
  if (!clearance) return material;
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey, condition = ribbonClearanceCondition(clearance);
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        float roRibbonGap(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; return distance(p, a + ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0)); }`)
      .replace('void main() {', `void main() {
        if (${condition}) discard;`);
  };
  material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|ro-ribbon-crown-clearance`;
  return material;
}
