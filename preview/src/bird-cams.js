import * as THREE from 'three';

// Bird cams: a few city birds that Jev flies over the district on autopilot,
// circling whatever is happening — a conversation, a neighbour helping, a
// player — then moving on. Anyone can ride along through a bird's eyes and
// take the controls; handing back to Jev resumes from wherever the bird is.
// Scene space: x east, z = -north, y up. Heading 0 looks toward -z (north).

export const BIRDS = [
  { id: 'dove', name: 'Mourning dove', body: '#b8ada2', wing: '#9a8e84', accent: '#c7a6a2', beak: '#3a3330' },
  { id: 'jay', name: 'Blue jay', body: '#4d7fb6', wing: '#3d6797', accent: '#eef1f4', beak: '#1f2328' },
  { id: 'cardinal', name: 'Cardinal', body: '#b8352f', wing: '#9b2b27', accent: '#2a1b1a', beak: '#e09a3b' },
];
export const BIRD_FLIGHT = { cruise: 9, minSpeed: 4, maxSpeed: 16, turnRate: 1.1, climbRate: 4, verticalAcceleration: 6, cruiseClearance: 15, watchClearance: 9, minClearance: 3, orbitRadius: 13, lookahead: 10 };
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const forwardOf = heading => [-Math.sin(heading), -Math.cos(heading)];
const headingTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[2] - from[2]));

// What is worth watching right now, highest first. Interests are
// { id, label, position: [east, north], weight }.
export function chooseInterest(bird, interests, { random = Math.random, recent = [] } = {}) {
  let best = null, bestScore = -Infinity;
  for (const item of interests) {
    if (!Array.isArray(item.position) || !item.position.every(Number.isFinite)) continue;
    const distance = Math.hypot(item.position[0] - bird.position[0], -item.position[1] - bird.position[2]);
    const score = item.weight / (1 + distance / 80) * (recent.includes(item.id) ? .25 : 1) * (.85 + random() * .3);
    if (score > bestScore) { best = item; bestScore = score; }
  }
  return best;
}

// The lowest height at (x, z) that clears every rooftop, from a floor up.
export function clearAltitude(environment, x, z, floor, ceiling) {
  for (let y = floor; y < ceiling; y += 1.5) if (environment.canFly(x, y, z)) return y;
  return ceiling;
}

export function createBird(spec, position, heading = 0) {
  return { ...spec, position: [...position], heading, pitch: 0, bank: 0, verticalSpeed: 0, blocked: false, hintIndex: 0, speed: BIRD_FLIGHT.cruise, flap: 0, mode: 'jev', target: null, phase: 'transit', until: 0, recent: [], lookYaw: 0, lookPitch: 0 };
}

// One flight step. control (manual only): { turn, climb, throttle } in -1..1.
export function stepBird(bird, delta, { environment, interests = [], control = null, now = 0, random = Math.random, pathHints = {} }) {
  if (!Number.isFinite(delta) || delta <= 0) return bird;
  const dt = clamp(delta, 0, .1), F = BIRD_FLIGHT, [x, y, z] = bird.position;
  // flightCeiling is a height above the ground; canFly takes absolute heights.
  const ground = environment.groundAt(x, z), ceiling = ground + (environment.flightCeiling ?? 40);
  let desiredHeading = bird.heading, desiredAltitude = ground + F.cruiseClearance, desiredSpeed = F.cruise;
  if (bird.mode === 'manual' && control) {
    desiredHeading = bird.heading + clamp(control.turn ?? 0, -1, 1) * F.turnRate * 1.3 * dt * 4;
    desiredAltitude = y + clamp(control.climb ?? 0, -1, 1) * F.climbRate;
    desiredSpeed = F.cruise + clamp(control.throttle ?? 0, -1, 1) * (control.throttle > 0 ? F.maxSpeed - F.cruise : F.cruise - F.minSpeed);
  } else {
    if (!bird.target || now > bird.until && bird.phase === 'watch') {
      const next = chooseInterest(bird, interests, { random, recent: bird.recent });
      bird.target = next; bird.hintIndex = 0; bird.phase = 'transit'; bird.until = Infinity;
      if (next) bird.recent = [next.id, ...bird.recent].slice(0, 4);
    }
    if (bird.target) {
      const live = interests.find(item => item.id === bird.target.id);
      if (live) bird.target = live;
      const [east, north] = bird.target.position, distance = Math.hypot(east - x, -north - z);
      const hints = Array.isArray(pathHints[bird.target.id]) ? pathHints[bird.target.id].slice(0, 64).filter(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) : [];
      let hint = hints[bird.hintIndex];
      const hintReach = Math.max(3, F.minSpeed / F.turnRate + .25);
      if (hint && Math.hypot(hint[0] - x, hint[2] - z) < hintReach) hint = hints[++bird.hintIndex];
      if (bird.phase === 'transit' && !hint && distance < F.orbitRadius * 1.4) { bird.phase = 'watch'; bird.until = now + 12000 + random() * 8000; }
      if (bird.phase === 'watch') {
        // Circle the scene: fly along the tangent, steering in or out by how far
        // the bird is from the orbit radius.
        const rx = (x - east) / Math.max(distance, 1e-3), rz = (z + north) / Math.max(distance, 1e-3), correction = clamp((distance - F.orbitRadius) / F.orbitRadius, -1, 1);
        const dx = -rz - rx * correction, dz = rx - rz * correction;
        desiredHeading = Math.atan2(-dx, -dz);
        desiredAltitude = environment.groundAt(east, -north) + F.watchClearance; desiredSpeed = F.cruise * .8;
      } else {
        desiredHeading = headingTo(bird.position, hint ?? [east, 0, -north]);
        if (hint) {
          desiredAltitude = hint[1];
          // Slow into a node so the cruise turning circle cannot trap it inside.
          desiredSpeed = Math.min(F.cruise, Math.max(F.minSpeed, Math.hypot(hint[0] - x, hint[2] - z) * .5));
        }
      }
    }
    // Stay inside the district: turn back toward the middle near its edge.
    const [west, southZ, east, northZ] = environment.bounds ?? [-Infinity, -Infinity, Infinity, Infinity];
    const margin = 18;
    if (x < west + margin || x > east - margin || z < Math.min(southZ, northZ) + margin || z > Math.max(southZ, northZ) - margin) desiredHeading = headingTo(bird.position, [(west + east) / 2, 0, (southZ + northZ) / 2]);
  }
  // Jev rises ahead of the buildings on its path, so the view clears the
  // rooftops instead of scraping across them.
  if (bird.mode !== 'manual' && environment.canFly) {
    const [ax, az] = forwardOf(bird.heading);
    for (const reach of [0, 6, 15, 25]) desiredAltitude = Math.max(desiredAltitude, clearAltitude(environment, x + ax * reach, z + az * reach, ground + F.minClearance, ceiling) + 3);
  }
  // Rooftops ahead: climb over them rather than through.
  const [fx, fz] = forwardOf(bird.heading);
  // Sample the corridor: two distant endpoints can both miss a narrow stem.
  for (let reach = .5; reach <= F.lookahead; reach += .5) {
    if (environment.canFly && !environment.canFly(x + fx * reach, y, z + fz * reach)) {
      desiredAltitude = Math.max(desiredAltitude, y + 6);
      if (bird.mode !== 'manual') desiredSpeed = Math.min(desiredSpeed, F.cruise * .7);
      break;
    }
  }
  // A grazing contact may fall between forward samples. Keep climbing until
  // the swept movement clears it, using the same bounded vertical controller.
  if (bird.blocked) desiredAltitude = Math.max(desiredAltitude, y + 6);
  desiredAltitude = clamp(desiredAltitude, ground + F.minClearance, ceiling);
  const turn = clamp(wrap(desiredHeading - bird.heading), -F.turnRate * dt, F.turnRate * dt);
  bird.heading = wrap(bird.heading + turn);
  bird.bank += (clamp(-turn / Math.max(dt, 1e-3) * .55, -.7, .7) - bird.bank) * (1 - Math.exp(-4 * dt));
  bird.speed += (clamp(desiredSpeed, F.minSpeed, F.maxSpeed) - bird.speed) * (1 - Math.exp(-1.5 * dt));
  // Bound velocity and acceleration, not displacement before an exponential gain.
  const error = desiredAltitude - y;
  const wantedVertical = Math.sign(error) * Math.min(F.climbRate, Math.abs(error) * 2, Math.sqrt(2 * F.verticalAcceleration * Math.abs(error)));
  bird.verticalSpeed += clamp(wantedVertical - bird.verticalSpeed, -F.verticalAcceleration * dt, F.verticalAcceleration * dt);
  const vertical = bird.verticalSpeed;
  bird.pitch += (clamp(Math.atan2(vertical, bird.speed), -.6, .6) - bird.pitch) * (1 - Math.exp(-3 * dt));
  const [nx, nz] = forwardOf(bird.heading), step = bird.speed * dt;
  let next = [x + nx * step, clamp(y + vertical * dt, ground + F.minClearance, ceiling), z + nz * step];
  // Never fly into a building: hold position and climb instead.
  const clearSegment = to => {
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - x, to[1] - y, to[2] - z) / .2));
    for (let i = 1; i <= steps; i++) if (environment.canFly && !environment.canFly(x + (to[0] - x) * i / steps, y + (to[1] - y) * i / steps, z + (to[2] - z) * i / steps)) return false;
    return true;
  };
  bird.blocked = !clearSegment(next);
  if (bird.blocked) {
    const rise = [x, Math.min(ceiling, y + Math.max(0, vertical) * dt), z];
    next = clearSegment(rise) ? rise : [x, y, z];
  }
  bird.position = next;
  bird.flap += dt * (vertical > .5 || bird.speed > F.cruise * 1.2 ? 15 : bird.phase === 'watch' ? 5 : 9);
  return bird;
}

function birdModel(spec) {
  const group = new THREE.Group(); group.name = `${spec.name} (bird cam)`;
  const material = (color, roughness = .8) => new THREE.MeshStandardMaterial({ color, roughness });
  const body = material(spec.body), wing = material(spec.wing), accent = material(spec.accent), beak = material(spec.beak, .5), eye = material('#111111', .2);
  const mesh = (geometry, surface, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => { const item = new THREE.Mesh(geometry, surface); item.position.set(...position); item.scale.set(...scale); item.rotation.set(...rotation); item.castShadow = true; group.add(item); return item; };
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  mesh(sphere, body, [0, 0, 0], [.085, .075, .17]);
  mesh(sphere, accent, [0, -.02, -.06], [.07, .055, .1]);
  mesh(sphere, body, [0, .05, -.15], [.06, .058, .062]);
  for (const side of [-1, 1]) mesh(sphere, eye, [side * .04, .065, -.185], [.011, .011, .011]);
  mesh(new THREE.ConeGeometry(.018, .06, 8), beak, [0, .045, -.225], [1, 1, 1], [-Math.PI / 2, 0, 0]);
  mesh(new THREE.BoxGeometry(.11, .012, .14), wing, [0, .01, .2], [1, 1, 1], [.12, 0, 0]);
  const wings = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * .06, .03, -.02); group.add(pivot);
    const shape = new THREE.Shape(); shape.moveTo(0, -.07); shape.quadraticCurveTo(side * .2, -.11, side * .34, .02); shape.quadraticCurveTo(side * .2, .07, 0, .07); shape.lineTo(0, -.07);
    const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(-Math.PI / 2);
    const blade = new THREE.Mesh(geometry, wing); blade.material.side = THREE.DoubleSide; blade.castShadow = true; pivot.add(blade);
    return pivot;
  });
  group.userData.wings = wings;
  return group;
}

export function createBirdCams({ scene, camera, host, getEnvironment, getInterests, getPathHints = () => ({}), now = () => performance.now(), random = Math.random }) {
  const flock = [], models = [];
  let riding = null, transition = 0, control = { turn: 0, climb: 0, throttle: 0 }, keys = new Set(), started = false;
  const from = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };
  const listeners = new Set(), emit = () => { for (const listener of listeners) listener(api.state); };
  function start(environment) {
    if (started || !environment) return;
    started = true;
    const [west, z0, east, z1] = environment.bounds;
    BIRDS.forEach((spec, index) => {
      const x = west + (east - west) * (.3 + index * .2), z = z0 + (z1 - z0) * (.4 + index * .1);
      const ground = environment.groundAt(x, z), clear = clearAltitude(environment, x, z, ground + BIRD_FLIGHT.minClearance, ground + environment.flightCeiling);
      const bird = createBird(spec, [x, Math.max(ground + BIRD_FLIGHT.cruiseClearance, clear + 4), z], index * 2.1);
      const model = birdModel(spec); scene.add(model); flock.push(bird); models.push(model);
    });
    emit();
  }
  const manualKeys = { KeyW: 'throttle+', ArrowUp: 'throttle+', KeyS: 'throttle-', ArrowDown: 'throttle-', KeyA: 'turn+', ArrowLeft: 'turn+', KeyD: 'turn-', ArrowRight: 'turn-', Space: 'climb+', KeyC: 'climb-', ShiftLeft: 'climb-', ShiftRight: 'climb-' };
  const typing = event => event.target.closest?.('input, textarea, select, [contenteditable]');
  document.addEventListener('keydown', event => {
    if (!riding || typing(event)) return;
    if (event.code === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); api.land(); return; }
    if (event.code === 'KeyT' && !event.repeat) { event.preventDefault(); api.toggleControl(); return; }
    if (event.code === 'KeyN' && !event.repeat) { event.preventDefault(); api.next(); return; }
    if (manualKeys[event.code]) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (riding.mode !== 'manual') { riding.mode = 'manual'; emit(); }
      keys.add(event.code);
    }
  }, true);
  document.addEventListener('keyup', event => keys.delete(event.code), true);
  window.addEventListener('blur', () => keys.clear());
  // Drag looks around from the bird without changing its course.
  let drag = null;
  host.addEventListener('pointerdown', event => { if (riding) drag = [event.clientX, event.clientY]; }, true);
  host.addEventListener('pointermove', event => {
    if (!riding || !drag) return;
    riding.lookYaw = clamp(riding.lookYaw - (event.clientX - drag[0]) * .004, -2.4, 2.4);
    riding.lookPitch = clamp(riding.lookPitch - (event.clientY - drag[1]) * .004, -1.2, .6);
    drag = [event.clientX, event.clientY];
  }, true);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(type, () => { drag = null; }, true);
  function readControl() {
    const has = (...codes) => codes.some(code => keys.has(code));
    control = { turn: (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0), climb: (has('Space') ? 1 : 0) - (has('KeyC', 'ShiftLeft', 'ShiftRight') ? 1 : 0), throttle: (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0) };
  }
  const eye = new THREE.Vector3(), look = new THREE.Euler(0, 0, 0, 'YXZ'), target = new THREE.Quaternion();
  const api = {
    get birds() { return flock; },
    get riding() { return riding; },
    get state() { return { started, riding: riding ? { id: riding.id, name: riding.name, mode: riding.mode, watching: riding.target?.label ?? null, phase: riding.phase } : null, birds: flock.map(bird => ({ id: bird.id, name: bird.name, mode: bird.mode, watching: bird.target?.label ?? null, position: bird.position.map(v => +v.toFixed(2)), speed: +bird.speed.toFixed(2) })) }; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ride(id) {
      const bird = flock.find(item => item.id === id) ?? flock[0];
      if (!bird) return false;
      if (!riding) { from.position.copy(camera.position); from.quaternion.copy(camera.quaternion); transition = 0; }
      if (riding && riding !== bird) riding.mode = 'jev';
      riding = bird; bird.lookYaw = 0; bird.lookPitch = 0; keys.clear(); emit(); return true;
    },
    next() { if (!flock.length) return; const index = riding ? (flock.indexOf(riding) + 1) % flock.length : 0; api.ride(flock[index].id); },
    toggleControl() { if (!riding) return; riding.mode = riding.mode === 'manual' ? 'jev' : 'manual'; if (riding.mode === 'jev') { riding.target = null; keys.clear(); } emit(); },
    land() { if (!riding) return; riding.mode = 'jev'; riding = null; keys.clear(); emit(); },
    update(delta) {
      const environment = getEnvironment();
      if (!started) start(environment);
      if (!started) return false;
      const interests = getInterests(), time = now();
      readControl();
      let changed = false;
      for (const bird of flock) {
        const before = `${bird.mode}:${bird.target?.id}:${bird.phase}`;
        stepBird(bird, delta, { environment, interests, control: bird === riding && bird.mode === 'manual' ? control : null, now: time, random, pathHints: getPathHints() });
        if (`${bird.mode}:${bird.target?.id}:${bird.phase}` !== before) changed = true;
      }
      flock.forEach((bird, index) => {
        const model = models[index];
        model.position.fromArray(bird.position); model.rotation.set(bird.pitch, bird.heading, bird.bank, 'YXZ');
        const beat = Math.sin(bird.flap) * (bird.phase === 'watch' && bird.mode !== 'manual' ? .35 : .7);
        model.userData.wings.forEach((wing, side) => { wing.rotation.z = (side ? -1 : 1) * beat; });
        model.visible = bird !== riding || transition < 1;
      });
      if (changed) emit();
      if (!riding) return false;
      // Through the bird's eyes: just ahead of the beak, gazing slightly down.
      const [fx, fz] = forwardOf(riding.heading);
      eye.set(riding.position[0] + fx * .3, riding.position[1] + .07, riding.position[2] + fz * .3);
      look.set(clamp(riding.pitch * .6 - .2 + riding.lookPitch, -1.4, .9), riding.heading + riding.lookYaw, riding.bank * .35);
      target.setFromEuler(look);
      transition = Math.min(1, transition + delta / .8);
      const ease = transition * transition * (3 - 2 * transition);
      camera.position.lerpVectors(from.position, eye, ease); camera.quaternion.slerpQuaternions(from.quaternion, target, ease);
      return true;
    },
    dispose() { for (const model of models) model.removeFromParent(); flock.length = 0; models.length = 0; listeners.clear(); },
  };
  return api;
}
