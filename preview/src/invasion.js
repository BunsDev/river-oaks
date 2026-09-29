// Alien invasion scenario: pure simulation in local east/north/up metres.
// Saucers land at the district edge, the crew hunt residents to beam aboard,
// and Jevica can banish them.
export const MAGIC_FORMS = ['jevica'];
export const SPELL_RANGE = 14, SPELL_SPEED = 22, SPELL_COOLDOWN = 0.35, HIT_RADIUS = 1.1;
export const ALIEN_SPEED = 1.25, ABDUCT_RANGE = 1.7, BEAM_SECONDS = 5, LANDING_SECONDS = 4, BANISH_SECONDS = 1.4, LANDING_ALTITUDE = 14;
export const RESIDENTS_LOST_LIMIT = 5, MENACE_RANGE = 20, MENACE_STANDOFF = 4;

export const canCast = form => MAGIC_FORMS.includes(form);
const distance2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const random = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// Landing sites ring the district edge, pulled inward until the ground is free.
export function landingSites(world, count, isFree, seed = 7) {
  const [west, south, east, north] = world.bounds_m, centre = [(west + east) / 2, (south + north) / 2];
  const spawn = world.walkSpawn ?? [...centre, 0], next = random(seed), sites = [];
  for (let i = 0; i < count; i++) {
    const angle = (i + next() * 0.6) / count * Math.PI * 2;
    for (let reach = 0.92; reach > 0.15 && sites.length === i; reach -= 0.06) {
      const e = spawn[0] + Math.cos(angle) * (east - west) / 2 * reach, n = spawn[1] + Math.sin(angle) * (north - south) / 2 * reach;
      if (e > west + 2 && e < east - 2 && n > south + 2 && n < north - 2 && isFree(e, n)) sites.push([e, n]);
    }
    if (sites.length === i) sites.push([spawn[0] + Math.cos(angle) * 12, spawn[1] + Math.sin(angle) * 12]);
  }
  return sites;
}

export function createInvasion(world, { count = 5, seed = 7, isFree = () => true, groundAt = () => 0 } = {}) {
  const sites = landingSites(world, count, isFree, seed);
  // Face the walk spawn, or the district centre when a world has none.
  const [west, south, east, north] = world.bounds_m, aim = world.walkSpawn ?? [(west + east) / 2, (south + north) / 2];
  return {
    phase: 'active', elapsed: 0, cooldown: 0, banished: 0, abducted: [], events: [],
    aliens: sites.map((site, index) => ({ id: `alien-${index}`, position: [site[0], site[1], groundAt(site[0], site[1])], heading: Math.atan2(aim[0] - site[0], aim[1] - site[1]), speed: 0, distance: 0, status: 'landing', progress: 0, targetId: null })),
    spells: [],
  };
}

function steer(alien, target, dt, isFree, groundAt) {
  const desired = Math.atan2(target[0] - alien.position[0], target[1] - alien.position[1]);
  for (const offset of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
    const heading = desired + offset, step = ALIEN_SPEED * dt;
    const e = alien.position[0] + Math.sin(heading) * step, n = alien.position[1] + Math.cos(heading) * step;
    if (!isFree(e, n)) continue;
    alien.heading = heading; alien.position = [e, n, groundAt(e, n)]; alien.speed = ALIEN_SPEED; alien.distance += step;
    return true;
  }
  alien.speed = 0; return false;
}

export function stepInvasion(state, dt, { isFree = () => true, groundAt = () => 0, residents = [], player = null } = {}) {
  if (state.phase !== 'active' || !(dt > 0)) return state;
  state.elapsed += dt; state.cooldown = Math.max(0, state.cooldown - dt); state.events = [];
  const prey = residents.filter(local => !local.indoor && !local.abducted && local.position?.slice(0, 2).every(Number.isFinite));
  for (const alien of state.aliens) {
    if (alien.status === 'landing') { alien.progress = Math.min(1, alien.progress + dt / LANDING_SECONDS); if (alien.progress >= 1) { alien.status = 'roaming'; alien.progress = 0; state.events.push({ type: 'landed', id: alien.id }); } continue; }
    if (alien.status === 'banished') { alien.progress = Math.min(1, alien.progress + dt / BANISH_SECONDS); if (alien.progress >= 1) alien.status = 'gone'; continue; }
    if (alien.status === 'gone') continue;
    // A magical visitor nearby draws the crew off the neighbors: they close in and menace her.
    const threat = player && MAGIC_FORMS.includes(player.form) && distance2(player.position, alien.position) <= MENACE_RANGE ? player : null;
    if (threat) {
      const gap = distance2(threat.position, alien.position);
      alien.targetId = 'player';
      if (gap <= MENACE_STANDOFF) { alien.status = 'menacing'; alien.speed = 0; alien.progress = 0; alien.heading = Math.atan2(threat.position[0] - alien.position[0], threat.position[1] - alien.position[1]); }
      else { if (alien.status !== 'roaming') { alien.status = 'roaming'; alien.progress = 0; } steer(alien, threat.position, dt, isFree, groundAt); }
      continue;
    }
    if (alien.status === 'menacing') { alien.status = 'roaming'; alien.targetId = null; }
    // Another crew member may have finished beaming someone earlier this step.
    let target = prey.find(local => local.id === alien.targetId && !local.abducted);
    if (!target || alien.status === 'roaming') {
      target = prey.reduce((best, local) => local.abducted ? best : (!best || distance2(local.position, alien.position) < distance2(best.position, alien.position)) ? local : best, null);
      alien.targetId = target?.id ?? null;
    }
    if (!target) { alien.speed = 0; alien.status = 'roaming'; continue; }
    const gap = distance2(target.position, alien.position);
    if (gap <= ABDUCT_RANGE) {
      alien.status = 'abducting'; alien.speed = 0; alien.heading = Math.atan2(target.position[0] - alien.position[0], target.position[1] - alien.position[1]);
      alien.progress = Math.min(1, alien.progress + dt / BEAM_SECONDS);
      if (alien.progress >= 1) { if (!target.abducted) state.abducted.push(target.id); target.abducted = true; state.events.push({ type: 'abducted', id: target.id, alien: alien.id }); alien.status = 'roaming'; alien.progress = 0; alien.targetId = null; }
    } else {
      if (alien.status === 'abducting') { alien.status = 'roaming'; alien.progress = 0; }
      steer(alien, target.position, dt, isFree, groundAt);
    }
  }
  for (const spell of state.spells) {
    spell.position = [spell.position[0] + spell.velocity[0] * dt, spell.position[1] + spell.velocity[1] * dt, spell.position[2] + spell.velocity[2] * dt];
    spell.ttl -= dt;
    const hit = state.aliens.find(alien => ['roaming', 'abducting', 'menacing'].includes(alien.status) && distance2(alien.position, spell.position) < HIT_RADIUS && Math.abs(alien.position[2] + 1 - spell.position[2]) < 2.2);
    if (hit) { hit.status = 'banished'; hit.progress = 0; hit.speed = 0; state.banished++; spell.ttl = 0; state.events.push({ type: 'banished', id: hit.id }); }
  }
  state.spells = state.spells.filter(spell => spell.ttl > 0);
  // Won once the last banished crew member has risen into the saucer, so the
  // finale plays before the scenario tears the invaders down.
  if (state.aliens.every(alien => alien.status === 'gone')) { state.phase = 'won'; state.events.push({ type: 'won' }); }
  else if (state.abducted.length >= RESIDENTS_LOST_LIMIT) { state.phase = 'lost'; state.events.push({ type: 'lost' }); for (const alien of state.aliens) if (!['banished', 'gone'].includes(alien.status)) { alien.status = 'banished'; alien.progress = 0; } }
  return state;
}

// A bolt leaves the caster toward the nearest crew member in range and in sight.
export function castSpell(state, player, { canSee = () => true } = {}) {
  if (state.phase !== 'active' || !canCast(player?.form) || state.cooldown > 0) return null;
  const from = player.position;
  const target = state.aliens.filter(alien => ['roaming', 'abducting', 'menacing'].includes(alien.status) && distance2(alien.position, from) <= SPELL_RANGE && canSee(alien.position))
    .sort((a, b) => distance2(a.position, from) - distance2(b.position, from))[0];
  if (!target) return null;
  const origin = [from[0], from[1], from[2] + 1.15], aim = [target.position[0], target.position[1], target.position[2] + 1.1];
  const length = Math.hypot(aim[0] - origin[0], aim[1] - origin[1], aim[2] - origin[2]) || 1;
  state.spells.push({ id: `spell-${state.elapsed.toFixed(3)}-${state.spells.length}`, position: origin, velocity: aim.map((v, i) => (v - origin[i]) / length * SPELL_SPEED), ttl: length / SPELL_SPEED + 0.15, form: player.form });
  state.cooldown = SPELL_COOLDOWN;
  return target.id;
}

// Everyone beamed aboard comes home when the saucers leave, however it ended.
export function releaseResidents(state, residents = []) {
  for (const local of residents) if (local.abducted) delete local.abducted;
  state.abducted = [];
}
