// CT Club dancers (temporary scratch tool, Val 2026-11-06).
// Loads the soma30 dance rig (public/dancer) and animates a crowd on the dancefloor.
// Each clip ships a GLB (the rig) + root_positions.f32 (root/Hips positions) +
// local_rotations_xyzw.f32 (per-bone quaternions), so we build an AnimationClip from
// the raw data and play it through an AnimationMixer (as the clip meta instructs).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const CLIPS = [
  { key: 'energetic', name: 'dance_energetic', color: '#ff6bd4' },
  { key: 'chill', name: 'dance_chill', color: '#41e0ff' },
  { key: 'head', name: 'dance_head_nodding', color: '#3dff85' },
  { key: 'arms', name: 'dance_arms', color: '#ffe142' },
  { key: 'slowly', name: 'dance_slowly', color: '#b26bff' },
  { key: 'and_drink', name: 'dance_and_drink', color: '#ff8b4d' },
  { key: 'arms_legs', name: 'dance_arms_and_legs', color: '#ff4d6f' },
  { key: 'ecstatic', name: 'dance_ecstatic', color: '#ffffff' },
  { key: 'long_ecstatic', name: 'dance_long_ecstatic', color: '#41c8ff' },
];

const fetchJson = u => fetch(u).then(r => r.json());
const fetchBuf = u => fetch(u).then(r => r.arrayBuffer());
const Y_AXIS = new THREE.Vector3(0, 1, 0);

async function loadClipData(clip) {
  const base = `dancer/${clip.name}`;
  const meta = await fetchJson(`${base}/meta.json`);
  const [root, rot] = await Promise.all([
    fetchBuf(`${base}/root_positions.f32`),
    fetchBuf(`${base}/local_rotations_xyzw.f32`),
  ]);
  return { meta, root: new Float32Array(root), rot: new Float32Array(rot) };
}

// Build a Three.js AnimationClip from the raw f32 data, binding to the skeleton's
// actual bone names so the mixer resolves the tracks.
function buildClip(data, model) {
  const { meta, root, rot } = data;
  const frames = meta.frames, fps = meta.fps;
  const joints = meta.joint_names;
  const tracks = [];
  for (let j = 0; j < joints.length; j++) {
    const bone = model.getObjectByName(joints[j]);
    const name = bone ? bone.name : joints[j];
    const times = new Float32Array(frames);
    const quats = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) {
      times[f] = f / fps;
      const i = (f * joints.length + j) * 4;
      quats[f * 4] = rot[i]; quats[f * 4 + 1] = rot[i + 1]; quats[f * 4 + 2] = rot[i + 2]; quats[f * 4 + 3] = rot[i + 3];
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats));
  }
  const hips = model.getObjectByName('Hips');
  const hipsName = hips ? hips.name : 'Hips';
  const posTimes = new Float32Array(frames);
  const posVals = new Float32Array(frames * 3);
  for (let f = 0; f < frames; f++) {
    posTimes[f] = f / fps;
    posVals[f * 3] = root[f * 3]; posVals[f * 3 + 1] = root[f * 3 + 1]; posVals[f * 3 + 2] = root[f * 3 + 2];
  }
  tracks.push(new THREE.VectorKeyframeTrack(`${hipsName}.position`, posTimes, posVals));
  return new THREE.AnimationClip(meta.name, meta.duration_s, tracks);
}

// A visible stick-figure body: a capsule along each bone→child segment. Because the
// clip GLB is skeleton-only (no mesh), this is what makes the dancers actually show up.
function buildMannequin(model, color, jointSet) {
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: new THREE.Color(color), emissiveIntensity: 0.35, roughness: 0.55, metalness: 0.1,
  });
  const joint = n => n.isBone || jointSet.has(n.name);
  model.traverse(n => {
    if (!joint(n)) return;
    for (const child of n.children) {
      if (!joint(child)) continue;
      const len = child.position.length();
      if (len < 1e-4) continue;
      const dir = child.position.clone().normalize();
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, Math.max(0.03, len), 4, 8), mat);
      mesh.position.copy(dir).multiplyScalar(len / 2);
      mesh.quaternion.setFromUnitVectors(Y_AXIS, dir);
      n.add(mesh);
    }
  });
}

// Derive a 1.75 m scale + floor offset from the skeleton's rest-pose node positions.
// (The clip GLB has no skin, so the joints are plain nodes — we key off their names.)
function skeletonScale(base, jointSet) {
  base.updateMatrixWorld(true);
  let minY = Infinity, maxY = -Infinity;
  base.traverse(n => {
    if (jointSet.has(n.name)) { const p = new THREE.Vector3(); n.getWorldPosition(p); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  });
  const height = Math.max(0.01, maxY - minY);
  return { scale: 1.75 / height, footY: minY };
}

export async function addDancers(scene, opts = {}) {
  const count = Math.max(0, Math.min(24, opts.count ?? 8));
  if (!count) return { dancers: [], tick: () => { }, toggle: () => true, setCount: () => { }, clips: [] };
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync('dancer/dance_energetic/dance_energetic.glb');
  const base = gltf.scene;

  // Build all clips from the raw f32 data, bound to the loaded skeleton's bones.
  const clips = [];
  for (const clip of CLIPS) {
    const data = await loadClipData(clip);
    clips.push({ ...clip, meta: data.meta, clip: buildClip(data, base) });
  }
  const jointSet = new Set(clips[0].meta.joint_names);

  // Scale the character to ~1.75 m from its rest-pose joint span.
  const { scale } = skeletonScale(base, jointSet);

  const dancers = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  for (let i = 0; i < count; i++) {
    const model = skeletonClone(base);
    const use = clips[i % clips.length];
    buildMannequin(model, use.color, jointSet);      // visible capsule body (the GLB is skeleton-only)
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(use.clip);
    action.play();
    const phase = Math.random();
    // Advance to a random frame so the crowd is desynced, then anchor the feet to
    // the floor at that ANIMATED pose (the clip's Hips/root track lifts the body
    // well above the rest-pose offset, so using the rest pose makes the dancers float).
    mixer.update(phase * Math.max(0.001, use.clip.duration));
    // Scatter across the dancefloor (world coords: x = a, z = -d; dancefloor spans
    // a -6.5..6.5, d 16..33 -> z -16..-33), spread evenly instead of a back cluster.
    const x = -5.5 + (i % cols) * (11 / Math.max(1, cols - 1)) + (Math.random() - 0.5) * 0.9;
    const z = -17.5 - Math.floor(i / cols) * (15 / Math.max(1, rows - 1)) + (Math.random() - 0.5) * 1.0;
    model.scale.setScalar(scale);
    model.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    model.position.set(x, 0, z);
    model.updateMatrixWorld(true);
    let lowest = Infinity;
    model.traverse(n => { const p = new THREE.Vector3(); n.getWorldPosition(p); if (p.y < lowest) lowest = p.y; });
    // Rest the feet on the dancefloor tile surface (~0.05 m above the slab), not
    // floating on the clip's lifted Hips and not sunk through the tiles.
    model.position.y = Number.isFinite(lowest) ? -lowest + 0.05 : 0;
    scene.add(model);
    dancers.push({ model, mixer, action, use, phase });
  }
  // Audio-reactive dance: bass energy scales the animation playback rate.
  // When the kick hits, dancers move faster; when it's quiet, they slow down.
  // `audioScale` (0..~2) comes from the analyser's bass energy each frame.
  let audioScale = 1;
  const setAudioScale = s => { audioScale = Math.max(0, Math.min(2, s)); };
  const tick = (dt, s = audioScale) => {
    const scale = Math.max(0, Math.min(2, s));
    for (const d of dancers) d.mixer.update(dt * scale);
  };
  const toggle = () => {
    const on = dancers[0] ? dancers[0].model.visible : true;
    for (const d of dancers) d.model.visible = !on;
    return !on;
  };
  return { dancers, tick, toggle, setCount: () => { }, setAudioScale, clips: clips.map(c => c.key) };
}
