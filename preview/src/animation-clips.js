import { PropertyBinding } from 'three';
import { createAssetGLTFLoader } from './gltf-image-decoder.js';
import { ANIMATION_CLIP_GROUPS } from './animation-clip-assets.js';

export { ANIMATION_CLIP_GROUPS } from './animation-clip-assets.js';

// Clip packs have their own skeleton contract. No implicit retargeting to the
// shipped MakeHuman avatars; Phase 1 must validate a character before opting in.
export function createAnimationClipLibrary({ registry = ANIMATION_CLIP_GROUPS } = {}) {
  const entries = structuredClone(registry);
  const pending = new Map();
  let loader;

  async function fetchGroup(entry) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`Animation clip request failed: ${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== entry.bytes) throw new Error('Animation clip integrity: byte length');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
    if (hash !== entry.sha256) throw new Error('Animation clip integrity: SHA-256');
    loader ??= createAssetGLTFLoader();
    const gltf = await loader.parseAsync(bytes, '');
    const names = gltf.animations.map(clip => clip.name).sort();
    if (JSON.stringify(names) !== JSON.stringify([...entry.clips].sort())) {
      throw new Error('Animation clip set differs from pinned catalog');
    }
    gltf.scene.traverse(node => {
      if (node.isMesh || node.isLight || node.isCamera) throw new Error('Animation clip contains scene assets');
    });
    for (const clip of gltf.animations) {
      if (!clip.validate() || !(clip.duration > 0) || !clip.tracks.length) {
        throw new Error('Invalid animation clip tracks');
      }
      for (const track of clip.tracks) {
        const { nodeName, propertyName } = PropertyBinding.parseTrackName(track.name);
        if (!entry.joints.includes(nodeName) || !gltf.scene.getObjectByName(nodeName)
            || !['quaternion', 'position', 'scale'].includes(propertyName)
            || (nodeName === 'root' && propertyName === 'position')) {
          throw new Error('Animation clip targets an incompatible joint');
        }
      }
    }
    return gltf;
  }

  return {
    async load(group, { family } = {}) {
      if (!Object.hasOwn(entries, group)) throw new TypeError('Unknown animation clip group');
      const entry = entries[group];
      if (family !== entry.family || family !== 'quaternius-ual-v1') {
        throw new TypeError('Incompatible animation rig family');
      }
      if (!pending.has(group)) {
        const promise = fetchGroup(entry).catch(error => {
          if (pending.get(group) === promise) pending.delete(group);
          throw error;
        });
        pending.set(group, promise);
      }
      const gltf = await pending.get(group);
      // Each consumer owns its playback transforms and clips; the cached
      // template never becomes an AnimationMixer target.
      return { scene: gltf.scene.clone(true), animations: gltf.animations.map(clip => clip.clone()) };
    },
    clear() { pending.clear(); },
  };
}
