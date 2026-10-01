import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const maps = new Map();
const errors = new Set();
let anisotropy = 4;

export function configureMaterials(renderer) {
  anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
}

function texture(name, channel) {
  const key = `${name}-${channel}`;
  if (maps.has(key)) return maps.get(key);
  // Node unit tests build street geometry without a DOM: hand back an
  // unloaded texture so materials still construct.
  if (typeof document === 'undefined') { const map = new THREE.Texture(); maps.set(key, map); return map; }
  const map = new THREE.TextureLoader().load(`/assets/materials/${key}.jpg`, undefined, undefined, () => {
    errors.add(key);
    document.dispatchEvent(new CustomEvent('visualasseterror', { detail: { count: errors.size } }));
  });
  map.colorSpace = channel === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  maps.set(key, map);
  return map;
}

// Geometry UVs are measured in meters. Instanced facade UVs additionally account for each part's scale.
// Optional low-frequency tone variation breaks the visible repeat of a tiled
// texture over large ground planes; it multiplies albedo only. textureContrast
// (< 1) quiets the photographed surface's high-frequency albedo at eye level.
// High-street brick: clay pavers in herringbone with sand joints. One brick is
// about 20 cm, so a texture repeat spans 1.15 m. The warm tint lifts the
// photographed grey toward fired clay; low variation keeps it laid, not worn.
export const PAVER_TILE = 1.15;
export function paverSurface(options = {}) {
  return physicalSurface('paver', { tileSize: PAVER_TILE, color: '#f4d6c2', normalScale: new THREE.Vector2(0.75, 0.75), variation: 0.14, textureContrast: 0.9, ...options });
}

export function physicalSurface(name, { tileSize = 4, instanced = false, variation = 0, textureContrast = 1, ...options } = {}) {
  const arm = texture(name, 'arm');
  const material = new THREE.MeshStandardMaterial({
    map: texture(name, 'color'), normalMap: texture(name, 'normal'),
    roughnessMap: arm, aoMap: arm, metalnessMap: arm,
    roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7),
    aoMapIntensity: 0.65, ...options,
  });
  material.userData.sharedTextures = true;
  material.onBeforeCompile = (shader) => {
    if (variation > 0) shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `float roHash(vec2 cell) { return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453); }
      float roValueNoise(vec2 p) {
        vec2 cell = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(roHash(cell), roHash(cell + vec2(1.0, 0.0)), f.x), mix(roHash(cell + vec2(0.0, 1.0)), roHash(cell + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      vec2 roMeters = vMapUv * ${tileSize.toFixed(4)};
      float roNoise = 0.25 * roValueNoise(roMeters / 3.1) + 0.4 * roValueNoise(mat2(0.83, -0.56, 0.56, 0.83) * roMeters / 19.0) + 0.35 * roValueNoise(mat2(0.31, 0.95, -0.95, 0.31) * roMeters / 131.0);
      diffuseColor.rgb *= 1.0 + ${variation.toFixed(4)} * (roNoise - 0.5);`);
    if (textureContrast !== 1) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb = mix(diffuse * 0.5, diffuseColor.rgb, ${textureContrast.toFixed(4)});
      #endif`);
    const multiplier = instanced ? `
      vec3 roScale = vec3(1.0);
      #ifdef USE_INSTANCING
        roScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      #endif
      vec3 roNormal = abs(normal);
      vec2 roFaceScale = roNormal.x > roNormal.y && roNormal.x > roNormal.z ? roScale.zy : roNormal.y > roNormal.z ? roScale.xz : roScale.xy;
      vec2 roUv = uv * roFaceScale / ${tileSize.toFixed(4)};
    ` : `vec2 roUv = uv / ${tileSize.toFixed(4)};`;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\n${multiplier}
      #ifdef USE_MAP
        vMapUv = (mapTransform * vec3(roUv, 1.0)).xy;
      #endif
      #ifdef USE_NORMALMAP
        vNormalMapUv = (normalMapTransform * vec3(roUv, 1.0)).xy;
      #endif
      #ifdef USE_ROUGHNESSMAP
        vRoughnessMapUv = (roughnessMapTransform * vec3(roUv, 1.0)).xy;
      #endif
      #ifdef USE_METALNESSMAP
        vMetalnessMapUv = (metalnessMapTransform * vec3(roUv, 1.0)).xy;
      #endif
      #ifdef USE_AOMAP
        vAoMapUv = (aoMapTransform * vec3(roUv, 1.0)).xy;
      #endif`);
  };
  material.customProgramCacheKey = () => `river-oaks-metric-uv:${tileSize}:${instanced}:${variation}:${textureContrast}`;
  return material;
}

export async function loadEnvironment(renderer, scene) {
  const hdr = await new HDRLoader().loadAsync('/assets/materials/sky.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromEquirectangular(hdr);
  generator.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.7;
  scene.background = hdr;
  scene.backgroundIntensity = 0.7;
  scene.backgroundBlurriness = 0;
  return { hdr, environment, dispose() { hdr.dispose(); environment.dispose(); } };
}
