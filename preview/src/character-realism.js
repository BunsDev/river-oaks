import * as THREE from 'three';

// Opt-in realism layer for the MakeHuman game rigs (#517). It changes only the
// materials and per-instance geometry of one avatar; the cached GLB template,
// its textures and the default look are untouched. Every generated texture is
// produced here from code, so nothing new needs a licence.
export const CHARACTER_REALISM_VERSION = 1;
export const REALISM_TIERS = Object.freeze({
  off: null,
  low: Object.freeze({pores: 0, scatter: [0, 0, 0], sheen: 0, cornea: true, coverage: true, hairColor: true}),
  standard: Object.freeze({pores: .18, scatter: [.34, .16, .08], sheen: .22, cornea: true, coverage: true, hairColor: true}),
  high: Object.freeze({pores: .32, scatter: [.48, .24, .12], sheen: .3, cornea: true, coverage: true, hairColor: true}),
});
// Parts of a tier that a caller can select on their own. The tier still sets
// each part's strength. An authored identity can leave out parts that would
// change it; the named defaults keep their own eyes, for example (#517).
export const REALISM_COMPONENTS = Object.freeze(['roughness', 'pores', 'scatter', 'sheen', 'cornea', 'coverage', 'hairColor']);
const SKIN_COMPONENTS = ['roughness', 'pores', 'scatter', 'sheen'];

const SKIN = /^(young|middleage|old)_[a-z]+_(male|female)\d*$/i;
const HAIR = /^(afro|bob|braid|long|ponytail|short)\d+/i;
// GLTFLoader sanitizes names such as Jevica.high-poly to Jevicahigh-poly.
const BROWS = /eyebrow\d+(?:_\d+)?$/i, LASHES = /eyelashes\d+(?:_\d+)?$/i, EYES = /(?:high|low)-poly(?:_\d+)?$/i;

// Tileable pore and fine-crease height field, encoded as a tangent-space normal
// map. Seeded and periodic, so every client builds identical pixels.
function poreNormalPixels(size = 256, cells = 11, seed = 517) {
  const hash = (x, y) => {
    let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const wrap = (value, period) => ((value % period) + period) % period;
  const height = new Float32Array(size * size), cell = size / cells, PER_CELL = 3;
  // Feature points per cell: offset x, offset y, 1 / radius².
  const features = new Float32Array(cells * cells * PER_CELL * 3);
  for (let gy = 0; gy < cells; gy++) for (let gx = 0; gx < cells; gx++) for (let k = 0; k < PER_CELL; k++) {
    const i = ((gy * cells + gx) * PER_CELL + k) * 3, radius = cell * (.09 + .07 * hash(gx + k * 31, gy + 401));
    features[i] = hash(gx * 3 + k, gy) * cell; features[i + 1] = hash(gy * 3 + k, gx + 977) * cell; features[i + 2] = 1 / (radius * radius);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    let pores = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const base = (wrap(cy + oy, cells) * cells + wrap(cx + ox, cells)) * PER_CELL * 3, left = (cx + ox) * cell, top = (cy + oy) * cell;
      for (let k = 0; k < PER_CELL * 3; k += 3) {
        const dx = x - left - features[base + k], dy = y - top - features[base + k + 1];
        pores += Math.exp(-(dx * dx + dy * dy) * features[base + k + 2]);
      }
    }
    const u = x / size * Math.PI * 2, v = y / size * Math.PI * 2;
    const creases = .18 * Math.sin(u * 37 + 2.1 * Math.sin(v * 5)) * Math.sin(v * 11 + 1.3 * Math.sin(u * 7));
    const grain = .12 * (hash(x, y) - .5);
    height[y * size + x] = -pores + creases + grain;
  }
  const pixels = new Uint8Array(size * size * 4), at = (x, y) => height[wrap(y, size) * size + wrap(x, size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = at(x - 1, y) - at(x + 1, y), dy = at(x, y - 1) - at(x, y + 1), length = Math.hypot(dx, dy, 1.2), i = (y * size + x) * 4;
    pixels[i] = Math.round((dx / length * .5 + .5) * 255); pixels[i + 1] = Math.round((dy / length * .5 + .5) * 255);
    pixels[i + 2] = Math.round((1.2 / length * .5 + .5) * 255); pixels[i + 3] = 255;
  }
  return {size, pixels};
}
export {poreNormalPixels as _poreNormalPixels};

let poreTexture = null;
function poreNormal() {
  if (poreTexture) return poreTexture;
  const {size, pixels} = poreNormalPixels();
  poreTexture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  poreTexture.name = 'realism-pores'; poreTexture.wrapS = poreTexture.wrapT = THREE.RepeatWrapping;
  poreTexture.repeat.set(52, 52); poreTexture.generateMipmaps = true; poreTexture.minFilter = THREE.LinearMipmapLinearFilter;
  poreTexture.magFilter = THREE.LinearFilter; poreTexture.anisotropy = 8; poreTexture.colorSpace = THREE.NoColorSpace; poreTexture.needsUpdate = true;
  return poreTexture;
}

// Region roughness (body, lips, nails) built from MPFB's CC0 masks by
// scripts/build_character_realism_maps.py; it shares the skin's UV layout.
export const SKIN_ROUGHNESS_URL = '/assets/characters/realism/skin-roughness.webp';
let realismTextures = null;
export function loadCharacterRealismTextures({loader = new THREE.TextureLoader()} = {}) {
  realismTextures ??= loader.loadAsync(SKIN_ROUGHNESS_URL).then(roughness => {
    roughness.name = 'realism-skin-roughness'; roughness.flipY = false; roughness.colorSpace = THREE.NoColorSpace; roughness.needsUpdate = true;
    return {roughness};
  }).catch(error => { realismTextures = null; throw error; });
  return realismTextures;
}

// Light that enters skin leaves it further round the body, redder than it
// arrived. A per-channel wrap of the direct diffuse term approximates that
// without a transmission pass; specular is unchanged.
const DIFFUSE_LINE = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );';
export function skinScatterChunk(chunk = THREE.ShaderChunk.lights_physical_pars_fragment) {
  if (!chunk.includes(DIFFUSE_LINE)) throw new Error('Three.js direct diffuse term changed; skin scattering cannot be applied');
  return chunk.replace(DIFFUSE_LINE, `
	float skinNL = dot( geometryNormal, directLight.direction );
	vec3 skinWrap = clamp( ( vec3( skinNL ) + skinScatterWrap ) / ( 1.0 + skinScatterWrap ), 0.0, 1.0 );
	vec3 skinIrradiance = skinWrap * directLight.color;
	#ifdef USE_SHEEN
		skinIrradiance *= sheenEnergyComp;
	#endif
	reflectedLight.directDiffuse += skinIrradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );`);
}

// Each response is immutable in its cached program. Returning from the low
// tier must not depend on custom uniforms retained by another program variant.
function upgradeSkin(material, tier, textures) {
  if (!material.isMeshPhysicalMaterial) return false;
  if (tier.pores > 0) { material.normalMap = poreNormal(); material.normalScale = new THREE.Vector2(tier.pores, tier.pores); }
  if (textures?.roughness) { material.roughnessMap = textures.roughness; material.roughness = 1; }
  if (tier.sheen !== null) { material.sheen = tier.sheen; material.sheenColor = new THREE.Color('#ffd8c6'); material.sheenRoughness = .5; }
  if (tier.scatter.some(value => value > 0)) {
    const wrap = tier.scatter.join(', ');
    material.onBeforeCompile = shader => {
      shader.fragmentShader = `const vec3 skinScatterWrap = vec3(${wrap});\n${shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', skinScatterChunk())}`;
    };
    material.customProgramCacheKey = () => `character-skin-scatter-${CHARACTER_REALISM_VERSION}-${wrap}`;
  }
  material.needsUpdate = true;
  return true;
}

// MakeHuman maps each eye's cornea to a transparent disc in the texture. The rig
// import turns blending into an alpha test, which discards the cornea and with
// it every highlight. Split those triangles into a clear, specular-only shell.
export function corneaTriangles(geometry, transparentAt) {
  const uv = geometry.attributes.uv, index = geometry.index;
  if (!uv || !index) return {cornea: [], rest: index ? [...index.array] : []};
  const cornea = [], rest = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    const u = (uv.getX(a) + uv.getX(b) + uv.getX(c)) / 3, v = (uv.getY(a) + uv.getY(b) + uv.getY(c)) / 3;
    (transparentAt(u, v) ? cornea : rest).push(a, b, c);
  }
  return {cornea, rest};
}

function alphaSampler(texture, size = 128) {
  const image = texture?.image;
  if (!image || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(image, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data, flip = texture.flipY;
  return (u, v) => {
    const x = Math.min(size - 1, Math.max(0, Math.floor(u * size))), y = Math.min(size - 1, Math.max(0, Math.floor((flip ? 1 - v : v) * size)));
    return data[(y * size + x) * 4 + 3] < 128;
  };
}

function splitCornea(mesh, owned, sampler) {
  const transparentAt = sampler ?? alphaSampler(mesh.material.map);
  if (!transparentAt) return false;
  const {cornea, rest} = corneaTriangles(mesh.geometry, transparentAt);
  if (!cornea.length) return false;
  const source = mesh.geometry, body = source.clone(), shell = source.clone();
  body.setIndex(rest); shell.setIndex(cornea); owned.geometries.add(body); owned.geometries.add(shell);
  owned.originalGeometries.set(mesh, source);
  mesh.geometry = body;
  const iris = irisTexture(mesh.material.map);
  if (iris) { mesh.material.map = iris; owned.textures.add(iris); }
  mesh.material.alphaTest = 0; mesh.material.roughness = .42; mesh.material.needsUpdate = true;
  const clear = new THREE.MeshPhysicalMaterial({name: 'realism-cornea', color: '#000000', roughness: .04, metalness: 0, ior: 1.376,
    specularIntensity: 1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});
  owned.materials.add(clear);
  const cover = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(shell, clear) : new THREE.Mesh(shell, clear);
  cover.position.copy(mesh.position); cover.quaternion.copy(mesh.quaternion); cover.scale.copy(mesh.scale);
  cover.matrix.copy(mesh.matrix); cover.matrixAutoUpdate = mesh.matrixAutoUpdate;
  if (mesh.isSkinnedMesh) { cover.bind(mesh.skeleton, mesh.bindMatrix); cover.bindMode = mesh.bindMode; }
  cover.name = `${mesh.name} cornea`; cover.frustumCulled = false; cover.renderOrder = 1;
  cover.morphTargetInfluences = mesh.morphTargetInfluences; cover.morphTargetDictionary = mesh.morphTargetDictionary;
  mesh.parent.add(cover); owned.objects.add(cover);
  return true;
}

// MakeHuman's "brown" iris is nearly pure red (hue 9°, saturation 0.97). Move
// saturated pixels toward a natural brown (hue ~27°, saturation ~0.6) and leave
// the sclera, veins and pupil as they are. Hue stays in the brown family, so
// the eye colour a player sees does not change category.
export function naturalIris(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), value = max / 255, saturation = max ? (max - min) / max : 0;
  const weight = Math.min(1, Math.max(0, (saturation - .35) / .25));
  if (!weight) return [r, g, b];
  let hue = 0;
  if (max !== min) hue = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  hue *= 60;
  const targetHue = hue < 60 || hue > 300 ? 22 + .55 * ((hue + 60) % 360 - 60) : hue, targetSaturation = saturation * .62;
  const h = (hue + (targetHue - hue) * weight) / 60, s = saturation + (targetSaturation - saturation) * weight, c = value * s, x = c * (1 - Math.abs(h % 2 - 1)), m = value - c;
  const [rr, gg, bb] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [rr, gg, bb].map(channel => Math.round((channel + m) * 255));
}
function irisTexture(source) {
  const image = source?.image;
  if (!image || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height), p = pixels.data;
  for (let i = 0; i < p.length; i += 4) { const [r, g, b] = naturalIris(p[i], p[i + 1], p[i + 2]); p[i] = r; p[i + 1] = g; p[i + 2] = b; }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'realism-iris'; texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = source.flipY;
  texture.wrapS = source.wrapS; texture.wrapT = source.wrapT; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

// Restores real strand alpha when a look replaced the hair map with a flat
// colour texture: the source strands keep their shape and shading, recoloured
// to the look's mean colour.
function strandTexture(source, replacement) {
  const image = source.image, data = replacement.image?.data;
  if (!image || !data || typeof document === 'undefined') return null;
  const tint = [0, 1, 2].map(channel => { let sum = 0; for (let i = channel; i < data.length; i += 4) sum += data[i]; return sum / (data.length / 4); });
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext('2d', {willReadFrequently: true}); context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height), p = pixels.data;
  let mean = 0, count = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128) { mean += .2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2]; count++; }
  mean = Math.max(1, mean / Math.max(1, count));
  for (let i = 0; i < p.length; i += 4) {
    const shade = Math.min(1.6, (.2126 * p[i] + .7152 * p[i + 1] + .0722 * p[i + 2]) / mean);
    for (let channel = 0; channel < 3; channel++) p[i + channel] = Math.min(255, Math.round(tint[channel] * shade));
  }
  context.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'realism-strands'; texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = source.flipY;
  texture.wrapS = source.wrapS; texture.wrapT = source.wrapT; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

function coverageCards(material, original, tier, hair, owned) {
  if (hair && tier.hairColor && original.map && material.map && material.map !== original.map && material.map.isDataTexture) {
    const strands = strandTexture(original.map, material.map);
    if (strands) { material.map = strands; owned.textures.add(strands); }
  }
  if (tier.coverage) { material.alphaToCoverage = true; material.alphaTest = .08; }
  material.needsUpdate = true;
}

// Applies one tier to one avatar rig (the object instantiateAvatar returns).
// Pass the resolved loadCharacterRealismTextures() result; without it skin keeps
// its flat roughness and the report says so. `components` selects parts of the
// tier (all by default). Returns what was upgraded and a dispose that removes
// per-instance additions.
export function applyCharacterRealism(rig, {tier: name = 'high', textures = null, alphaAt, components = REALISM_COMPONENTS} = {}) {
  const selected = new Set(components ?? REALISM_COMPONENTS);
  for (const component of selected) if (!REALISM_COMPONENTS.includes(component)) throw new TypeError(`Unknown realism component ${component}`);
  const preset = REALISM_TIERS[name], use = component => selected.has(component);
  const tier = preset && {pores: use('pores') ? preset.pores : 0, scatter: use('scatter') ? preset.scatter : [0, 0, 0], sheen: use('sheen') ? preset.sheen : null,
    cornea: preset.cornea && use('cornea'), coverage: preset.coverage && use('coverage'), hairColor: preset.hairColor && use('hairColor')};
  if (!use('roughness')) textures = null;
  const owned = {geometries: new Set(), materials: new Set(), objects: new Set(), textures: new Set(), originalGeometries: new Map()};
  const savedMaterials = new Map();
  const changedProperties = ['map', 'normalMap', 'normalScale', 'roughnessMap', 'roughness', 'sheen', 'sheenColor', 'sheenRoughness', 'onBeforeCompile', 'customProgramCacheKey', 'alphaToCoverage', 'alphaTest'];
  const report = {tier: tier ? name : 'off', version: CHARACTER_REALISM_VERSION, components: tier ? REALISM_COMPONENTS.filter(use) : [],
    skin: 0, cornea: 0, hair: 0, brows: 0, lashes: 0, unsupported: []};
  if (!tier) return {report, dispose() {}};
  const skinSelected = SKIN_COMPONENTS.some(use);
  const meshes = [];
  rig.model.traverse(object => { if (object.isMesh) meshes.push(object); });
  const reverse = new Map([...rig.materials].map(([original, material]) => [material, original]));
  for (const mesh of meshes) {
    const material = mesh.material, original = reverse.get(material), name = original?.name ?? material.name ?? '';
    if (Array.isArray(material) || !original) continue;
    if (!savedMaterials.has(material)) savedMaterials.set(material, Object.fromEntries(changedProperties.map(key => [key, material[key]])));
    if (SKIN.test(name)) {
      if (!skinSelected) continue;
      if (upgradeSkin(material, tier, textures)) { report.skin++; if (use('roughness') && !textures?.roughness) report.unsupported.push(`roughness:${name}`); }
      else report.unsupported.push(`skin:${name}`);
    }
    else if (EYES.test(mesh.name)) { if (tier.cornea) { if (splitCornea(mesh, owned, alphaAt)) report.cornea++; else report.unsupported.push(`cornea:${mesh.name}`); } }
    else if (!tier.coverage && !tier.hairColor) continue;
    else if (BROWS.test(mesh.name) || /brows$/i.test(name)) { coverageCards(material, original, tier, false, owned); report.brows++; }
    else if (LASHES.test(mesh.name)) { coverageCards(material, original, tier, false, owned); report.lashes++; }
    else if (HAIR.test(mesh.name) || HAIR.test(name)) { coverageCards(material, original, tier, true, owned); report.hair++; }
  }
  let disposed = false;
  return {report, dispose() {
    if (disposed) return;
    disposed = true;
    for (const [mesh, geometry] of owned.originalGeometries) mesh.geometry = geometry;
    for (const [material, properties] of savedMaterials) { Object.assign(material, properties); material.needsUpdate = true; }
    for (const texture of owned.textures) texture.dispose();
    for (const object of owned.objects) object.removeFromParent();
    for (const geometry of owned.geometries) geometry.dispose();
    for (const material of owned.materials) material.dispose();
  }};
}
