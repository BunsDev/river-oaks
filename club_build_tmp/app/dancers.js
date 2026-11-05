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
    clips.push({ ...clip, clip: buildClip(data, base) });
  }

  // Scale the character to ~1.75 m and drop its feet to the floor.
  const box = new THREE.Box3().setFromObject(base);
  const height = Math.max(0.01, box.max.y - box.min.y);
  const scale = 1.75 / height;
  const footOffset = box.min.y * scale;

  const dancers = [];
  for (let i = 0; i < count; i++) {
    const model = skeletonClone(base);
    const use = clips[i % clips.length];
    // Tint each dancer with its clip colour so they read as a crowd.
    model.traverse(n => {
      if (n.isMesh && n.material) {
        const m = n.material.clone();
        if (m.emissive) { m.emissive = new THREE.Color(use.color); m.emissiveIntensity = 0.35; }
        n.material = m;
      }
    });
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(use.clip);
    action.play();
    mixer.update(Math.random());          // desync the crowd
    // Scatter on the dancefloor (world coords: x = a, z = -d; dancefloor spans a -6.5..6.5, d 16..33).
    const x = -5.5 + (i % 6) * 2.2 + (Math.random() - 0.5);
    const z = -30 + Math.floor(i / 6) * 3 + (Math.random() - 0.5) * 1.4;
    model.scale.setScalar(scale);
    model.position.set(x, -footOffset, z);
    model.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
    scene.add(model);
    dancers.push({ model, mixer, action, use, phase: Math.random() });
  }
  const tick = dt => { for (const d of dancers) d.mixer.update(dt); };
  const toggle = () => {
    const on = dancers[0] ? dancers[0].model.visible : true;
    for (const d of dancers) d.model.visible = !on;
    return !on;
  };
  return { dancers, tick, toggle, setCount: () => { }, clips: clips.map(c => c.key) };
}
