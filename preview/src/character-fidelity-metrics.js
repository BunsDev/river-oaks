// What a character costs, counted the same way in Node tests and in the browser
// fixture (#517). Census numbers describe the scene graph; they are not GPU
// measurements. Timing comes from the fixture's frame sampler.

// Nearest-rank percentiles; an empty sample is reported as such, never as zero.
export function distributionOf(samples) {
  const values = samples.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return {count: 0, min: null, p50: null, p95: null, max: null, mean: null};
  const rank = p => values[Math.min(values.length - 1, Math.max(0, Math.ceil(p / 100 * values.length) - 1))];
  const round = value => Math.round(value * 1000) / 1000;
  return {count: values.length, min: round(values[0]), p50: round(rank(50)), p95: round(rank(95)), max: round(values.at(-1)),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length)};
}

const MIPMAP_FILTERS = new Set([1004, 1005, 1007, 1008]); // Nearest/Linear MipMap Nearest/Linear
const TYPE_BYTES = {1009: 1, 1010: 1, 1016: 2, 1015: 4}; // Unsigned byte, byte, half float, float

function imageSize(image) {
  if (!image) return null;
  const width = image.naturalWidth ?? image.videoWidth ?? image.width, height = image.naturalHeight ?? image.videoHeight ?? image.height;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? {width, height} : null;
}

// Estimated GPU bytes for one texture: four channels per texel (WebGL stores RGB
// as RGBA), times the component size, plus a third for a generated mip chain.
// Compressed textures report the bytes of the mip levels they carry.
export function textureBytes(texture) {
  if (texture.isCompressedTexture) {
    const levels = texture.mipmaps?.length ? texture.mipmaps : [texture.image];
    const size = imageSize(levels[0]);
    return {...size, bytes: levels.reduce((sum, level) => sum + (level?.data?.byteLength ?? 0), 0), compressed: true};
  }
  const size = imageSize(texture.image);
  if (!size) return {width: null, height: null, bytes: 0, compressed: false};
  const base = size.width * size.height * 4 * (TYPE_BYTES[texture.type] ?? 1);
  const mipmapped = texture.generateMipmaps && MIPMAP_FILTERS.has(texture.minFilter);
  return {...size, bytes: Math.round(mipmapped ? base * 4 / 3 : base), compressed: false};
}

function texturesOf(material) {
  const found = [];
  for (const [slot, value] of Object.entries(material)) if (value?.isTexture) found.push([slot, value]);
  for (const [slot, uniform] of Object.entries(material.uniforms ?? {})) if (uniform?.value?.isTexture) found.push([`uniforms.${slot}`, uniform.value]);
  return found;
}

function attributeBytes(attribute) {
  return attribute?.array?.byteLength ?? 0;
}

function geometryBytes(geometry) {
  let bytes = attributeBytes(geometry.index);
  for (const attribute of Object.values(geometry.attributes)) bytes += attributeBytes(attribute);
  for (const list of Object.values(geometry.morphAttributes)) for (const attribute of list) bytes += attributeBytes(attribute);
  return bytes;
}

function triangles(geometry) {
  const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = Number.isFinite(geometry.drawRange.count) ? Math.min(count, geometry.drawRange.count) : count;
  return Math.floor(range / 3);
}

// One pass over the visible scene graph. Draw calls are an estimate for the main
// pass only (one per mesh, or one per material group); shadow passes add more.
export function sceneCensus(root) {
  const geometries = new Set(), materials = new Set(), skeletons = new Set(), textures = new Map(), types = {};
  const census = {meshes: 0, skinnedMeshes: 0, drawCalls: 0, triangles: 0, morphTargets: 0, maxMorphTargets: 0,
    alphaTested: 0, transparent: 0, doubleSided: 0};
  root.traverseVisible(object => {
    if (!object.isMesh) return;
    census.meshes++;
    const list = [object.material].flat(), geometry = object.geometry;
    census.drawCalls += Array.isArray(object.material) && geometry.groups.length ? geometry.groups.length : 1;
    census.triangles += triangles(geometry);
    if (object.isSkinnedMesh) { census.skinnedMeshes++; skeletons.add(object.skeleton); }
    const morphs = geometry.morphAttributes.position?.length ?? 0;
    census.maxMorphTargets = Math.max(census.maxMorphTargets, morphs);
    if (!geometries.has(geometry)) census.morphTargets += morphs;
    geometries.add(geometry);
    for (const material of list) {
      if (materials.has(material)) continue;
      materials.add(material); types[material.type] = (types[material.type] ?? 0) + 1;
      if (material.alphaTest > 0) census.alphaTested++;
      if (material.transparent) census.transparent++;
      if (material.side === 2) census.doubleSided++;
      for (const [slot, texture] of texturesOf(material)) if (!textures.has(texture)) textures.set(texture, {slot, name: texture.name || '', ...textureBytes(texture)});
    }
  });
  const textureList = [...textures.values()].sort((a, b) => b.bytes - a.bytes);
  return {...census, materials: materials.size, materialTypes: types, geometries: geometries.size,
    geometryBytes: [...geometries].reduce((sum, geometry) => sum + geometryBytes(geometry), 0),
    skeletons: skeletons.size, bones: [...skeletons].reduce((sum, skeleton) => sum + skeleton.bones.length, 0),
    textures: textureList.length, textureBytes: textureList.reduce((sum, texture) => sum + texture.bytes, 0), textureList};
}

// renderer.info snapshot for load/dispose leak checks.
export function rendererMemory(renderer) {
  return {geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0};
}
export function memoryDelta(before, after) {
  return Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
}
