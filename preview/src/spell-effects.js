import * as THREE from 'three';

// Spell effects for the invasion: a burst at the caster's hand, a comet trail
// behind each bolt and a shockwave where an alien is banished. The particle
// maths is pure so it can be tested; the Three.js layer only draws the pool.

export const SPELL_PALETTES = {
  witch: { core: [2.2, 3.0, 1.1], spark: [1.4, 3.0, 0.6], smoke: [0.5, 0.25, 0.7], light: '#9dff5a' },
  jevica: { core: [3.0, 1.6, 2.4], spark: [3.0, 2.3, 1.0], smoke: [2.4, 0.9, 1.8], light: '#ff86d0' },
};
export const paletteFor = form => SPELL_PALETTES[form] ?? SPELL_PALETTES.jevica;

// Deterministic randomness so a burst can be reproduced in a test.
const random = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// Particles carry position, velocity, remaining life, colour and size; gravity and drag shape the arc.
export function createPool(capacity = 900) {
  return { capacity, count: 0, position: new Float32Array(capacity * 3), velocity: new Float32Array(capacity * 3), life: new Float32Array(capacity), age: new Float32Array(capacity), color: new Float32Array(capacity * 3), size: new Float32Array(capacity), gravity: new Float32Array(capacity), drag: new Float32Array(capacity) };
}

export function emit(pool, { position, velocity, life, color, size, gravity = 0, drag = 1 }) {
  if (pool.count >= pool.capacity) return false;
  const i = pool.count++;
  pool.position.set(position, i * 3); pool.velocity.set(velocity, i * 3); pool.color.set(color, i * 3);
  pool.life[i] = life; pool.age[i] = 0; pool.size[i] = size; pool.gravity[i] = gravity; pool.drag[i] = drag;
  return true;
}

// Advance every particle; dead ones are swapped out from the tail so the live set stays packed.
export function stepPool(pool, dt) {
  for (let i = 0; i < pool.count;) {
    pool.age[i] += dt;
    if (pool.age[i] >= pool.life[i]) { const last = --pool.count; if (i !== last) copyParticle(pool, last, i); continue; }
    const damping = Math.exp(-pool.drag[i] * dt);
    pool.velocity[i * 3] *= damping; pool.velocity[i * 3 + 1] = pool.velocity[i * 3 + 1] * damping - pool.gravity[i] * dt; pool.velocity[i * 3 + 2] *= damping;
    pool.position[i * 3] += pool.velocity[i * 3] * dt; pool.position[i * 3 + 1] += pool.velocity[i * 3 + 1] * dt; pool.position[i * 3 + 2] += pool.velocity[i * 3 + 2] * dt;
    i++;
  }
  return pool.count;
}

function copyParticle(pool, from, to) {
  for (let k = 0; k < 3; k++) { pool.position[to * 3 + k] = pool.position[from * 3 + k]; pool.velocity[to * 3 + k] = pool.velocity[from * 3 + k]; pool.color[to * 3 + k] = pool.color[from * 3 + k]; }
  pool.life[to] = pool.life[from]; pool.age[to] = pool.age[from]; pool.size[to] = pool.size[from]; pool.gravity[to] = pool.gravity[from]; pool.drag[to] = pool.drag[from];
}

// Burst recipes in metres: `cast` leaves the hand, `trail` follows a bolt, `impact` tears an alien off the ground.
export function burst(pool, kind, form, origin, { direction = [0, 0, 1], seed = 1, scale = 1 } = {}) {
  const palette = paletteFor(form), next = random(seed), before = pool.count;
  const spread = (magnitude) => [(next() - 0.5) * 2 * magnitude, (next() - 0.5) * 2 * magnitude, (next() - 0.5) * 2 * magnitude];
  if (kind === 'cast') {
    for (let i = 0; i < 36 * scale; i++) {
      const jitter = spread(2.2), speed = 3 + next() * 4;
      emit(pool, { position: origin, velocity: [direction[0] * speed + jitter[0], direction[1] * speed + jitter[1] + 1, direction[2] * speed + jitter[2]], life: 0.35 + next() * 0.3, color: next() < 0.7 ? palette.spark : palette.core, size: 0.12 + next() * 0.16, gravity: 2, drag: 3 });
    }
  } else if (kind === 'trail') {
    for (let i = 0; i < 4 * scale; i++) {
      const jitter = spread(0.9);
      emit(pool, { position: [origin[0] + jitter[0] * 0.08, origin[1] + jitter[1] * 0.08, origin[2] + jitter[2] * 0.08], velocity: [jitter[0] - direction[0] * 2, jitter[1] - direction[1] * 2 + 0.6, jitter[2] - direction[2] * 2], life: 0.45 + next() * 0.4, color: next() < 0.55 ? palette.spark : next() < 0.8 ? palette.core : palette.smoke, size: 0.08 + next() * 0.18, gravity: -0.8, drag: 4 });
    }
  } else if (kind === 'impact') {
    for (let i = 0; i < 140 * scale; i++) {
      const angle = next() * Math.PI * 2, tilt = next() * 0.9, speed = 4 + next() * 7;
      const velocity = [Math.cos(angle) * Math.cos(tilt) * speed, Math.sin(tilt) * speed + 3 + next() * 5, Math.sin(angle) * Math.cos(tilt) * speed];
      const smoke = next() < 0.3;
      emit(pool, { position: [origin[0], origin[1] + next() * 1.6, origin[2]], velocity, life: smoke ? 1.2 + next() * 0.8 : 0.6 + next() * 0.7, color: smoke ? palette.smoke : next() < 0.6 ? palette.spark : palette.core, size: smoke ? 0.5 + next() * 0.6 : 0.12 + next() * 0.2, gravity: smoke ? -1.5 : 7, drag: smoke ? 2.5 : 1.2 });
    }
    for (let i = 0; i < 40 * scale; i++) {
      // A rising spiral pulls the alien skyward.
      const angle = next() * Math.PI * 2, radius = 0.6 + next() * 0.8;
      emit(pool, { position: [origin[0] + Math.cos(angle) * radius, origin[1] + next() * 0.4, origin[2] + Math.sin(angle) * radius], velocity: [-Math.sin(angle) * 3, 6 + next() * 6, Math.cos(angle) * 3], life: 1 + next() * 0.6, color: palette.core, size: 0.16 + next() * 0.14, gravity: -4, drag: 0.6 });
    }
  }
  return pool.count - before;
}

const vertexShader = `
  attribute float size; attribute float alpha; varying vec3 vColor; varying float vAlpha;
  void main() { vColor = color; vAlpha = alpha; vec4 view = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (420.0 / -view.z); gl_Position = projectionMatrix * view; }`;
const fragmentShader = `
  varying vec3 vColor; varying float vAlpha;
  void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float soft = smoothstep(1.0, 0.15, d); gl_FragColor = vec4(vColor * soft * vAlpha, soft * vAlpha); }`;

// Draws the pool as additive sprites plus the rings, columns and lights that give a spell weight.
export function createSpellEffects({ scene, reducedMotion = false } = {}) {
  const scale = reducedMotion ? 0.35 : 1;
  const pool = createPool(reducedMotion ? 400 : 1400);
  const holder = new THREE.Group(); holder.name = 'Spell effects'; scene.add(holder);
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.BufferAttribute(new Float32Array(pool.capacity * 3), 3), colors = new THREE.BufferAttribute(new Float32Array(pool.capacity * 3), 3), sizes = new THREE.BufferAttribute(new Float32Array(pool.capacity), 1), alphas = new THREE.BufferAttribute(new Float32Array(pool.capacity), 1);
  [positions, colors, sizes, alphas].forEach(attribute => attribute.setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('position', positions); geometry.setAttribute('color', colors); geometry.setAttribute('size', sizes); geometry.setAttribute('alpha', alphas);
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material); points.frustumCulled = false; holder.add(points);
  const ringGeometry = new THREE.RingGeometry(0.7, 1, 48), columnGeometry = new THREE.CylinderGeometry(0.9, 1.4, 12, 24, 1, true), flareGeometry = new THREE.RingGeometry(0.02, 0.5, 32);
  const transients = [], lights = [], owned = new Set([geometry, material, ringGeometry, columnGeometry, flareGeometry]);
  let counter = 0, bursts = 0, impacts = 0;
  const transient = (mesh, life, animate) => { mesh.userData = { life, age: 0, animate }; holder.add(mesh); transients.push(mesh); return mesh; };
  const flash = (position, color, intensity, life) => {
    if (reducedMotion) return;
    const light = new THREE.PointLight(color, intensity, 22, 1.6); light.position.fromArray(position); light.userData = { life, age: 0, intensity }; holder.add(light); lights.push(light);
  };
  const basic = (color, opacity) => { const value = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); owned.add(value); return value; };
  return {
    // A bolt just left the caster's hand: sparks fly forward and the hand flares.
    cast(form, origin, direction, now) {
      const palette = paletteFor(form); bursts++;
      burst(pool, 'cast', form, origin, { direction, seed: ++counter * 7919, scale });
      const flare = transient(new THREE.Mesh(flareGeometry, basic(palette.light, 0.9)), 0.28, (mesh, t) => { mesh.scale.setScalar(0.4 + t * 2.4); mesh.material.opacity = 0.9 * (1 - t); });
      flare.position.fromArray(origin); flare.lookAt(origin[0] + direction[0], origin[1] + direction[1], origin[2] + direction[2]);
      flash(origin, palette.light, 14, 0.3);
    },
    // Called each frame with the live bolts; each one sheds a comet tail.
    trail(spells, form) {
      for (const spell of spells) {
        const speed = Math.hypot(...spell.velocity) || 1;
        burst(pool, 'trail', spell.form ?? form, [spell.position[0], spell.position[2], -spell.position[1]], { direction: [spell.velocity[0] / speed, spell.velocity[2] / speed, -spell.velocity[1] / speed], seed: ++counter * 104729, scale });
      }
    },
    // The spell lands: a shockwave on the ground, a column of light and a spiral hauling the alien up.
    impact(form, position) {
      const palette = paletteFor(form); impacts++;
      burst(pool, 'impact', form, position, { seed: ++counter * 15485863, scale });
      const ring = transient(new THREE.Mesh(ringGeometry, basic(palette.light, 0.85)), 0.7, (mesh, t) => { mesh.scale.setScalar(0.3 + t * 7); mesh.material.opacity = 0.85 * (1 - t) ** 1.5; });
      ring.rotation.x = -Math.PI / 2; ring.position.set(position[0], position[1] + 0.05, position[2]);
      const column = transient(new THREE.Mesh(columnGeometry, basic(palette.light, 0.4)), 1.1, (mesh, t) => { mesh.scale.set(1 + t * 0.6, 1, 1 + t * 0.6); mesh.material.opacity = 0.4 * (1 - t) ** 2; });
      column.position.set(position[0], position[1] + 6, position[2]);
      flash([position[0], position[1] + 1.5, position[2]], palette.light, 40, 0.8);
    },
    update(delta) {
      stepPool(pool, delta);
      for (let i = 0; i < pool.count; i++) {
        const fade = 1 - pool.age[i] / pool.life[i];
        positions.array[i * 3] = pool.position[i * 3]; positions.array[i * 3 + 1] = pool.position[i * 3 + 1]; positions.array[i * 3 + 2] = pool.position[i * 3 + 2];
        colors.array[i * 3] = pool.color[i * 3]; colors.array[i * 3 + 1] = pool.color[i * 3 + 1]; colors.array[i * 3 + 2] = pool.color[i * 3 + 2];
        sizes.array[i] = pool.size[i] * (0.6 + fade * 0.6); alphas.array[i] = Math.min(1, fade * 1.6);
      }
      positions.needsUpdate = colors.needsUpdate = sizes.needsUpdate = alphas.needsUpdate = true;
      geometry.setDrawRange(0, pool.count);
      for (let i = transients.length - 1; i >= 0; i--) {
        const mesh = transients[i]; mesh.userData.age += delta;
        const t = Math.min(1, mesh.userData.age / mesh.userData.life);
        mesh.userData.animate(mesh, t);
        if (t >= 1) { mesh.removeFromParent(); mesh.material.dispose(); owned.delete(mesh.material); transients.splice(i, 1); }
      }
      for (let i = lights.length - 1; i >= 0; i--) {
        const light = lights[i]; light.userData.age += delta;
        const t = Math.min(1, light.userData.age / light.userData.life);
        light.intensity = light.userData.intensity * (1 - t) ** 2;
        if (t >= 1) { light.removeFromParent(); light.dispose(); lights.splice(i, 1); }
      }
    },
    get stats() { return { bursts, impacts, particles: pool.count, transients: transients.length + lights.length }; },
    clear() { pool.count = 0; geometry.setDrawRange(0, 0); for (const mesh of transients) { mesh.removeFromParent(); mesh.material.dispose(); owned.delete(mesh.material); } transients.length = 0; for (const light of lights) { light.removeFromParent(); light.dispose(); } lights.length = 0; },
    dispose() { this.clear(); owned.forEach(item => item.dispose()); holder.removeFromParent(); },
  };
}
