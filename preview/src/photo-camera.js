import { Euler, Quaternion, Vector3, MathUtils } from 'three';

export function photoCrop(width, height, ratio = width / height) {
  if (![width, height].every(value => Number.isFinite(value) && value > 0)) throw new Error('No rendered frame is available.');
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Invalid photo ratio.');
  const cropWidth = Math.min(width, height * ratio), cropHeight = Math.min(height, width / ratio);
  const scale = Math.min(1, 2048 / Math.max(cropWidth, cropHeight));
  return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2, width: cropWidth, height: cropHeight,
    outputWidth: Math.max(1, Math.round(cropWidth * scale)), outputHeight: Math.max(1, Math.round(cropHeight * scale)) };
}

export function createPhotoCamera(camera) {
  let saved = null, values;
  const offset = new Quaternion(), forward = new Vector3();
  const defaults = () => ({ yaw: 0, pitch: 0, roll: 0, dolly: 0, fov: saved?.fov ?? camera.fov });
  const bounds = { yaw: [-180, 180], pitch: [-70, 70], roll: [-30, 30], dolly: [-4, 4], fov: [20, 90] };
  return {
    get active() { return Boolean(saved); },
    open() { if (!saved) { saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov }; values = defaults(); } },
    set(next) {
      if (!saved) return;
      for (const [name, [min, max]] of Object.entries(bounds)) if (Number.isFinite(next[name])) values[name] = MathUtils.clamp(next[name], min, max);
    },
    reset() { values = defaults(); },
    update() {
      if (!saved) return;
      forward.set(0, 0, -1).applyQuaternion(saved.quaternion);
      camera.position.copy(saved.position).addScaledVector(forward, values.dolly);
      offset.setFromEuler(new Euler(...[values.pitch, values.yaw, values.roll].map(MathUtils.degToRad), 'YXZ'));
      camera.quaternion.copy(saved.quaternion).multiply(offset);
      camera.fov = values.fov;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    },
    close() {
      if (!saved) return;
      camera.position.copy(saved.position); camera.quaternion.copy(saved.quaternion); camera.fov = saved.fov;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(); saved = null;
    },
  };
}
