// Development probe for resource journeys: what the figures drawn right now alone hold on the GPU.
// A resident figure comes and goes as residents walk (resident-figures.js), so raw renderer counts
// swing with who is near. Only a figure actually shown counts, and anything else drawn that uses a
// resource keeps it counted. A hidden object that shares one does not: avatars are clones of one
// template per appearance (avatars.js instantiateAvatar), and a hidden avatar holder or boutique
// guest wearing a resident's look shares its geometry without drawing it, so only the figure
// uploaded it, and removing the figure frees it (part of a world-streaming failure on 2026-11-07).
// An object hidden after it was drawn keeps its upload until disposed, so at most what a
// shown figure shares with it is excused, and only while that figure is shown.
// The renderer adds its disposal listeners to each geometry, texture, material and bone texture on first
// draw, so a figure walking in also steps a listener count (graphics-recovery). Materials are tracked
// for those listeners only.
// A bone texture is a GPU texture as well: three creates one per skeleton on its first draw. Every
// avatar has two, a 16x16 for the body skeleton its parts share (avatar-skeletons.js) and a 4x4 for its
// two-bone gaze skeleton (eye-tracking.js). Counted only for listeners, they left two textures per
// shown figure in the world-streaming texture bound (a GL-level trace on 2026-11-07, 87 of 88 samples).
// A texture counts only once three has uploaded it, which is when it adds its disposal listener
// (WebGLTextures initTexture): one never uploaded is not in the renderer's count, so excusing it would
// make room for a retained texture. The same trace had a lap's two figures credited with 5 material textures
// while none of their figure-only textures had been uploaded.
const texturesOf = material => Object.values(material).filter(value => value?.isTexture);
const listenersOf = resource => Object.values(resource._listeners ?? {}).reduce((sum, list) => sum + list.length, 0);
const resourceSets = () => ({ geometries: new Set(), textures: new Set(), materials: new Set(), bones: new Set() });
const add = (object, sets) => {
  if (object.geometry) sets.geometries.add(object.geometry);
  if (object.skeleton?.boneTexture) sets.bones.add(object.skeleton.boneTexture);
  for (const material of [object.material].flat()) if (material) {
    sets.materials.add(material);
    for (const texture of texturesOf(material)) sets.textures.add(texture);
  }
};

function collectShown(object, sets) {
  if (!object.visible) return;
  add(object, sets);
  for (const child of object.children) collectShown(child, sets);
}

function collectRest(object, sets, figures) {
  if (figures.has(object) || !object.visible) return;
  add(object, sets);
  for (const child of object.children) collectRest(child, sets, figures);
}

export function exclusiveResources(scene, figures) {
  const shown = figures.filter(figure => figure.visible);
  const own = resourceSets(), rest = resourceSets();
  for (const figure of shown) collectShown(figure, own);
  collectRest(scene, rest, new Set(figures));
  const only = kind => [...own[kind]].filter(item => !rest[kind].has(item));
  const listeners = ['geometries', 'textures', 'materials', 'bones'].flatMap(only).reduce((sum, resource) => sum + listenersOf(resource), 0);
  const textures = [...only('textures'), ...only('bones')].filter(texture => listenersOf(texture) > 0).length;
  return { figures: shown.length, geometries: only('geometries').length, textures, listeners };
}
