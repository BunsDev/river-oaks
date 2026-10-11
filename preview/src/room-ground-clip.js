// Walk-in floors sit at the facade's terrain height, but the DEM keeps rising
// across many footprints, so the outdoor ground and pavement mesh pokes up
// through the boutique floor (as much as 0.16 m, over most of some rooms).
// Rendering only: fragments of outdoor surfaces inside a room footprint are
// discarded so the room's own floor shows. Ground queries, room floor height and
// movement are unchanged. Interiors hidden (layer toggle) turns the clip off.

// The same footprint test as the shader, for tests and tools.
export function insideRoomFootprint(room, east, north) {
  const [a, d] = room.toLocal(east, north);
  return a > room.aMin && a < room.aMax && d > 0 && d < room.depth;
}

export function createRoomGroundClip(rooms) {
  const count = rooms.length;
  const frames = rooms.map(room => [room.facade[0], room.facade[1], room.right[0], room.right[1]]);
  const spans = rooms.map(room => [room.aMin, room.aMax, room.depth, room.floor]);
  const uniforms = { roRoomClip: { value: count ? 1 : 0 }, roRoomFrame: { value: frames.flat() }, roRoomSpan: { value: spans.flat() } };
  const clipped = new Set();
  function clip(material) {
    if (!count || clipped.has(material) || material.userData.roomGroundClip) return material;
    clipped.add(material); material.userData.roomGroundClip = true;
    const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRoRoomWorld;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vRoRoomWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vRoRoomWorld;
          uniform float roRoomClip;
          uniform vec4 roRoomFrame[${count}];
          uniform vec4 roRoomSpan[${count}];`)
        .replace('void main() {', `void main() {
          if (roRoomClip > 0.5) {
            // Three.js z is south; rooms are planned in east/north metres.
            vec2 roEN = vec2(vRoRoomWorld.x, -vRoRoomWorld.z);
            for (int i = 0; i < ${count}; i++) {
              vec4 frame = roRoomFrame[i], span = roRoomSpan[i];
              vec2 rel = roEN - frame.xy, inward = vec2(-frame.w, frame.z);
              float a = dot(rel, frame.zw), d = dot(rel, inward);
              if (a > span.x && a < span.y && d > 0.0 && d < span.z && vRoRoomWorld.y > span.w - 1.0) discard;
            }
          }`);
    };
    material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|ro-room-ground-clip-${count}`;
    material.needsUpdate = true;
    return material;
  }
  return {
    uniforms,
    // Every mesh material under the given outdoor groups, once each.
    apply(...groups) {
      for (const group of groups) group?.traverse(item => { if (item.isMesh) for (const material of [item.material].flat()) if (material) clip(material); });
      return clipped.size;
    },
    setEnabled(enabled) { uniforms.roRoomClip.value = enabled && count ? 1 : 0; },
  };
}
