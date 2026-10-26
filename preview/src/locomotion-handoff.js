import { fastWalkFor } from './walking.js';

// The walking input foot placement receives (foot-placement.js update): horizontal
// speed and accumulated horizontal distance, the travel heading as a scene yaw
// (atan2(x, z), the body's own convention), and a moving floor when one carries
// the feet. Below this horizontal speed a figure stands and keeps its body heading.
export const STANDING_SPEED = .05;

// The local walking pose (walking-ui.js getPose) already measures horizontal travel.
// A presentation pose (office-world-scene.js) may name its own heading and floor.
export function localLocomotion(pose, { seated = false } = {}) {
  const still = seated || pose.flying;
  const heading = Number.isFinite(pose.heading) ? pose.heading
    : !still && pose.speed > STANDING_SPEED ? Math.atan2(pose.velocity[0], pose.velocity[1]) : undefined;
  return { speed: still ? 0 : pose.speed, distance: pose.distance, heading, platform: pose.platform };
}

// A walking peer's town pose arrives about every 200 ms: the peer sends one at most
// every 200 ms (multiplayer-client.js) and the town broadcasts at most every 200 ms
// (server/app.js), so now and then a broadcast repeats a pose or skips one. The
// snapshot carries no pose time. Lerping toward each pose moved a steady 1.65 m/s
// walker in surges from 0.3 to 6.8 m/s. Instead a playhead walks the received path
// at the peer's speed over its last few poses (distance over time, so a repeated
// or skipped pose moves it by a fraction), about PACE_DELAY behind the newest pose,
// and brakes into the last pose like the local walk stops (walking.js
// WALK_RESPONSE: about 0.8 m from 6.4 m/s); it never passes it. A stiff spring per
// axis follows the playhead and rounds its corners. A figure whose pose changes
// every rendered frame (the office's own actor), flight and rides keep the original
// lerp: the first needs no buffer, flight outruns what the buffer can brake from
// inside the snap distance, and a ride's heading is its own yaw.
// A walking pose that changes level (a portal) snaps like the local player's: a new
// `level`, or a rise of more than LEVEL_CHANGE that exceeds the pose's horizontal
// travel (stairs and escalators rise less than they travel).
const SNAP_DISTANCE = 8, LEVEL_CHANGE = 1.5, PACE_DELAY = .3, PACE_CORRECTION = 1.2, BRAKING = 24, FOLLOW = 24, LERP = 12;
const ARRIVALS = 8, CADENCE_GAP = .6, MAX_PATH = 64, EVERY_FRAME = 5, EVERY_FRAME_MS = 50;

const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

export function createPeerMotion(id) {
  // The town accepts a walking pose up to this speed (server/world.js pose()).
  const limit = fastWalkFor(id) + .2;
  const velocity = [0, 0, 0], path = [], arrivals = [], goal = [0, 0, 0], playhead = [0, 0, 0], before = [0, 0, 0];
  // Reused every frame: callers read it at once and copy what they keep.
  const state = { speed: 0, distance: 0, heading: undefined, platform: [0, 0, 0], moved: [0, 0], snapped: false };
  // Paced until it is posed on EVERY_FRAME consecutive rendered frames spanning at least
  // EVERY_FRAME_MS: the office poses its own actor every frame, the town every 200 ms,
  // and a burst of queued snapshots is a few frames at most.
  let placed = false, paced = null, direct = false, streak = 0, streakFrom = 0, missed = 0;
  let interval = .2, changedAt = null, pace = 0, floor = 0, level = null, heard = 0, heardOver = 0, delay = PACE_DELAY, grow = false;
  const backlog = () => { let total = 0, from = playhead; for (const point of path) { total += span(from, point); from = point; } return total; };
  // Start pacing from where the figure is. Switching from the direct follow or from
  // flight keeps the pose history and moves on at the walk's speed toward the newest
  // pose, so the walk does not stall; a relocation starts still.
  const resume = (position, speed) => {
    path.length = 0; pace = speed; playhead[0] = position.x; playhead[1] = position.y; playhead[2] = position.z;
    const toward = span(playhead, goal);
    for (let i = 0; i < 3; i++) velocity[i] = toward > 1e-6 ? (goal[i] - playhead[i]) / toward * speed : 0;
  };
  const remember = (step, seconds) => {
    arrivals.push({ length: step, elapsed: seconds }); heard += step; heardOver += seconds;
    if (arrivals.length > ARRIVALS) { const old = arrivals.shift(); heard -= old.length; heardOver -= old.elapsed; }
  };
  return {
    get state() { return state; },
    // `position` (x/y/z, scene metres) moves toward the town pose `next` over `delta`
    // seconds at render time `now` (ms). `posed`: a pose was supplied since the last
    // frame. `snap` places it there (seating); `walking` false (flight, a ride) keeps
    // the original lerp; `levelId` names the floor.
    step(position, next, delta, now, { posed = true, snap = false, walking = true, levelId = null } = {}) {
      before[0] = position.x; before[1] = position.y; before[2] = position.z;
      if (posed) { if (streak === 0) streakFrom = now; streak++; missed = 0; } else if (++missed >= 2) streak = 0;
      direct = streak >= EVERY_FRAME && now - streakFrom >= EVERY_FRAME_MS;
      const changed = !placed || next.x !== goal[0] || next.y !== goal[1] || next.z !== goal[2];
      let relocated = !placed || snap;
      if (changed) {
        const jump = placed ? Math.hypot(next.x - goal[0], next.y - goal[1], next.z - goal[2]) : 0;
        const elapsed = changedAt === null ? interval : Math.max(0, (now - changedAt) / 1000);
        const rise = Math.abs(next.y - goal[1]), across = Math.hypot(next.x - goal[0], next.z - goal[2]);
        if (jump > SNAP_DISTANCE || walking && placed && (levelId !== level || rise > LEVEL_CHANGE && rise > across)) relocated = true;
        else if (placed && walking && !direct) {
          if (elapsed < CADENCE_GAP) interval += (elapsed - interval) * .3;
          // Distance over time; the first pose of a walk counts one interval.
          remember(jump, arrivals.length ? Math.min(.5, Math.max(1 / 120, elapsed)) : interval);
          path.push([next.x, next.y, next.z]);
          if (path.length > MAX_PATH) { const [x, y, z] = path.shift(); playhead[0] = x; playhead[1] = y; playhead[2] = z; }
        }
        changedAt = now; goal[0] = next.x; goal[1] = next.y; goal[2] = next.z; placed = true; level = levelId;
      }
      if (!relocated && span(before, goal) > SNAP_DISTANCE) relocated = true;
      state.snapped = relocated;
      if (relocated) {
        position.x = goal[0]; position.y = goal[1]; position.z = goal[2];
        resume(position, 0); paced = walking;
      } else if (!walking || direct) {
        paced = false;
        const amount = 1 - Math.exp(-LERP * delta);
        position.x += (goal[0] - position.x) * amount; position.y += (goal[1] - position.y) * amount; position.z += (goal[2] - position.z) * amount;
      } else {
        if (paced === false) { resume(position, heardOver > 0 ? heard / heardOver : state.speed); path.push([goal[0], goal[1], goal[2]]); grow = true; }
        paced = true;
        if (delta > 0) {
          const estimate = heardOver > 0 ? heard / heardOver : 0, remaining = backlog();
          // Leaving the direct follow, the buffer starts at the delay the figure has and
          // grows to PACE_DELAY over about two seconds instead of stalling to build it.
          if (grow) { delay = estimate > 0 ? Math.min(PACE_DELAY, remaining / estimate) : PACE_DELAY; grow = false; }
          delay += (PACE_DELAY - delay) * (1 - Math.exp(-delta / 2));
          const wanted = Math.max(0, estimate + (remaining - delay * estimate) / PACE_CORRECTION);
          pace = Math.min(Math.sqrt(2 * BRAKING * remaining), pace + (wanted - pace) * (1 - Math.exp(-delta / .1)));
          let travel = pace * delta;
          while (travel > 0 && path.length) {
            const point = path[0], length = span(playhead, point);
            if (length <= travel) { playhead[0] = point[0]; playhead[1] = point[1]; playhead[2] = point[2]; path.shift(); travel -= length; }
            else { for (let i = 0; i < 3; i++) playhead[i] += (point[i] - playhead[i]) * travel / length; travel = 0; }
          }
          if (!path.length) pace = 0;
        }
        if (delta > 0) {
          const decay = Math.exp(-FOLLOW * delta);
          for (let i = 0; i < 3; i++) {
            const axis = i === 0 ? 'x' : i === 1 ? 'y' : 'z';
            const offset = position[axis] - playhead[i], push = (velocity[i] + FOLLOW * offset) * delta;
            let after = (offset + push) * decay;
            velocity[i] = (velocity[i] - FOLLOW * push) * decay;
            // Never pass the playhead: settle on it.
            if (offset !== 0 && Math.sign(after) !== Math.sign(offset)) { after = 0; velocity[i] = 0; }
            position[axis] = playhead[i] + after;
          }
        }
      }
      const dx = relocated ? 0 : position.x - before[0], dz = relocated ? 0 : position.z - before[2], horizontal = Math.hypot(dx, dz);
      const speed = delta > 0 ? horizontal / delta : 0, moving = speed > STANDING_SPEED;
      state.distance += horizontal;
      // Vertical travel while standing (a lift, a level change under the snap
      // distance) is a moving floor under planted feet, not a walk.
      if (!moving && !relocated) floor += position.y - before[1];
      state.speed = Math.min(limit, speed); state.heading = moving ? Math.atan2(dx, dz) : undefined;
      state.platform[1] = floor; state.moved[0] = dx; state.moved[1] = dz;
      return state;
    },
  };
}
