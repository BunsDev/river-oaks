// Prince Jev's companion walk. Jev (the decision bridge) chooses how he
// accompanies Jevica; this module owns geometry, clearance and locomotion so a
// model reply can never place him inside a wall, a carriage or another person.

export const COMPANION_STANCES = {
  beside: { label: 'Walk beside Jevica', forward: -0.12, side: 0.86 },
  lead: { label: 'Walk a step ahead of Jevica', forward: 1.45, side: 0.38 },
  trail: { label: 'Walk a step behind Jevica', forward: -1.25, side: 0.42 },
  pause: { label: 'Wait attentively near Jevica', hold: true },
  greet: { label: 'Offer Jevica a courtly bow', hold: true },
  return: { label: 'Return to the carriage bench' },
};
const STEP = 0.4, PERSONAL = 0.62;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// Three-space x/z. Heading h faces (sin h, cos h), matching avatar rotation.y.
export function playerHeading(pose, previous = 0) {
  const [vx, vz] = pose?.velocity ?? [0, 0];
  return Math.hypot(vx, vz) > 0.2 ? Math.atan2(vx, vz) : previous;
}

export function companionSlot(player, heading, stance, isFree, preferredSide = 1) {
  const spec = COMPANION_STANCES[stance] ?? COMPANION_STANCES.beside;
  if (spec.hold || stance === 'return') return null;
  const f = [Math.sin(heading), Math.cos(heading)], r = [Math.cos(heading), -Math.sin(heading)];
  const at = (forward, side) => [player[0] + f[0] * forward + r[0] * side, player[1] + f[1] * forward + r[1] * side];
  // Mirror first, then fall back to single-file behind her on narrow paths.
  const tries = [[spec.forward, spec.side * preferredSide], [spec.forward, -spec.side * preferredSide], [-1.2, 0.15], [-1.7, 0]];
  for (const [forward, side] of tries) {
    const point = at(forward, side);
    if (isFree(point[0], point[1])) return { point, side: Math.sign(side) || preferredSide };
  }
  return null;
}

// Nearest free spot around a centre. A free destination is not itself a route.
export function freeSpotNear(center, isFree, { start = 0.8, heading = 0 } = {}) {
  for (let radius = start; radius < 6; radius += 0.4) for (let i = 0; i < 16; i++) {
    const angle = heading + Math.PI + i / 16 * Math.PI * 2;
    const x = center[0] + Math.sin(angle) * radius, z = center[1] + Math.cos(angle) * radius;
    if (isFree(x, z)) return [x, z];
  }
  return null;
}

export function createCompanionBody(position, heading = 0) {
  return { position: [...position], heading, speed: 0, distance: 0 };
}

// One bounded locomotion step toward target. Collision, step height and
// personal space are enforced here regardless of the chosen stance.
export function stepCompanion(body, target, environment, delta, { player = null, playerSpeed = 0, face = null } = {}) {
  if (!Number.isFinite(delta) || delta <= 0) return body;
  const dt = Math.min(delta, 0.08), [x, z] = body.position;
  let desired = 0, direction = body.heading;
  if (target) {
    const dx = target[0] - x, dz = target[1] - z, gap = Math.hypot(dx, dz);
    if (gap > 0.1) {
      direction = Math.atan2(dx, dz);
      // Match her pace, close gaps quickly, and settle without overshooting.
      desired = clamp(playerSpeed * 0.9 + (gap - 0.1) * 1.9, 0, gap > 5 ? 3.4 : 2.4);
      desired = Math.min(desired, gap / dt);
    }
  }
  body.speed += (desired - body.speed) * (1 - Math.exp(-7 * dt));
  if (body.speed < 0.02 && desired === 0) body.speed = 0;
  const step = body.speed * dt, ground = environment.groundAt(x, z);
  const canStand = (px, pz) => environment.isFree(px, pz) && Math.abs(environment.groundAt(px, pz) - ground) < STEP
    && (!player || Math.hypot(px - player[0], pz - player[1]) >= PERSONAL || Math.hypot(px - player[0], pz - player[1]) > Math.hypot(x - player[0], z - player[1]));
  let nx = x, nz = z;
  const mx = Math.sin(direction) * step, mz = Math.cos(direction) * step;
  if (canStand(x + mx, z + mz)) { nx += mx; nz += mz; }
  else {
    if (canStand(x + mx, z)) nx += mx;
    if (canStand(nx, z + mz)) nz += mz;
  }
  const moved = Math.hypot(nx - x, nz - z);
  body.position = [nx, nz]; body.distance += moved;
  if (moved < step * 0.25) body.speed *= 0.5;
  const facing = moved / dt > 0.15 ? Math.atan2(nx - x, nz - z) : face ?? body.heading;
  body.heading = wrap(body.heading + clamp(wrap(facing - body.heading), -5 * dt, 5 * dt));
  return body;
}

export function companionOptions() {
  return Object.entries(COMPANION_STANCES).map(([id, stance]) => ({ id, action: id, label: stance.label }));
}

// Deterministic stand-in used only while Jev is unavailable; provenance says so.
export function localStance(context) {
  if (context.riding) return 'return';
  if (context.conversing || context.flying) return 'pause';
  if (context.gap_m > 1.8) return 'trail';
  if (context.player_speed < 0.15) return 'pause';
  if (context.crowded || context.narrow || context.indoor) return 'trail';
  return 'beside';
}

export function companionStanceEligible(stance,context) {
  if(context.riding)return stance==='return';
  if(context.flying||context.conversing)return stance==='pause';
  if(stance==='return')return false;
  if(context.gap_m>1.8)return ['beside','trail'].includes(stance);
  if(stance==='greet')return !context.greeted_recently&&context.player_speed<.2&&context.gap_m<3;
  if(stance==='lead')return context.player_speed>=.4&&context.gap_m<4&&!context.indoor&&!context.crowded&&!context.narrow;
  return Boolean(COMPANION_STANCES[stance]);
}

const THRESHOLDS = { beside: 0.3, lead: 0.4, trail: 0.35, pause: 0.3, greet: 0.5, return: 0.6 };

export function createCompanionBrain({
  decide = async (packet, signal) => {
    const response = await fetch('/v1/companion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(packet), signal });
    if (!response.ok) throw new Error('Companion bridge unavailable');
    return response.json();
  }, now = () => performance.now(), interval = 2500,
} = {}) {
  let tick = 0, generation = 0, next = 0, pending = null, greetedAt = -Infinity,disposed=false,latest={};
  const status = { stance: 'beside', source: 'local', label: 'Walking beside you', reason: 'starting', decisions: 0 };
  const apply = (stance, source, reason = null) => {
    if (stance === 'greet') greetedAt = now();
    Object.assign(status, { stance, source, reason, label: COMPANION_STANCES[stance].label });
  };
  return {
    get status() { return { ...status }; },
    get greetedRecently() { return now() - greetedAt < 45000; },
    reset() { generation++; pending?.abort(); pending = null; next = 0; apply('beside', 'local', 'starting'); },
    dispose() {this.reset();disposed=true;},
    update(context) {
      if(disposed)return status;
      latest={...context,greeted_recently:this.greetedRecently};
      if(context.flying||context.conversing) {
        if(pending){generation++;pending.abort();pending=null;}
        apply('pause','local',context.flying?'waiting_on_ground':'conversation');return status;
      }
      if (context.riding) { if (status.stance !== 'return') apply('return', 'local', 'riding'); return status; }
      if (status.stance === 'greet' && now() - greetedAt > 2600) apply('pause', status.source);
      // A reply can become unsafe before the next inference finishes. Only a
      // bow already playing may ignore the repeat-greeting cooldown here.
      const activeContext=status.stance==='greet'?{...latest,greeted_recently:false}:latest;
      if(!companionStanceEligible(status.stance,activeContext))apply(localStance(latest),'local','context_changed');
      if (pending || now() < next) return status;
      next = now() + interval;
      const controller = new AbortController(), version = generation, packet = {
        schema_version: 1, tick: ++tick, generation, ...context, greeted_recently: this.greetedRecently, candidates: companionOptions(),
      };
      pending = controller;
      let timer;
      Promise.race([decide(packet, controller.signal), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 2000); })])
        .then(reply => {
          if (version !== generation) return;
          const stance = reply?.candidate_id;
          if (reply?.schema_version === 1 && reply.tick === packet.tick && reply.generation === packet.generation && reply.source === 'jev' && COMPANION_STANCES[stance]
            && companionStanceEligible(stance,latest)
            && Number.isFinite(reply.confidence) && reply.confidence >= THRESHOLDS[stance] && reply.confidence <= 1) {
            status.decisions++; apply(stance, 'jev');
          } else apply(localStance(latest), 'local', reply?.reason ?? 'invalid_answer');
        })
        .catch(error => { if (version === generation) apply(localStance(latest), 'local', error.name === 'AbortError' ? 'timeout' : 'offline'); })
        .finally(() => { clearTimeout(timer); if (pending === controller) pending = null; });
      return status;
    },
  };
}
