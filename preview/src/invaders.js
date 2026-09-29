import * as THREE from 'three';
import { loadResidentAvatar } from './avatars.js';
import { applyAlienSpecies } from './alien-species.js';
import { LANDING_ALTITUDE } from './invasion.js';

// A saucer in metres: the flight prop from the earlier alien visitor, now the crew's ride.
function saucer(owned) {
  const group = new THREE.Group();
  const material = (color, extra = {}) => { const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, ...extra }); owned.add(value); return value; };
  const mesh = (geometry, surface, position, rotation = [0, 0, 0]) => { owned.add(geometry); const object = new THREE.Mesh(geometry, surface); object.position.fromArray(position); object.rotation.set(...rotation); object.castShadow = true; group.add(object); return object; };
  const metal = material('#8da0b8', { metalness: 0.85, roughness: 0.3 }), light = material('#84eefa', { emissive: '#34d7fc', emissiveIntensity: 1.4 });
  const hull = mesh(new THREE.SphereGeometry(1, 48, 20), metal, [0, 0.12, 0]); hull.scale.set(1.05, 0.19, 1.05);
  const lower = mesh(new THREE.SphereGeometry(1, 32, 16), material('#203349', { metalness: 0.7 }), [0, -0.015, 0]); lower.scale.set(0.65, 0.16, 0.65);
  mesh(new THREE.TorusGeometry(0.91, 0.025, 8, 64), light, [0, 0.17, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) { const angle = i / 8 * Math.PI * 2; const lamp = mesh(new THREE.SphereGeometry(0.045, 12, 8), light, [Math.cos(angle) * 0.84, 0.04, Math.sin(angle) * 0.84]); lamp.castShadow = false; }
  const canopy = mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), material('#bfe5f3', { transparent: true, opacity: 0.15, depthWrite: false, roughness: 0.12, metalness: 0.25, clearcoat: 1 }), [0, 0.28, 0]); canopy.scale.set(0.72, 1.75, 0.72); canopy.castShadow = false;
  const beam = mesh(new THREE.CylinderGeometry(0.35, 1.1, 1, 32, 1, true), material('#9ff3ff', { transparent: true, opacity: 0.28, emissive: '#5fe6ff', emissiveIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide }), [0, -0.5, 0]); beam.castShadow = false; beam.visible = false;
  group.userData.beam = beam; group.scale.setScalar(1.6);
  return group;
}

// Aliens, saucers, abduction beams and spell bolts, driven by the simulation state.
// Heights above the ground: the saucer hovers SAUCER_HEIGHT above its landing
// point plus any hover, and the crew member is drawn up into it when banished,
// meeting the saucer as the banish completes.
export const SAUCER_HEIGHT = 2.9;
export function liftHeights(status, progress) {
  const hover = status === 'landing' ? (1 - progress) * LANDING_ALTITUDE : status === 'banished' ? progress * progress * LANDING_ALTITUDE : status === 'gone' ? LANDING_ALTITUDE : 0;
  const crew = status === 'landing' ? Math.max(0, (0.85 - progress) / 0.3) * SAUCER_HEIGHT : status === 'banished' ? progress * progress * (SAUCER_HEIGHT + LANDING_ALTITUDE) : 0;
  return { hover, saucer: SAUCER_HEIGHT + hover, crew };
}

export function createInvaders({ scene, world, groundAt }) {
  const holder = new THREE.Group(); holder.name = 'Invasion'; scene.add(holder);
  const owned = new Set(), crew = new Map(), bolts = new Map();
  const boltGeometry = new THREE.SphereGeometry(0.22, 16, 12), haloGeometry = new THREE.SphereGeometry(0.55, 16, 12); owned.add(boltGeometry); owned.add(haloGeometry);
  const boltMaterials = { jevica: new THREE.MeshStandardMaterial({ color: '#ffd8ee', emissive: '#ff5fb8', emissiveIntensity: 2.4 }) };
  const haloMaterials = { jevica: new THREE.MeshBasicMaterial({ color: '#ff8fd0', transparent: true, opacity: 0.35, depthWrite: false }) };
  [...Object.values(boltMaterials), ...Object.values(haloMaterials)].forEach(material => owned.add(material));
  let disposed = false, generation = 0;
  const spawn = async (alien, index, thisGeneration) => {
    const entry = { object: new THREE.Group(), avatar: null, saucer: saucer(owned), species: null };
    entry.object.add(entry.saucer); holder.add(entry.object); crew.set(alien.id, entry);
    try {
      const avatar = await loadResidentAvatar(index, alien.id, undefined, { folk: false });
      if (disposed || thisGeneration !== generation) { avatar.dispose(); return; }
      entry.species = applyAlienSpecies(avatar.rig, alien.id).name; entry.avatar = avatar; entry.object.add(avatar.object);
    } catch (error) { entry.error = error?.message ?? String(error); /* the saucer still lands; the crew member stays aboard */ }
  };
  return {
    begin(state) {
      this.clear(); generation++;
      state.aliens.forEach((alien, index) => spawn(alien, index % 6, generation));
    },
    sync(state, now, delta) {
      for (const alien of state.aliens) {
        const entry = crew.get(alien.id); if (!entry) continue;
        const ground = groundAt(alien.position[0], alien.position[1]);
        const {hover, crew: crewLift} = liftHeights(alien.status, alien.progress);
        entry.object.position.set(alien.position[0], ground, -alien.position[1]);
        entry.object.rotation.y = alien.heading;
        entry.object.visible = alien.status !== 'gone';
        const reeling = alien.status === 'banished' ? Math.sin(alien.progress * Math.PI) : 0;
        entry.saucer.position.set(reeling * 0.6, SAUCER_HEIGHT + hover, 0); entry.saucer.rotation.y += delta * (0.9 + reeling * 12); entry.saucer.rotation.z = reeling * 0.55;
        entry.saucer.userData.beam.visible = alien.status === 'abducting';
        if (alien.status === 'abducting') { const beam = entry.saucer.userData.beam; beam.scale.y = 1.6 + alien.progress * 0.2; beam.material.opacity = 0.2 + 0.25 * Math.abs(Math.sin(now / 160)); }
        if (entry.avatar) {
          entry.avatar.object.visible = alien.status !== 'landing' || alien.progress > 0.55;
          entry.avatar.object.position.y = crewLift;
          // The spell spins the crew member and pitches them over before the saucer swallows them.
          entry.avatar.object.rotation.set(alien.status === 'banished' ? alien.progress * 1.2 : 0, alien.status === 'banished' ? entry.avatar.object.rotation.y + delta * (6 + alien.progress * 30) : 0, alien.status === 'banished' ? Math.sin(alien.progress * Math.PI * 3) * 0.35 : 0);
          entry.avatar.update(now, alien.status === 'abducting' ? 'greet' : alien.status === 'menacing' ? 'startled' : alien.status === 'banished' ? 'amazed' : 'continue', false, { speed: alien.speed, distance: alien.distance }, () => ground);
        }
      }
      for (const [id, bolt] of bolts) if (!state.spells.some(spell => spell.id === id)) { bolt.removeFromParent(); bolts.delete(id); }
      for (const spell of state.spells) {
        let bolt = bolts.get(spell.id);
        if (!bolt) {
          bolt = new THREE.Mesh(boltGeometry, boltMaterials[spell.form] ?? boltMaterials.jevica); bolt.castShadow = false;
          const halo = new THREE.Mesh(haloGeometry, haloMaterials[spell.form] ?? haloMaterials.jevica); halo.castShadow = false; bolt.add(halo);
          const light = new THREE.PointLight(spell.form === 'witch' ? '#9dff5a' : '#ff86d0', 18, 14, 1.8); bolt.add(light);
          holder.add(bolt); bolts.set(spell.id, bolt);
        }
        bolt.position.set(spell.position[0], spell.position[2], -spell.position[1]);
        bolt.scale.setScalar(1 + 0.3 * Math.sin(now / 30)); bolt.rotation.y += delta * 14; bolt.rotation.x += delta * 9;
      }
    },
    clear() { for (const entry of crew.values()) { entry.avatar?.dispose(); entry.object.removeFromParent(); } crew.clear(); for (const bolt of bolts.values()) bolt.removeFromParent(); bolts.clear(); },
    get crew() { return [...crew.entries()].map(([id, entry]) => ({ id, species: entry.species, ready: Boolean(entry.avatar), error: entry.error ?? null })); },
    dispose() { disposed = true; this.clear(); owned.forEach(item => item.dispose()); holder.removeFromParent(); },
  };
}
