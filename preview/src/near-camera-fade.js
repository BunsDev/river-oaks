// A camera that comes within a few metres of a large occluder (flying through a
// tree crown, a bird skimming the canopy, Jevica rising beside her carriage)
// looks through it instead of into a wall of
// leaves: fragments near the camera dissolve with an ordered dither, so the
// material stays alpha-tested and depth-correct. The shadow pass renders from
// the light, so shadows are unaffected.
export const NEAR_CAMERA_FADE = { near: 1.4, far: 3.2 };
export function seeThroughNearCamera(material) {
  if (material.userData.seeThroughNearCamera) return material;
  material.userData.seeThroughNearCamera = true;
  // Chain onto any existing hook (surface tiling, tone variation) rather than replace it.
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRoWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 roWorld = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          roWorld = instanceMatrix * roWorld;
        #endif
        vRoWorld = (modelMatrix * roWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRoWorld;
        // 4x4 ordered dither: a 2x2 Bayer pattern nested in itself.
        float roBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float roBayer(vec2 a) { return roBayer2(0.5 * a) * 0.25 + roBayer2(a) + 0.03125; }
`)
      .replace('void main() {', `void main() {
        float roFade = smoothstep(${NEAR_CAMERA_FADE.near.toFixed(2)}, ${NEAR_CAMERA_FADE.far.toFixed(2)}, distance(vRoWorld, cameraPosition));
        if (roFade < 1.0 && roFade <= roBayer(gl_FragCoord.xy)) discard;`);
  };
  material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|ro-see-through-near-camera`;
  return material;
}

// Every mesh material under a group, once each.
export function seeThroughNearCameraIn(group) {
  const seen = new Set();
  group.traverse(item => { if (!item.isMesh) return; for (const material of [item.material].flat()) if (material && !seen.has(material)) { seen.add(material); seeThroughNearCamera(material); } });
  return group;
}
