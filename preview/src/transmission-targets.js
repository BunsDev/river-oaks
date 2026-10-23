// Three.js renders transmissive materials (transmission > 0) through a
// viewport-sized, multisampled render target that it caches per camera inside
// each scene's render state and never disposes. A scene and camera made for one
// capture would strand that target's GPU memory. Release it once the scene is
// done; Three recreates it if the pair renders again.
export function releaseTransmissionTargets(renderer, root) {
  const released = new Set();
  root.traverse(object => {
    for (const material of [object.material].flat()) {
      if (!material || !(material.transmission > 0)) continue;
      const target = renderer.properties.get(material)?.uniforms?.transmissionSamplerMap?.value?.renderTarget;
      if (target && !released.has(target)) { released.add(target); target.dispose(); }
    }
  });
  return released.size;
}
