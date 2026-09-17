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
export function physicalSurface(name, { tileSize = 4, instanced = false, ...options } = {}) {
  const arm = texture(name, 'arm');
  const material = new THREE.MeshStandardMaterial({
    map: texture(name, 'color'), normalMap: texture(name, 'normal'),
    roughnessMap: arm, aoMap: arm, metalnessMap: arm,
    roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.7, 0.7),
    aoMapIntensity: 0.65, ...options,
  });
  material.userData.sharedTextures = true;
  material.onBeforeCompile = (shader) => {
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
  material.customProgramCacheKey = () => `river-oaks-metric-uv:${tileSize}:${instanced}`;
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
  scene.backgroundBlurriness = 0.015;
  return { hdr, environment, dispose() { hdr.dispose(); environment.dispose(); } };
}
