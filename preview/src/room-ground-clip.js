import * as THREE from 'three';
import { rectanglesOverlap } from './store-rooms.js';

// Walk-in floors sit at the facade's terrain height, but the DEM keeps rising
// across many footprints, so the outdoor ground and pavement mesh pokes up
// through the boutique floor (as much as 0.16 m, over most of some rooms).
// Rendering only: fragments of outdoor surfaces inside a room footprint are
// discarded so the room's own floor shows. Ground queries, room floor height and
// movement are unchanged. Interiors hidden (layer toggle) turns the clip off.
//
// The ground covers most of the screen, so the per-fragment cost must stay
// flat on CPU renderers: a 1 m mask texture names up to four candidate rooms
// per cell, and only those get the exact footprint test. Room frames come from
// a small float texture via texelFetch, so the shader never indexes a uniform
// array dynamically (which software rasterizers can turn into a scan of all rooms).
export const MASK_CELL = 1, MASK_SLOTS = 4;

// The same footprint test as the shader, for tests and tools.
export function insideRoomFootprint(room, east, north) {
  const [a, d] = room.toLocal(east, north);
  return a > room.aMin && a < room.aMax && d > 0 && d < room.depth;
}

// Cells (east/north metres) over the rooms' combined bounds; each texel holds
// room index + 1 for every room whose footprint touches the cell, 0 for none.
export function roomMask(rooms, cell = MASK_CELL) {
  if (!rooms.length) return null;
  const points = rooms.flatMap(room => room.footprint);
  const west = Math.floor(Math.min(...points.map(p => p[0])) - cell), south = Math.floor(Math.min(...points.map(p => p[1])) - cell);
  const width = Math.ceil((Math.max(...points.map(p => p[0])) + cell - west) / cell), height = Math.ceil((Math.max(...points.map(p => p[1])) + cell - south) / cell);
  const data = new Uint8Array(width * height * 4);
  let overflow = 0;
  rooms.forEach((room, index) => {
    const xs = room.footprint.map(p => p[0]), ys = room.footprint.map(p => p[1]);
    const i0 = Math.floor((Math.min(...xs) - west) / cell), i1 = Math.floor((Math.max(...xs) - west) / cell);
    const j0 = Math.floor((Math.min(...ys) - south) / cell), j1 = Math.floor((Math.max(...ys) - south) / cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = west + i * cell, y = south + j * cell;
      if (!rectanglesOverlap([[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]], room.footprint)) continue;
      const base = (j * width + i) * 4;
      let slot = 0; while (slot < MASK_SLOTS && data[base + slot]) slot++;
      if (slot < MASK_SLOTS) data[base + slot] = index + 1; else overflow++;
    }
  });
  return { data, width, height, west, south, cell, overflow };
}

export function createRoomGroundClip(rooms,{persistent=[]}={}) {
  // Exterior architectural recesses stay visible when boutique interiors hide.
  rooms=[...persistent,...rooms];
  const count = Math.min(rooms.length, 254), mask = roomMask(rooms.slice(0, count));
  const frames = rooms.slice(0, count).map(room => [room.facade[0], room.facade[1], room.right[0], room.right[1]]);
  const spans = rooms.slice(0, count).map(room => [room.aMin, room.aMax, room.depth, room.floor]);
  const nearest = texture => { texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true; return texture; };
  // Mask texels hold room index + 1 per slot; room texels (2 per room) hold the
  // facade frame and the span: [east, north, right east, right north], [aMin, aMax, depth, floor].
  const texture = mask ? nearest(new THREE.DataTexture(mask.data, mask.width, mask.height, THREE.RGBAFormat, THREE.UnsignedByteType)) : null;
  // Facades are stored relative to the mask origin, so float32 keeps sub-millimetre precision.
  const local = frame => mask ? [frame[0] - mask.west, frame[1] - mask.south, frame[2], frame[3]] : frame;
  const roomData = count ? nearest(new THREE.DataTexture(new Float32Array(frames.flatMap((frame, i) => [...local(frame), ...spans[i]])), count * 2, 1, THREE.RGBAFormat, THREE.FloatType)) : null;
  const uniforms = {
    roRoomClip: { value: count ? 1 : 0 }, roPersistentClip: { value: persistent.length ? 1 : 0 }, roRoomMask: { value: texture }, roRoomData: { value: roomData },
    roRoomGrid: { value: mask ? new THREE.Vector4(mask.west, mask.south, mask.cell, 0) : new THREE.Vector4() },
    roRoomFrame: { value: frames.flat() }, roRoomSpan: { value: spans.flat() },
  };
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
          uniform float roPersistentClip;
          uniform sampler2D roRoomMask;
          uniform highp sampler2D roRoomData;
          uniform vec4 roRoomGrid;`)
        .replace('void main() {', `void main() {
          if (roRoomClip > 0.5 || roPersistentClip > 0.5) {
            // Three.js z is south; rooms are planned in east/north metres.
            vec2 roEN = vec2(vRoRoomWorld.x, -vRoRoomWorld.z);
            vec2 roLocal = roEN - roRoomGrid.xy;
            ivec2 roCell = ivec2(floor(roLocal / roRoomGrid.z)), roSize = textureSize(roRoomMask, 0);
            if (roCell.x >= 0 && roCell.y >= 0 && roCell.x < roSize.x && roCell.y < roSize.y) {
              vec4 roIds = texelFetch(roRoomMask, roCell, 0) * 255.0;
              for (int k = 0; k < ${MASK_SLOTS}; k++) {
                int id = int(roIds[k] + 0.5) - 1;
                if (id < 0) break;
                if (roPersistentClip < 0.5 && id < ${persistent.length}) continue;
                if (roRoomClip < 0.5 && id >= ${persistent.length}) continue;
                vec4 frame = texelFetch(roRoomData, ivec2(id * 2, 0), 0), span = texelFetch(roRoomData, ivec2(id * 2 + 1, 0), 0);
                vec2 rel = roLocal - frame.xy, inward = vec2(-frame.w, frame.z);
                float a = dot(rel, frame.zw), d = dot(rel, inward);
                if (a > span.x && a < span.y && d > 0.0 && d < span.z && vRoRoomWorld.y > span.w - 1.0) discard;
              }
            }
          }`);
    };
    material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|ro-room-ground-mask-${count}${persistent.length?`-persistent-${persistent.length}`:''}`;
    material.needsUpdate = true;
    return material;
  }
  return {
    uniforms, mask,
    // Every mesh material under the given outdoor groups, once each.
    apply(...groups) {
      for (const group of groups) group?.traverse(item => { if (item.isMesh) for (const material of [item.material].flat()) if (material) clip(material); });
      return clipped.size;
    },
    setEnabled(enabled) { uniforms.roRoomClip.value = enabled && count ? 1 : 0; },
    setPersistentEnabled(enabled) { uniforms.roPersistentClip.value = enabled && persistent.length ? 1 : 0; },
    dispose() { texture?.dispose(); roomData?.dispose(); },
  };
}
