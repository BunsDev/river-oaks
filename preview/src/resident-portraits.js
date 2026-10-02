import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Head-and-shoulders portraits of residents, taken from their live 3D models.
// A pose-preserving clone shares the resident's geometry, materials and
// textures, so nothing is uploaded again; it is lit in a small studio and drawn
// once into a render target between frames, then cached as an image URL.
export const PORTRAIT_SIZE = 192;

export function createResidentPortraits({ renderer, getHolder, size = PORTRAIT_SIZE, schedule = callback => requestAnimationFrame(callback) }) {
  const cache = new Map(), queue = [];
  const target = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#e9e2d4');
  const key = new THREE.DirectionalLight('#fff1df', 2.6), fill = new THREE.HemisphereLight('#f6f1ff', '#6b5a4a', 1.5), rim = new THREE.DirectionalLight('#cfe3ff', 1.4);
  studio.add(key, key.target, fill, rim, rim.target);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 10);
  const pixels = new Uint8Array(size * size * 4), canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d'), image = context.createImageData(size, size);
  const head = new THREE.Vector3(), chest = new THREE.Vector3(), forward = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), quaternion = new THREE.Quaternion();
  let pending = false, disposed = false;

  const bone = (root, pattern) => { let found = null; root.traverse(object => { if (!found && object.isBone && pattern.test(object.name)) found = object; }); return found; };
  const capture = holder => {
    const avatar = holder.userData.avatar?.object ?? holder;
    holder.updateWorldMatrix(true, true);
    const copy = cloneSkinned(avatar);
    // Keep the resident's world pose, so the clone needs no scene of its own.
    avatar.matrixWorld.decompose(copy.position, copy.quaternion, copy.scale);
    studio.add(copy);
    copy.updateWorldMatrix(true, true);
    const headBone = bone(copy, /^head$/i) ?? bone(copy, /head/i), chestBone = bone(copy, /^spine_?0?3$|^spine03$|chest/i);
    if (!headBone) { studio.remove(copy); return null; }
    headBone.getWorldPosition(head);
    if (chestBone) chestBone.getWorldPosition(chest); else chest.copy(head).addScaledVector(up, -0.3);
    // Residents face +Z in their own frame; frame them from slightly above eye level.
    forward.set(0, 0, 1).applyQuaternion(holder.getWorldQuaternion(quaternion)).setY(0).normalize();
    const focus = head.clone().lerp(chest, 0.16).addScaledVector(up, 0.05);
    camera.position.copy(focus).addScaledVector(forward, 1.0).addScaledVector(up, 0.06);
    camera.lookAt(focus);
    const side = new THREE.Vector3().crossVectors(up, forward).normalize();
    key.position.copy(focus).addScaledVector(forward, 1.2).addScaledVector(side, 0.9).addScaledVector(up, 0.9); key.target.position.copy(focus);
    rim.position.copy(focus).addScaledVector(forward, -1).addScaledVector(side, -0.8).addScaledVector(up, 0.6); rim.target.position.copy(focus);
    copy.traverse(object => { if (object.isMesh) object.frustumCulled = false; });

    const previousTarget = renderer.getRenderTarget(), previousClear = renderer.getClearColor(new THREE.Color()), previousAlpha = renderer.getClearAlpha();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      renderer.setRenderTarget(target);
      renderer.clear();
      renderer.render(studio, camera);
      renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClear, previousAlpha);
      renderer.shadowMap.autoUpdate = shadowAuto;
      studio.remove(copy);
      copy.traverse(object => { if (object.isSkinnedMesh) object.skeleton.dispose(); });
    }
    // WebGL rows run bottom-up; canvas rows run top-down.
    for (let row = 0; row < size; row++) image.data.set(pixels.subarray((size - 1 - row) * size * 4, (size - row) * size * 4), row * size * 4);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/webp', 0.9);
  };

  // One portrait per frame keeps the cost invisible next to the district.
  const drain = () => {
    pending = false;
    if (disposed) return;
    const job = queue.shift();
    if (!job) return;
    const holder = getHolder(job.id);
    if (!holder) { job.resolve(null); cache.delete(job.id); }
    else {
      try { job.resolve(capture(holder)); } catch (error) { console.warn('Portrait failed', job.id, error); job.resolve(null); cache.delete(job.id); }
    }
    if (queue.length) { pending = true; schedule(drain); }
  };

  return {
    portrait(id) {
      if (disposed || !id) return Promise.resolve(null);
      if (!cache.has(id)) {
        cache.set(id, new Promise(resolve => queue.push({ id, resolve })));
        if (!pending) { pending = true; schedule(drain); }
      }
      return cache.get(id);
    },
    forget(id) { cache.delete(id); },
    dispose() { disposed = true; queue.splice(0).forEach(job => job.resolve(null)); cache.clear(); target.dispose(); },
  };
}
