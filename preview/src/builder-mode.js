// Builder mode: where a creation would go and whether the town will accept
// it there. Pure functions over the walking pose, so the browser preview and
// its tests share one rule set with the server (shared-build.js).
import {objectCollider,blocksPlayer} from './creator-object.js';
import { BUILD_EDIT_REACH, BUILD_PLAYER_GAP, BUILD_REACH, BUILD_REASONS, buildYaw, buildRoomAt, checkBuildSite } from './shared-build.js';

export const BUILD_AHEAD = 2.4, BUILD_ROTATE_STEP = Math.PI / 8;
// Kept just inside the town's reach, so a clamped target is never refused for distance.
const REACH_MARGIN = .15;
const snap = value => Math.round(value * 10) / 10;
const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The player's feet in [east, north].
export const poseFeet = pose => [pose.position[0], -pose.position[2]];

// Where the preview sits: under the pointer when it points at the ground
// within reach (clamped to reach along the same line otherwise), else a few
// steps ahead. ray: { origin: [x, y, z], direction: [x, y, z] } in scene space.
export function builderTarget(pose, ray = null, {grid = .1} = {}) {
  grid = [.1, .5, 1].includes(grid) ? grid : .1;
  const feet = poseFeet(pose), reach = BUILD_REACH - Math.max(REACH_MARGIN, grid / Math.SQRT2);
  let east = feet[0] - Math.sin(pose.yaw) * BUILD_AHEAD, north = feet[1] + Math.cos(pose.yaw) * BUILD_AHEAD;
  if (ray && ray.direction[1] < -1e-3) {
    const t = (pose.ground - ray.origin[1]) / ray.direction[1];
    if (t > 0) {
      east = ray.origin[0] + ray.direction[0] * t; north = -(ray.origin[2] + ray.direction[2] * t);
      const away = gap([east, north], feet);
      if (away > reach) { east = feet[0] + (east - feet[0]) * reach / away; north = feet[1] + (north - feet[1]) * reach / away; }
    }
  }
  return [east, north].map(value => snap(Math.round(value / grid) * grid));
}

// Everything the town checks for a place or a move, as one verdict.
export function evaluatePlacement({ environment, roads, kind, assembly, yaw=0, position, feet, builds = [], players = [], selfId = null, moving = null }) {
  const threshold=environment.roomAt(feet[0],-feet[1]);
  if(threshold && !threshold.contains(feet[0],feet[1]))
    return { valid: false, reason: 'threshold', message: BUILD_REASONS.threshold, ground: environment.groundAt(position[0],-position[1]) };
  if (gap(feet, position) > BUILD_REACH || (moving && gap(feet, moving.position) > BUILD_EDIT_REACH)) return { valid: false, reason: 'reach', message: BUILD_REASONS.reach, ground: environment.groundAt(position[0], -position[1]) };
  const room=buildRoomAt(environment,feet)?.storeId??null,targetRoom=buildRoomAt(environment,position)?.storeId??null;
  if (room!==targetRoom || moving && room!==(buildRoomAt(environment,moving.position)?.storeId??null))
    return { valid: false, reason: 'room', message: 'Stand in the same home as the creation, or outside with it.', ground: environment.groundAt(position[0],-position[1]) };
  const site = checkBuildSite({ environment, roads, position, kind, builds, ignoreId: moving?.id ?? null });
  const ground = site.ground ?? environment.groundAt(position[0], -position[1]);
  if (site.reason) return { valid: false, reason: site.reason, message: BUILD_REASONS[site.reason], ground };
  // The town counts every player, the builder included.
  const snappedYaw=buildYaw(yaw);
  const collider=objectCollider({kind:kind.id,assembly,position,ground,yaw:snappedYaw});
  const standing = players.find(player => gap(player.position, position) < kind.radius + BUILD_PLAYER_GAP || blocksPlayer(collider,player));
  if (standing) return { valid: false, reason: 'player', message: standing.id === selfId ? 'Step back a little: you are standing there.' : BUILD_REASONS.player, ground };
  return { valid: true, reason: null, message: 'Ready to place.', ground };
}
